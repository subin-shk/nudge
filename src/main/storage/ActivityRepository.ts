/**
 * Activity log + rollup arithmetic.
 *
 * Write path: `record()` appends an immutable event AND folds it into today's
 * `DailyStats` row. Both land in the same adapter, so a SQLite backend can wrap
 * the pair in a transaction; the JSON backend gets equivalent safety from the
 * append-only log (the rollup is derivable, the log is not).
 *
 * Read path: everything the UI asks for is answered from rollups — one small
 * object per day. Raw events are only read when repairing a rollup.
 */

import { EventEmitter } from 'node:events'
import type { ActivityEvent, ActivityEventType, DailyStats } from '@shared/types'
import { bump, createId } from '@shared/util'
import { dayKeyRange, toDayKey } from '@shared/time'
import { createLogger } from '../util/logger'
import { META_KEYS, type StorageAdapter } from './StorageAdapter'

const log = createLogger('activity')

/** Resolves the configured daily goal for a reminder kind. 0 = untracked. */
export type GoalProvider = (kind: string) => number

export interface RecordEventInput {
  type: ActivityEventType
  kind: string
  at?: number
  durationSeconds?: number
  meta?: Record<string, string | number | boolean>
}

export interface LifetimeTotals {
  focusSeconds: number
  completed: Record<string, number>
  skipped: Record<string, number>
  pomodoros: number
  activeDays: number
  perfectDays: number
  firstDay: string | null
  /** Days on which anything at all happened — the streak input. */
  activeDayKeys: string[]
}

export function emptyDailyStats(day: string): DailyStats {
  return { day, focusSeconds: 0, completed: {}, skipped: {}, pomodoros: 0, goalsMet: [] }
}

/** Did anything happen on this day? Drives streaks and the activity calendar. */
export function isActiveDay(stats: DailyStats): boolean {
  if (stats.focusSeconds > 0) return true
  for (const count of Object.values(stats.completed)) if (count > 0) return true
  return false
}

export class ActivityRepository {
  private readonly emitter = new EventEmitter()
  /** Today's row, kept hot because it is read on every runtime tick. */
  private todayCache: DailyStats | null = null
  private todayKey = toDayKey()
  private lifetimeCache: LifetimeTotals | null = null

  constructor(
    private readonly storage: StorageAdapter,
    private readonly goalProvider: GoalProvider
  ) {}

  async init(): Promise<void> {
    this.todayKey = toDayKey()
    this.todayCache = await this.loadDay(this.todayKey)

    const firstDay = await this.storage.readMeta<string>(META_KEYS.firstActiveDay)
    if (!firstDay) {
      const all = await this.storage.readAllDailyStats()
      const earliest = all.find(isActiveDay)?.day ?? null
      if (earliest) await this.storage.writeMeta(META_KEYS.firstActiveDay, earliest)
    }
  }

  onChange(listener: (day: DailyStats) => void): () => void {
    this.emitter.on('change', listener)
    return () => this.emitter.off('change', listener)
  }

  private async loadDay(dayKey: string): Promise<DailyStats> {
    const [row] = await this.storage.readDailyStats([dayKey])
    return row ?? emptyDailyStats(dayKey)
  }

  /**
   * Roll the day over if the wall clock crossed midnight.
   * Called from the runtime tick, so the dashboard resets on its own overnight.
   */
  async ensureToday(now: number = Date.now()): Promise<DailyStats> {
    const key = toDayKey(now)
    if (key !== this.todayKey || !this.todayCache) {
      this.todayKey = key
      this.todayCache = await this.loadDay(key)
      this.lifetimeCache = null
      log.info('day rolled over', { day: key })
      this.emitter.emit('change', this.todayCache)
    }
    return this.todayCache
  }

  getTodaySync(): DailyStats {
    return this.todayCache ?? emptyDailyStats(this.todayKey)
  }

  /**
   * Append an event and fold it into its day's rollup.
   *
   * Returns the newly-met goal kind when this event *just* completed a daily
   * goal, so the caller can celebrate exactly once.
   */
  async record(input: RecordEventInput): Promise<{ event: ActivityEvent; goalJustMet: string | null }> {
    const at = input.at ?? Date.now()
    const day = toDayKey(at)

    const event: ActivityEvent = {
      id: createId('ev'),
      type: input.type,
      kind: input.kind,
      at,
      day,
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
      ...(input.meta ? { meta: input.meta } : {})
    }

    await this.storage.appendEvents([event])

    // Late events (a session that started before midnight and ended after) must
    // land on their own day, not on the cached "today".
    const isToday = day === this.todayKey
    const row = isToday ? await this.ensureToday(at) : await this.loadDay(day)

    const goalJustMet = applyEventToStats(row, event, this.goalProvider)

    await this.storage.writeDailyStats([row])
    if (isToday) this.todayCache = row
    this.lifetimeCache = null

    const firstDay = await this.storage.readMeta<string>(META_KEYS.firstActiveDay)
    if (!firstDay && isActiveDay(row)) await this.storage.writeMeta(META_KEYS.firstActiveDay, day)

    this.emitter.emit('change', row)
    return { event, goalJustMet }
  }

  async getDays(dayKeys: string[]): Promise<DailyStats[]> {
    const stored = await this.storage.readDailyStats(dayKeys)
    const byDay = new Map(stored.map((row) => [row.day, row]))
    // Return a dense series: charts need a bar for every day, including zeros.
    return dayKeys.map((day) => byDay.get(day) ?? emptyDailyStats(day))
  }

  async getRange(from: string, to: string): Promise<DailyStats[]> {
    return this.getDays(dayKeyRange(from, to))
  }

  async getLifetime(): Promise<LifetimeTotals> {
    if (this.lifetimeCache) return this.lifetimeCache

    const all = await this.storage.readAllDailyStats()
    const totals: LifetimeTotals = {
      focusSeconds: 0,
      completed: {},
      skipped: {},
      pomodoros: 0,
      activeDays: 0,
      perfectDays: 0,
      firstDay: null,
      activeDayKeys: []
    }

    for (const row of all) {
      totals.focusSeconds += row.focusSeconds
      totals.pomodoros += row.pomodoros
      for (const [kind, count] of Object.entries(row.completed)) bump(totals.completed, kind, count)
      for (const [kind, count] of Object.entries(row.skipped)) bump(totals.skipped, kind, count)
      if (isActiveDay(row)) {
        totals.activeDays++
        totals.activeDayKeys.push(row.day)
        totals.firstDay ??= row.day
      }
      if (isPerfectDay(row, this.goalProvider)) totals.perfectDays++
    }

    this.lifetimeCache = totals
    return totals
  }

  /**
   * Rebuild a day's rollup from its raw events.
   * The recovery path for a rollup file that was damaged or hand-edited.
   */
  async repairDay(dayKey: string): Promise<DailyStats> {
    const events = await this.storage.readEventsForDays([dayKey])
    const rebuilt = emptyDailyStats(dayKey)
    for (const event of events.sort((a, b) => a.at - b.at)) {
      applyEventToStats(rebuilt, event, this.goalProvider)
    }
    await this.storage.writeDailyStats([rebuilt])
    if (dayKey === this.todayKey) this.todayCache = rebuilt
    this.lifetimeCache = null
    log.info('rollup repaired', { day: dayKey, events: events.length })
    return rebuilt
  }

  /**
   * Re-evaluate `goalsMet` across a window without touching counts.
   * Needed when a user lowers a daily goal: days already above the new target
   * should read as met, and the streak should reflect that immediately.
   */
  async reevaluateGoals(dayKeys: string[]): Promise<void> {
    const rows = await this.storage.readDailyStats(dayKeys)
    const updated: DailyStats[] = []

    for (const row of rows) {
      const recomputed = Object.keys(row.completed).filter((kind) => {
        const goal = this.goalProvider(kind)
        return goal > 0 && (row.completed[kind] ?? 0) >= goal
      })
      if (recomputed.sort().join(',') !== [...row.goalsMet].sort().join(',')) {
        updated.push({ ...row, goalsMet: recomputed })
      }
    }

    if (updated.length > 0) {
      await this.storage.writeDailyStats(updated)
      this.lifetimeCache = null
      const today = updated.find((row) => row.day === this.todayKey)
      if (today) {
        this.todayCache = today
        this.emitter.emit('change', today)
      }
    }
  }

  async clear(): Promise<void> {
    await this.storage.clearActivity()
    this.todayCache = emptyDailyStats(this.todayKey)
    this.lifetimeCache = null
    await this.storage.writeMeta(META_KEYS.firstActiveDay, null)
    await this.storage.writeMeta(META_KEYS.achievementUnlocks, {})
    this.emitter.emit('change', this.todayCache)
  }

  /** Drop raw events older than `retentionDays`. Rollups are never pruned. */
  async pruneOldEvents(retentionDays: number): Promise<void> {
    const cutoff = dayKeyRange(toDayKey(Date.now() - retentionDays * 86_400_000), toDayKey())[0]
    if (cutoff) await this.storage.pruneEventsBefore(cutoff)
  }

  async getAchievementUnlocks(): Promise<Record<string, number>> {
    return (await this.storage.readMeta<Record<string, number>>(META_KEYS.achievementUnlocks)) ?? {}
  }

  async setAchievementUnlocks(unlocks: Record<string, number>): Promise<void> {
    await this.storage.writeMeta(META_KEYS.achievementUnlocks, unlocks)
  }
}

/**
 * Fold one event into a stats row, mutating it in place.
 * Returns the reminder kind whose goal was met *by this event*, else null.
 *
 * Exported for tests: this is the only place event semantics are defined, so it
 * is worth pinning down directly.
 */
export function applyEventToStats(row: DailyStats, event: ActivityEvent, goalProvider: GoalProvider): string | null {
  switch (event.type) {
    case 'reminder_completed': {
      bump(row.completed, event.kind)
      const goal = goalProvider(event.kind)
      const count = row.completed[event.kind] ?? 0
      if (goal > 0 && count >= goal && !row.goalsMet.includes(event.kind)) {
        row.goalsMet.push(event.kind)
        return event.kind
      }
      return null
    }

    case 'reminder_skipped':
    case 'reminder_missed':
      bump(row.skipped, event.kind)
      return null

    case 'focus_completed':
    case 'focus_aborted':
      // Aborted sessions still count the time actually spent focusing; the
      // alternative teaches users that stopping early erases their work.
      row.focusSeconds += Math.max(0, Math.round(event.durationSeconds ?? 0))
      return null

    case 'pomodoro_completed':
      row.pomodoros += 1
      return null

    // 'reminder_fired', 'reminder_snoozed' and 'focus_started' are recorded for
    // the audit trail but contribute nothing to the aggregates.
    default:
      return null
  }
}

/** Every kind with a configured goal reached it, and there was ≥1 such kind. */
export function isPerfectDay(row: DailyStats, goalProvider: GoalProvider): boolean {
  const tracked = new Set<string>()
  for (const kind of Object.keys(row.completed)) if (goalProvider(kind) > 0) tracked.add(kind)
  for (const kind of row.goalsMet) if (goalProvider(kind) > 0) tracked.add(kind)
  if (tracked.size === 0) return false

  for (const kind of tracked) {
    const goal = goalProvider(kind)
    if ((row.completed[kind] ?? 0) < goal) return false
  }
  return true
}
