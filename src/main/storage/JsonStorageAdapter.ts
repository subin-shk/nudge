/**
 * The shipped storage backend: plain files on disk.
 *
 * Layout under `<userData>/data/`:
 *
 *   settings.json                 whole settings document (atomic replace)
 *   meta.json                     small key/value map (atomic replace)
 *   events/2026-07.ndjson         append-only event log, sharded by month
 *   rollups/2026-07.json          { "2026-07-31": DailyStats, … }
 *
 * Why this shape rather than one big JSON blob:
 *
 *   • Appends are O(1). Logging an event never rewrites history, so the hot
 *     path (a reminder completing) costs one `appendFile`.
 *   • Month sharding bounds every read. Rendering a 30-day chart touches at
 *     most two rollup files, never the whole archive.
 *   • Rollups are derived, so a damaged rollup file is repaired by replaying
 *     that month's events instead of being a data-loss event.
 *   • Raw events can be pruned (default: 400 days) while rollups — the thing
 *     charts and streaks actually read — are kept forever and stay tiny
 *     (~150 bytes/day ≈ 55 KB/year).
 *
 * Writes are coalesced through a serial queue so a burst of setting changes
 * results in one disk write, and two writes never interleave.
 */

import { join } from 'node:path'
import type { ActivityEvent, DailyStats } from '@shared/types'
import { appendLine, ensureDir, listFiles, readJson, readNdjson, removeIfExists, writeJsonAtomic } from '../util/fsAtomic'
import { createLogger } from '../util/logger'
import type { StorageAdapter } from './StorageAdapter'

const log = createLogger('storage:json')

/** `'2026-07-31'` → `'2026-07'` */
const shardOf = (dayKey: string): string => dayKey.slice(0, 7)

type RollupShard = Record<string, DailyStats>

export interface JsonStorageOptions {
  /** Root data directory, normally `app.getPath('userData')/data`. */
  directory: string
  /** Debounce window for coalescing rollup/meta writes. */
  flushDelayMs?: number
}

export class JsonStorageAdapter implements StorageAdapter {
  private readonly root: string
  private readonly eventsDir: string
  private readonly rollupsDir: string
  private readonly settingsPath: string
  private readonly metaPath: string
  private readonly flushDelayMs: number

  /** Loaded rollup shards, keyed by 'YYYY-MM'. Write-through cache. */
  private rollupCache = new Map<string, RollupShard>()
  private dirtyShards = new Set<string>()

  private metaCache: Record<string, unknown> | null = null
  private metaDirty = false

  private flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Serialises all writes; every mutation chains onto this promise. */
  private writeChain: Promise<void> = Promise.resolve()
  private closed = false

  constructor(options: JsonStorageOptions) {
    this.root = options.directory
    this.eventsDir = join(this.root, 'events')
    this.rollupsDir = join(this.root, 'rollups')
    this.settingsPath = join(this.root, 'settings.json')
    this.metaPath = join(this.root, 'meta.json')
    this.flushDelayMs = options.flushDelayMs ?? 400
  }

  async init(): Promise<void> {
    await ensureDir(this.root)
    await ensureDir(this.eventsDir)
    await ensureDir(this.rollupsDir)
    this.metaCache = (await readJson<Record<string, unknown>>(this.metaPath)) ?? {}
    log.info('initialised', { root: this.root })
  }

  async readSettingsDocument(): Promise<unknown | null> {
    return readJson<unknown>(this.settingsPath)
  }

  async writeSettingsDocument(document: unknown): Promise<void> {
    // Settings write straight through rather than via the debounce queue: the
    // user just clicked something, and losing that on a crash is unacceptable.
    await this.enqueue(() => writeJsonAtomic(this.settingsPath, document))
  }

  async appendEvents(events: ActivityEvent[]): Promise<void> {
    if (events.length === 0) return

    // Group by month shard so a batch spanning midnight-of-the-month still
    // costs one append per file.
    const byShard = new Map<string, string[]>()
    for (const event of events) {
      const shard = shardOf(event.day)
      const lines = byShard.get(shard) ?? []
      lines.push(JSON.stringify(event))
      byShard.set(shard, lines)
    }

    await this.enqueue(async () => {
      for (const [shard, lines] of byShard) {
        await appendLine(join(this.eventsDir, `${shard}.ndjson`), lines.join('\n'))
      }
    })
  }

  async readEventsForDays(dayKeys: string[]): Promise<ActivityEvent[]> {
    const wanted = new Set(dayKeys)
    const shards = new Set([...wanted].map(shardOf))
    const out: ActivityEvent[] = []

    for (const shard of shards) {
      const events = await readNdjson<ActivityEvent>(join(this.eventsDir, `${shard}.ndjson`))
      for (const event of events) {
        if (wanted.has(event.day)) out.push(event)
      }
    }
    return out
  }

  private async loadShard(shard: string): Promise<RollupShard> {
    const cached = this.rollupCache.get(shard)
    if (cached) return cached
    const loaded = (await readJson<RollupShard>(join(this.rollupsDir, `${shard}.json`))) ?? {}
    this.rollupCache.set(shard, loaded)
    return loaded
  }

  async readDailyStats(dayKeys: string[]): Promise<DailyStats[]> {
    const out: DailyStats[] = []
    const shards = new Set(dayKeys.map(shardOf))
    const loaded = new Map<string, RollupShard>()
    for (const shard of shards) loaded.set(shard, await this.loadShard(shard))

    for (const day of dayKeys) {
      const row = loaded.get(shardOf(day))?.[day]
      if (row) out.push(row)
    }
    return out
  }

  async writeDailyStats(rows: DailyStats[]): Promise<void> {
    for (const row of rows) {
      const shard = shardOf(row.day)
      const data = await this.loadShard(shard)
      data[row.day] = row
      this.dirtyShards.add(shard)
    }
    this.scheduleFlush()
  }

  async readAllDailyStats(): Promise<DailyStats[]> {
    // Make sure anything still sitting in the debounce window is on disk before
    // we read the directory, or lifetime totals can lag by a few hundred ms.
    await this.flush()

    const files = await listFiles(this.rollupsDir)
    const shards = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

    const out: DailyStats[] = []
    for (const shard of shards) {
      const data = await this.loadShard(shard)
      for (const day of Object.keys(data).sort()) {
        const row = data[day]
        if (row) out.push(row)
      }
    }
    return out
  }

  async readMeta<T>(key: string): Promise<T | null> {
    if (!this.metaCache) this.metaCache = (await readJson<Record<string, unknown>>(this.metaPath)) ?? {}
    const value = this.metaCache[key]
    return value === undefined ? null : (value as T)
  }

  async writeMeta(key: string, value: unknown): Promise<void> {
    if (!this.metaCache) this.metaCache = (await readJson<Record<string, unknown>>(this.metaPath)) ?? {}
    this.metaCache[key] = value
    this.metaDirty = true
    this.scheduleFlush()
  }

  async clearActivity(): Promise<void> {
    this.cancelFlush()
    this.rollupCache.clear()
    this.dirtyShards.clear()

    await this.enqueue(async () => {
      await removeIfExists(this.eventsDir)
      await removeIfExists(this.rollupsDir)
      await ensureDir(this.eventsDir)
      await ensureDir(this.rollupsDir)
    })
    log.info('activity cleared')
  }

  async pruneEventsBefore(dayKey: string): Promise<void> {
    const cutoffShard = shardOf(dayKey)
    const files = await listFiles(this.eventsDir)
    const stale = files.filter((file) => {
      const shard = file.replace(/\.ndjson$/, '')
      // Whole-shard granularity: only drop months strictly before the cutoff's
      // month, so the cutoff month itself is never partially truncated.
      return file.endsWith('.ndjson') && shard < cutoffShard
    })

    if (stale.length === 0) return
    await this.enqueue(async () => {
      for (const file of stale) await removeIfExists(join(this.eventsDir, file))
    })
    log.info('pruned raw event shards', { count: stale.length, before: cutoffShard })
  }

  async close(): Promise<void> {
    this.closed = true
    await this.flush()
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    // Chain rather than run concurrently: two atomic renames onto the same path
    // can otherwise race, and the loser silently wins.
    this.writeChain = this.writeChain.then(task).catch((error) => {
      log.error('write failed', error)
    })
    return this.writeChain
  }

  private scheduleFlush(): void {
    if (this.closed) {
      void this.flush()
      return
    }
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, this.flushDelayMs)
  }

  private cancelFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  /** Persist every dirty shard and the meta map. Safe to call at any time. */
  async flush(): Promise<void> {
    this.cancelFlush()

    const shards = [...this.dirtyShards]
    this.dirtyShards.clear()
    const flushMeta = this.metaDirty
    this.metaDirty = false

    if (shards.length === 0 && !flushMeta) {
      await this.writeChain
      return
    }

    await this.enqueue(async () => {
      for (const shard of shards) {
        const data = this.rollupCache.get(shard)
        if (data) await writeJsonAtomic(join(this.rollupsDir, `${shard}.json`), data)
      }
      if (flushMeta && this.metaCache) {
        await writeJsonAtomic(this.metaPath, this.metaCache)
      }
    })
  }
}
