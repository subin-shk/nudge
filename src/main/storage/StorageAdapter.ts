/**
 * The storage seam.
 *
 * Everything above this interface — repositories, services, IPC, UI — is
 * unaware of *how* data is persisted. That is the whole point: the shipped
 * implementation is `JsonStorageAdapter` (no native modules, no compiler
 * toolchain, works on every platform Electron does), and a SQLite adapter can
 * be dropped in later by satisfying these eleven methods.
 *
 * The method set is intentionally shaped like SQL:
 *
 *   settings        ← one row  (key/value document)
 *   activity_events ← append-only table, indexed by `day`
 *   daily_stats     ← materialised view, one row per day, upsert semantics
 *   meta            ← small key/value table (schema version, unlock timestamps)
 *
 * See docs/STORAGE.md for the equivalent DDL and the migration recipe.
 */

import type { ActivityEvent, DailyStats } from '@shared/types'

export interface StorageAdapter {
  /** Create directories/tables. Must be idempotent. */
  init(): Promise<void>

  readSettingsDocument(): Promise<unknown | null>
  writeSettingsDocument(document: unknown): Promise<void>

  appendEvents(events: ActivityEvent[]): Promise<void>
  /** All events whose `day` is in `dayKeys`. Order is not guaranteed. */
  readEventsForDays(dayKeys: string[]): Promise<ActivityEvent[]>

  readDailyStats(dayKeys: string[]): Promise<DailyStats[]>
  /** Upsert by `day`. */
  writeDailyStats(rows: DailyStats[]): Promise<void>
  /** Every rollup ever written, oldest first. Used for lifetime totals/streaks. */
  readAllDailyStats(): Promise<DailyStats[]>

  readMeta<T>(key: string): Promise<T | null>
  writeMeta(key: string, value: unknown): Promise<void>

  /** Delete every event and rollup. Settings and meta survive. */
  clearActivity(): Promise<void>
  /** Drop raw events older than `dayKey`; rollups are kept forever. */
  pruneEventsBefore(dayKey: string): Promise<void>
  /** Flush pending writes and release handles. */
  close(): Promise<void>
}

/** Meta keys, centralised so a typo cannot silently create a second key. */
export const META_KEYS = {
  /** Storage schema version, distinct from the settings schema version. */
  storageVersion: 'storageVersion',
  /** achievementId → epoch ms of unlock. */
  achievementUnlocks: 'achievementUnlocks',
  /** First day the app ever recorded activity, for "since {date}". */
  firstActiveDay: 'firstActiveDay',
  /** Last day rollups were verified — lets startup repair only what it must. */
  lastRollupDay: 'lastRollupDay'
} as const
