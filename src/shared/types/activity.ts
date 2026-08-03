/**
 * The activity log and its rollups.
 *
 * Storage strategy (see docs/STORAGE.md for the full rationale):
 *   • `ActivityEvent` is an append-only fact — it is never mutated.
 *   • `DailyStats` is a *derived* rollup, recomputed from events for the days
 *     that changed. Because it is derived, a corrupted rollup is always
 *     recoverable by replaying the log.
 *
 * This shape is deliberately relational (one flat table of events, one table of
 * daily aggregates) so the JSON adapter can be swapped for SQLite without any
 * changes above the repository layer.
 */

export type ActivityEventType =
  | 'reminder_fired' // shown to the user
  | 'reminder_completed' // break finished / acknowledged
  | 'reminder_skipped'
  | 'reminder_snoozed'
  | 'reminder_missed' // fired but never acknowledged before the next one
  | 'focus_started'
  | 'focus_completed'
  | 'focus_aborted'
  | 'pomodoro_completed'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  /** ReminderKind for reminder events; 'focus' for timer events. */
  kind: string
  /** Epoch milliseconds. */
  at: number
  /** Local calendar day, 'YYYY-MM-DD'. Denormalised so rollups never re-derive TZ. */
  day: string
  /** Focus sessions and completed breaks record their length here. */
  durationSeconds?: number
  meta?: Record<string, string | number | boolean>
}

/** One row per local day. The unit the dashboard and charts read from. */
export interface DailyStats {
  day: string
  /** Seconds of *completed* focus time (partial sessions count what elapsed). */
  focusSeconds: number
  /** kind → count of completed reminders. */
  completed: Record<string, number>
  /** kind → count of skipped reminders. */
  skipped: Record<string, number>
  pomodoros: number
  /** Reminder kinds whose daily goal was reached on this day. */
  goalsMet: string[]
}

export interface StreakInfo {
  /** Consecutive qualifying days ending today (or yesterday, if today is young). */
  current: number
  best: number
  /** Consecutive qualifying ISO weeks. */
  currentWeeks: number
  /** True when today already qualifies — used to render the flame as "safe". */
  todayQualifies: boolean
}

export interface RangeSummary {
  from: string
  to: string
  days: DailyStats[]
  totals: {
    focusSeconds: number
    completed: Record<string, number>
    skipped: Record<string, number>
    pomodoros: number
    activeDays: number
  }
}

export type AchievementTier = 'bronze' | 'silver' | 'gold'

export interface AchievementDefinition {
  id: string
  /** i18n key for the title. */
  titleKey: string
  descriptionKey: string
  icon: string
  tier: AchievementTier
  /** The metric this badge watches. */
  metric: 'focusHoursTotal' | 'completedTotal' | 'streakDays' | 'streakWeeks' | 'perfectDays'
  /** Only for `completedTotal`: restrict to one reminder kind. */
  kind?: string
  threshold: number
}

export interface AchievementProgress {
  id: string
  unlockedAt: number | null
  /** Current value of the watched metric, for the progress bar. */
  value: number
  threshold: number
}
