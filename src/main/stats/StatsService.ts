/**
 * Statistics, streaks and badge evaluation.
 *
 * All numbers the UI shows come from here, so definitions live in exactly one
 * place. The two that are easy to get subtly wrong:
 *
 *   • **A qualifying day** (for streaks) is any day with focus time *or* at
 *     least one completed reminder. Requiring every goal to be met would make
 *     the streak a punishment; requiring nothing would make it meaningless.
 *
 *   • **Follow-through** is completed ÷ (completed + skipped). Reminders that
 *     were never delivered — quiet hours, DND, machine asleep — are excluded,
 *     because you cannot fail to act on something you were never shown.
 */

import { EventEmitter } from 'node:events'
import type { AchievementProgress, DailyStats, RangeSummary, StreakInfo } from '@shared/types'
import { evaluateAchievements, type AchievementMetrics } from '@shared/achievements'
import { computeDayStreak, computeWeekStreak, lastNDays, toDayKey } from '@shared/time'
import { bump } from '@shared/util'
import { createLogger } from '../util/logger'
import { isActiveDay, type ActivityRepository } from '../storage/ActivityRepository'
import type { SettingsRepository } from '../storage/SettingsRepository'

const log = createLogger('stats')

export class StatsService {
  private readonly emitter = new EventEmitter()
  /** Ids already announced this session, so a badge toasts exactly once. */
  private announced = new Set<string>()

  constructor(
    private readonly activity: ActivityRepository,
    private readonly settings: SettingsRepository
  ) {}

  /** Fires when a badge crosses its threshold. */
  onAchievementUnlocked(listener: (achievementId: string) => void): () => void {
    this.emitter.on('unlocked', listener)
    return () => this.emitter.off('unlocked', listener)
  }

  async init(): Promise<void> {
    // Seed `announced` from disk so restarting the app does not re-toast every
    // badge the user already earned.
    const unlocks = await this.activity.getAchievementUnlocks()
    for (const id of Object.keys(unlocks)) this.announced.add(id)
  }

  async getRecentDays(days: number): Promise<DailyStats[]> {
    return this.activity.getDays(lastNDays(Math.max(1, Math.min(days, 400))))
  }

  async getRange(from: string, to: string): Promise<RangeSummary> {
    const days = await this.activity.getRange(from, to)

    const totals: RangeSummary['totals'] = {
      focusSeconds: 0,
      completed: {},
      skipped: {},
      pomodoros: 0,
      activeDays: 0
    }

    for (const day of days) {
      totals.focusSeconds += day.focusSeconds
      totals.pomodoros += day.pomodoros
      for (const [kind, count] of Object.entries(day.completed)) bump(totals.completed, kind, count)
      for (const [kind, count] of Object.entries(day.skipped)) bump(totals.skipped, kind, count)
      if (isActiveDay(day)) totals.activeDays++
    }

    return { from, to, days, totals }
  }

  async getStreak(now: number = Date.now()): Promise<StreakInfo> {
    const lifetime = await this.activity.getLifetime()
    // The rollup cache can lag the in-memory "today" by a tick; union them so
    // the flame lights up the instant the first break of the day completes.
    const qualifying = new Set(lifetime.activeDayKeys)
    const today = this.activity.getTodaySync()
    if (isActiveDay(today)) qualifying.add(today.day)

    const todayKey = toDayKey(now)
    const dayStreak = computeDayStreak(qualifying, todayKey)

    return {
      current: dayStreak.current,
      best: dayStreak.best,
      currentWeeks: computeWeekStreak(qualifying, todayKey),
      todayQualifies: dayStreak.todayQualifies
    }
  }

  async getLifetime(): Promise<{
    focusSeconds: number
    completed: Record<string, number>
    skipped: Record<string, number>
    activeDays: number
    firstDay: string | null
  }> {
    const lifetime = await this.activity.getLifetime()
    return {
      focusSeconds: lifetime.focusSeconds,
      completed: lifetime.completed,
      skipped: lifetime.skipped,
      activeDays: lifetime.activeDays,
      firstDay: lifetime.firstDay
    }
  }

  /** completed ÷ (completed + skipped), as a 0..1 fraction. `null` when unused. */
  static followThrough(completed: Record<string, number>, skipped: Record<string, number>): number | null {
    let done = 0
    let missed = 0
    for (const count of Object.values(completed)) done += count
    for (const count of Object.values(skipped)) missed += count
    const total = done + missed
    return total === 0 ? null : done / total
  }

  async getAchievements(now: number = Date.now()): Promise<AchievementProgress[]> {
    const lifetime = await this.activity.getLifetime()
    const streak = await this.getStreak(now)

    const metrics: AchievementMetrics = {
      focusSecondsTotal: lifetime.focusSeconds,
      completedTotals: lifetime.completed,
      streakDays: Math.max(streak.current, streak.best),
      streakWeeks: streak.currentWeeks,
      perfectDays: lifetime.perfectDays
    }

    const stored = await this.activity.getAchievementUnlocks()
    const progress = evaluateAchievements(metrics, stored, now)

    // Persist newly-unlocked timestamps, then announce them once each.
    const newlyUnlocked = progress.filter((entry) => entry.unlockedAt !== null && stored[entry.id] === undefined)
    if (newlyUnlocked.length > 0) {
      const merged = { ...stored }
      for (const entry of newlyUnlocked) merged[entry.id] = entry.unlockedAt!
      await this.activity.setAchievementUnlocks(merged)
      log.info('achievements unlocked', { ids: newlyUnlocked.map((entry) => entry.id) })
    }

    for (const entry of progress) {
      if (entry.unlockedAt !== null && !this.announced.has(entry.id)) {
        this.announced.add(entry.id)
        this.emitter.emit('unlocked', entry.id)
      }
    }

    return progress
  }

  async clear(): Promise<void> {
    await this.activity.clear()
    this.announced.clear()
    log.info('statistics cleared')
  }

  /**
   * Re-derive `goalsMet` for the recent window after the user edits a goal.
   * 90 days is far enough back to fix any streak the UI can display.
   */
  async reevaluateRecentGoals(): Promise<void> {
    await this.activity.reevaluateGoals(lastNDays(90))
  }

  /** Daily goal for a kind — the `GoalProvider` handed to the repository. */
  goalProvider = (kind: string): number => this.settings.get().reminders[kind]?.dailyGoal ?? 0

  dispose(): void {
    this.emitter.removeAllListeners()
  }
}
