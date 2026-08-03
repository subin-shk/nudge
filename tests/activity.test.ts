/**
 * Event folding, goal detection and the quiet-hours / DND predicates.
 *
 * `applyEventToStats` is the single definition of what an event *means* for the
 * numbers a user sees, so it is worth testing directly rather than through the
 * repository.
 */

import { describe, expect, it } from 'vitest'
import type { ActivityEvent, AppSettings } from '@shared/types'
import { createDefaultSettings } from '@shared/defaults'
import { applyEventToStats, emptyDailyStats, isActiveDay, isPerfectDay } from '@main/storage/ActivityRepository'
import { hasExpiredTimedDnd, isDoNotDisturbActive, isQuietHoursActive, notificationsMuted } from '@main/notifications/quietHours'
import { evaluateAchievements } from '@shared/achievements'

const event = (partial: Partial<ActivityEvent> & Pick<ActivityEvent, 'type' | 'kind'>): ActivityEvent => ({
  id: 'ev_test',
  at: Date.parse('2026-07-03T10:00:00'),
  day: '2026-07-03',
  ...partial
})

/** Goals: eye care 4/day, water 2/day, everything else untracked. */
const goals = (kind: string): number => (kind === 'eyeCare' ? 4 : kind === 'water' ? 2 : 0)

describe('applyEventToStats', () => {
  it('counts completions per kind', () => {
    const row = emptyDailyStats('2026-07-03')
    applyEventToStats(row, event({ type: 'reminder_completed', kind: 'eyeCare' }), goals)
    applyEventToStats(row, event({ type: 'reminder_completed', kind: 'eyeCare' }), goals)
    applyEventToStats(row, event({ type: 'reminder_completed', kind: 'water' }), goals)
    expect(row.completed).toEqual({ eyeCare: 2, water: 1 })
  })

  it('counts skipped and missed reminders together as not-done', () => {
    const row = emptyDailyStats('2026-07-03')
    applyEventToStats(row, event({ type: 'reminder_skipped', kind: 'water' }), goals)
    applyEventToStats(row, event({ type: 'reminder_missed', kind: 'water' }), goals)
    expect(row.skipped.water).toBe(2)
  })

  it('reports the goal exactly once, on the event that crosses it', () => {
    const row = emptyDailyStats('2026-07-03')
    const results = [1, 2, 3, 4, 5].map(() =>
      applyEventToStats(row, event({ type: 'reminder_completed', kind: 'eyeCare' }), goals)
    )
    expect(results).toEqual([null, null, null, 'eyeCare', null])
    expect(row.goalsMet).toEqual(['eyeCare'])
  })

  it('banks focus time from completed and aborted sessions alike', () => {
    const row = emptyDailyStats('2026-07-03')
    applyEventToStats(row, event({ type: 'focus_completed', kind: 'focus', durationSeconds: 1500 }), goals)
    // Stopping early still counts what was actually spent.
    applyEventToStats(row, event({ type: 'focus_aborted', kind: 'focus', durationSeconds: 300 }), goals)
    expect(row.focusSeconds).toBe(1800)
  })

  it('ignores bookkeeping events in the aggregates', () => {
    const row = emptyDailyStats('2026-07-03')
    applyEventToStats(row, event({ type: 'reminder_fired', kind: 'eyeCare' }), goals)
    applyEventToStats(row, event({ type: 'reminder_snoozed', kind: 'eyeCare' }), goals)
    applyEventToStats(row, event({ type: 'focus_started', kind: 'focus' }), goals)
    expect(row).toEqual(emptyDailyStats('2026-07-03'))
  })

  it('counts pomodoros separately from focus time', () => {
    const row = emptyDailyStats('2026-07-03')
    applyEventToStats(row, event({ type: 'pomodoro_completed', kind: 'focus' }), goals)
    expect(row.pomodoros).toBe(1)
    expect(row.focusSeconds).toBe(0)
  })
})

describe('isActiveDay', () => {
  it('is true for any focus time or completed reminder', () => {
    expect(isActiveDay({ ...emptyDailyStats('d'), focusSeconds: 60 })).toBe(true)
    expect(isActiveDay({ ...emptyDailyStats('d'), completed: { water: 1 } })).toBe(true)
  })

  it('is false for a day where things were only skipped', () => {
    expect(isActiveDay({ ...emptyDailyStats('d'), skipped: { water: 5 } })).toBe(false)
    expect(isActiveDay(emptyDailyStats('d'))).toBe(false)
  })
})

describe('isPerfectDay', () => {
  it('requires every goal-tracked kind to reach its goal', () => {
    const row = { ...emptyDailyStats('d'), completed: { eyeCare: 4, water: 2 }, goalsMet: ['eyeCare', 'water'] }
    expect(isPerfectDay(row, goals)).toBe(true)
  })

  it('is false when one tracked kind falls short', () => {
    const row = { ...emptyDailyStats('d'), completed: { eyeCare: 4, water: 1 }, goalsMet: ['eyeCare'] }
    expect(isPerfectDay(row, goals)).toBe(false)
  })

  it('is false for a day with no goal-tracked activity at all', () => {
    expect(isPerfectDay(emptyDailyStats('d'), goals)).toBe(false)
    expect(isPerfectDay({ ...emptyDailyStats('d'), completed: { blink: 9 } }, goals)).toBe(false)
  })
})

describe('quiet hours and Do Not Disturb', () => {
  const withQuietHours = (start: string, end: string, enabled = true): AppSettings => {
    const settings = createDefaultSettings()
    settings.notifications.quietHours = { enabled, start, end }
    return settings
  }

  it('is inactive when quiet hours are switched off', () => {
    expect(isQuietHoursActive(withQuietHours('22:00', '07:00', false), new Date(2026, 6, 3, 23, 0))).toBe(false)
  })

  it('is active inside the wrapping default window', () => {
    const settings = withQuietHours('22:00', '07:00')
    expect(isQuietHoursActive(settings, new Date(2026, 6, 3, 23, 0))).toBe(true)
    expect(isQuietHoursActive(settings, new Date(2026, 6, 3, 3, 0))).toBe(true)
    expect(isQuietHoursActive(settings, new Date(2026, 6, 3, 15, 0))).toBe(false)
  })

  it('treats the manual DND switch as active', () => {
    const settings = createDefaultSettings()
    settings.notifications.doNotDisturb = true
    expect(isDoNotDisturbActive(settings)).toBe(true)
  })

  it('treats a future timed DND as active and a past one as inactive', () => {
    const settings = createDefaultSettings()
    const now = 1_000_000

    settings.notifications.doNotDisturbUntil = now + 60_000
    expect(isDoNotDisturbActive(settings, now)).toBe(true)
    expect(hasExpiredTimedDnd(settings, now)).toBe(false)

    settings.notifications.doNotDisturbUntil = now - 60_000
    expect(isDoNotDisturbActive(settings, now)).toBe(false)
    expect(hasExpiredTimedDnd(settings, now)).toBe(true)
  })

  it('mutes everything when the master switch is off', () => {
    const settings = createDefaultSettings()
    expect(notificationsMuted(settings)).toBe(false)
    settings.notifications.enabled = false
    expect(notificationsMuted(settings)).toBe(true)
  })
})

describe('evaluateAchievements', () => {
  const metrics = {
    focusSecondsTotal: 3600 * 2,
    completedTotals: { eyeCare: 12, water: 3 },
    streakDays: 4,
    streakWeeks: 1,
    perfectDays: 0
  }

  it('unlocks badges whose threshold is met', () => {
    const progress = evaluateAchievements(metrics, {}, 1234)
    const byId = new Map(progress.map((entry) => [entry.id, entry]))
    expect(byId.get('focus-first-hour')?.unlockedAt).toBe(1234)
    expect(byId.get('eyes-10')?.unlockedAt).toBe(1234)
    expect(byId.get('streak-3')?.unlockedAt).toBe(1234)
  })

  it('leaves unmet badges locked but reports their progress', () => {
    const progress = evaluateAchievements(metrics, {}, 1234)
    const water = progress.find((entry) => entry.id === 'water-10')
    expect(water?.unlockedAt).toBeNull()
    expect(water).toMatchObject({ value: 3, threshold: 10 })
  })

  it('never revokes a badge when the metric later drops', () => {
    const brokenStreak = { ...metrics, streakDays: 0 }
    const progress = evaluateAchievements(brokenStreak, { 'streak-3': 999 }, 5000)
    expect(progress.find((entry) => entry.id === 'streak-3')?.unlockedAt).toBe(999)
  })
})
