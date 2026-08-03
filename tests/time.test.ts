/**
 * Pure time maths: day keys, wrapping windows, time-of-day scheduling, streaks.
 *
 * These rules are the ones a user actually feels — a quiet-hours window that
 * fails to wrap midnight is a reminder at 3 a.m., and a streak that resets each
 * morning is a broken promise. Worth pinning down precisely.
 */

import { describe, expect, it } from 'vitest'
import {
  addDays,
  computeDayStreak,
  computeWeekStreak,
  dayDiff,
  dayKeyRange,
  formatClock,
  formatDurationShort,
  isWithinDailyWindow,
  isoWeekKey,
  lastNDays,
  nextTimeOccurrence,
  parseHM,
  startOfWeek,
  toDayKey,
  toHours
} from '@shared/time'

/** Local-time date helper so tests never depend on the runner's timezone. */
const at = (year: number, month: number, day: number, hour = 0, minute = 0): Date =>
  new Date(year, month - 1, day, hour, minute, 0, 0)

describe('day keys', () => {
  it('formats the local calendar date', () => {
    expect(toDayKey(at(2026, 7, 3, 23, 59))).toBe('2026-07-03')
    expect(toDayKey(at(2026, 1, 9, 0, 0))).toBe('2026-01-09')
  })

  it('shifts across month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
  })

  it('produces an inclusive range', () => {
    expect(dayKeyRange('2026-07-01', '2026-07-04')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'])
    expect(dayKeyRange('2026-07-04', '2026-07-01')).toEqual([])
  })

  it('counts whole days between keys', () => {
    expect(dayDiff('2026-07-01', '2026-07-08')).toBe(7)
    expect(dayDiff('2026-07-08', '2026-07-01')).toBe(-7)
  })

  it('returns N days ending at the given key, oldest first', () => {
    expect(lastNDays(3, '2026-07-03')).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })
})

describe('parseHM', () => {
  it('accepts valid 24-hour times', () => {
    expect(parseHM('09:30')).toEqual({ hour: 9, minute: 30 })
    expect(parseHM('00:00')).toEqual({ hour: 0, minute: 0 })
    expect(parseHM('23:59')).toEqual({ hour: 23, minute: 59 })
  })

  it('rejects out-of-range and malformed values', () => {
    expect(parseHM('24:00')).toBeNull()
    expect(parseHM('12:60')).toBeNull()
    expect(parseHM('nope')).toBeNull()
    expect(parseHM('')).toBeNull()
  })
})

describe('isWithinDailyWindow', () => {
  it('handles a same-day window', () => {
    expect(isWithinDailyWindow(at(2026, 7, 3, 10, 0), '09:00', '17:00')).toBe(true)
    expect(isWithinDailyWindow(at(2026, 7, 3, 8, 59), '09:00', '17:00')).toBe(false)
    // End is exclusive.
    expect(isWithinDailyWindow(at(2026, 7, 3, 17, 0), '09:00', '17:00')).toBe(false)
  })

  it('wraps across midnight — the default quiet-hours case', () => {
    expect(isWithinDailyWindow(at(2026, 7, 3, 23, 30), '22:00', '07:00')).toBe(true)
    expect(isWithinDailyWindow(at(2026, 7, 3, 2, 0), '22:00', '07:00')).toBe(true)
    expect(isWithinDailyWindow(at(2026, 7, 3, 6, 59), '22:00', '07:00')).toBe(true)
    expect(isWithinDailyWindow(at(2026, 7, 3, 7, 0), '22:00', '07:00')).toBe(false)
    expect(isWithinDailyWindow(at(2026, 7, 3, 12, 0), '22:00', '07:00')).toBe(false)
  })

  it('treats equal endpoints as an empty window, not all day', () => {
    expect(isWithinDailyWindow(at(2026, 7, 3, 12, 0), '09:00', '09:00')).toBe(false)
  })

  it('is false for unparseable input rather than throwing', () => {
    expect(isWithinDailyWindow(at(2026, 7, 3, 12, 0), 'x', '09:00')).toBe(false)
  })
})

describe('nextTimeOccurrence', () => {
  it('finds the next slot later today', () => {
    const next = nextTimeOccurrence(at(2026, 7, 3, 10, 15), ['09:00', '12:00', '16:00'])
    expect(next && toDayKey(next)).toBe('2026-07-03')
    expect(next?.getHours()).toBe(12)
  })

  it('rolls to tomorrow when every slot has passed', () => {
    const next = nextTimeOccurrence(at(2026, 7, 3, 18, 0), ['09:00', '12:00', '16:00'])
    expect(next && toDayKey(next)).toBe('2026-07-04')
    expect(next?.getHours()).toBe(9)
  })

  it('does not return the current minute, which would cause a tight re-fire loop', () => {
    const next = nextTimeOccurrence(at(2026, 7, 3, 12, 0), ['12:00'])
    expect(next && toDayKey(next)).toBe('2026-07-04')
  })

  it('returns null when no time is parseable', () => {
    expect(nextTimeOccurrence(at(2026, 7, 3, 12, 0), [])).toBeNull()
    expect(nextTimeOccurrence(at(2026, 7, 3, 12, 0), ['banana'])).toBeNull()
  })

  it('ignores unparseable entries mixed with valid ones', () => {
    const next = nextTimeOccurrence(at(2026, 7, 3, 8, 0), ['banana', '09:00'])
    expect(next?.getHours()).toBe(9)
  })
})

describe('ISO weeks', () => {
  it('computes week keys', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-07-03')).toBe('2026-W27')
  })

  it('starts weeks on Monday', () => {
    // 2026-07-03 is a Friday.
    expect(startOfWeek('2026-07-03')).toBe('2026-06-29')
    expect(startOfWeek('2026-06-29')).toBe('2026-06-29')
  })
})

describe('computeDayStreak', () => {
  it('counts back from today when today qualifies', () => {
    const result = computeDayStreak(['2026-07-01', '2026-07-02', '2026-07-03'], '2026-07-03')
    expect(result.current).toBe(3)
    expect(result.todayQualifies).toBe(true)
  })

  it('applies the morning grace rule — a streak is not zero before your first break', () => {
    const result = computeDayStreak(['2026-07-01', '2026-07-02'], '2026-07-03')
    expect(result.current).toBe(2)
    expect(result.todayQualifies).toBe(false)
  })

  it('breaks on a real gap', () => {
    const result = computeDayStreak(['2026-06-28', '2026-07-02', '2026-07-03'], '2026-07-03')
    expect(result.current).toBe(2)
  })

  it('reports the best historical run', () => {
    const result = computeDayStreak(
      ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-07-03'],
      '2026-07-03'
    )
    expect(result.current).toBe(1)
    expect(result.best).toBe(4)
  })

  it('is zero for no activity', () => {
    expect(computeDayStreak([], '2026-07-03')).toEqual({ current: 0, best: 0, todayQualifies: false })
  })
})

describe('computeWeekStreak', () => {
  it('counts consecutive ISO weeks with at least one active day', () => {
    // One day in each of four consecutive ISO weeks (Mondays: Jun 8, 15, 22, 29).
    const days = ['2026-06-09', '2026-06-16', '2026-06-23', '2026-07-03']
    expect(computeWeekStreak(days, '2026-07-03')).toBe(4)
  })

  it('counts two days in the same ISO week only once', () => {
    // Jun 30 and Jul 3 both fall in the week beginning Mon Jun 29.
    expect(computeWeekStreak(['2026-06-30', '2026-07-03'], '2026-07-03')).toBe(1)
  })

  it('applies the same grace rule to the current week', () => {
    const days = ['2026-06-23', '2026-06-30']
    // 2026-07-08 is in the following week, which has no activity yet.
    expect(computeWeekStreak(days, '2026-07-08')).toBe(2)
  })

  it('is zero with no activity', () => {
    expect(computeWeekStreak([], '2026-07-03')).toBe(0)
  })
})

describe('duration formatting', () => {
  it('formats clock time, adding hours only when needed', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(3725)).toBe('01:02:05')
    expect(formatClock(-5)).toBe('00:00')
  })

  it('formats prose durations', () => {
    expect(formatDurationShort(45)).toBe('45s')
    expect(formatDurationShort(600)).toBe('10m')
    expect(formatDurationShort(3600)).toBe('1h')
    expect(formatDurationShort(4500)).toBe('1h 15m')
  })

  it('rounds hours to one decimal', () => {
    expect(toHours(5400)).toBe(1.5)
    expect(toHours(0)).toBe(0)
  })
})
