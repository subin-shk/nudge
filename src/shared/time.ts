/**
 * Pure date / duration helpers.
 *
 * Everything here is a total function of its arguments — no `Date.now()`, no
 * timezone lookups beyond the host's local offset, no I/O. That makes the
 * scheduling and streak rules unit-testable (see tests/time.test.ts) and keeps
 * the identical logic usable from the main process, the renderer and tests.
 *
 * A "day key" is the local calendar date as 'YYYY-MM-DD'. All rollups are keyed
 * by it, because a user who works past midnight thinks in local days, not UTC.
 */

const MS_PER_DAY = 86_400_000

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n))

/** Local calendar date of `input` as 'YYYY-MM-DD'. */
export function toDayKey(input: Date | number = new Date()): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Local midnight at the start of `key`. Throws on malformed input. */
export function fromDayKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) throw new Error(`Invalid day key: ${key}`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

/**
 * Shift a day key by `days`.
 *
 * Uses the Date constructor rather than millisecond arithmetic so DST
 * transitions (a 23- or 25-hour local day) can never skip or repeat a date.
 */
export function addDays(key: string, days: number): string {
  const d = fromDayKey(key)
  d.setDate(d.getDate() + days)
  return toDayKey(d)
}

/** Inclusive list of day keys from `from` to `to`. Empty if `to` precedes `from`. */
export function dayKeyRange(from: string, to: string): string[] {
  const out: string[] = []
  const end = fromDayKey(to).getTime()
  let cursor = fromDayKey(from)
  // Guard against pathological ranges (a decade is plenty for any chart).
  for (let guard = 0; cursor.getTime() <= end && guard < 4000; guard++) {
    out.push(toDayKey(cursor))
    const next = new Date(cursor)
    next.setDate(next.getDate() + 1)
    cursor = next
  }
  return out
}

/** The last `count` day keys ending at `endKey` (inclusive), oldest first. */
export function lastNDays(count: number, endKey: string = toDayKey()): string[] {
  return dayKeyRange(addDays(endKey, -(count - 1)), endKey)
}

/** Number of whole local days between two keys (`b - a`). */
export function dayDiff(a: string, b: string): number {
  return Math.round((fromDayKey(b).getTime() - fromDayKey(a).getTime()) / MS_PER_DAY)
}

export interface HourMinute {
  hour: number
  minute: number
}

/** Parse 'HH:mm' (24h). Returns null when the string is not a valid time. */
export function parseHM(value: string): HourMinute | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute }
}

export function formatHM({ hour, minute }: HourMinute): string {
  return `${pad2(hour)}:${pad2(minute)}`
}

/** Minutes elapsed since local midnight. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Is `date` inside the daily window [start, end)?
 *
 * Handles the wrap-around case that quiet hours always hit: 22:00 → 07:00 spans
 * midnight, so the window is "at or after 22:00 OR before 07:00".
 * A window whose ends are equal is treated as *empty*, not as all-day — the
 * safer reading when a user fat-fingers matching times.
 */
export function isWithinDailyWindow(date: Date, start: string, end: string): boolean {
  const s = parseHM(start)
  const e = parseHM(end)
  if (!s || !e) return false
  const startMin = s.hour * 60 + s.minute
  const endMin = e.hour * 60 + e.minute
  if (startMin === endMin) return false
  const nowMin = minutesOfDay(date)
  return startMin < endMin
    ? nowMin >= startMin && nowMin < endMin
    : nowMin >= startMin || nowMin < endMin
}

/**
 * The next moment at or after `after` that matches one of `times` ('HH:mm').
 * Returns null when `times` contains nothing parseable.
 */
export function nextTimeOccurrence(after: Date, times: string[]): Date | null {
  const parsed = times
    .map(parseHM)
    .filter((t): t is HourMinute => t !== null)
    .map((t) => t.hour * 60 + t.minute)
    .sort((a, b) => a - b)

  if (parsed.length === 0) return null

  const afterMin = minutesOfDay(after)
  // `> afterMin` (not >=) so re-scheduling immediately after a fire does not
  // pick the same minute again and cause a tight loop.
  const todayMatch = parsed.find((m) => m > afterMin)

  const result = new Date(after)
  result.setSeconds(0, 0)
  if (todayMatch !== undefined) {
    result.setHours(Math.floor(todayMatch / 60), todayMatch % 60)
  } else {
    result.setDate(result.getDate() + 1)
    const first = parsed[0]!
    result.setHours(Math.floor(first / 60), first % 60)
  }
  return result
}

/** ISO-8601 week key, e.g. '2026-W31'. Weeks start Monday. */
export function isoWeekKey(input: Date | string): string {
  const date = typeof input === 'string' ? fromDayKey(input) : new Date(input)
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // Thursday of the current ISO week determines the year and week number.
  const dayNum = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - dayNum + 3)
  const isoYear = d.getFullYear()
  const firstThursday = new Date(isoYear, 0, 4)
  const firstDayNum = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY))
  return `${isoYear}-W${pad2(week)}`
}

/** Month key, e.g. '2026-07'. */
export function monthKey(input: Date | string): string {
  const d = typeof input === 'string' ? fromDayKey(input) : input
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: string): string {
  const d = fromDayKey(key)
  const dayNum = (d.getDay() + 6) % 7
  return addDays(key, -dayNum)
}

export interface StreakResult {
  current: number
  best: number
  todayQualifies: boolean
}

/**
 * Day streak over a set of qualifying day keys.
 *
 * Grace rule: if today has not qualified *yet*, the streak is measured from
 * yesterday instead of collapsing to zero. Without this, every user's streak
 * reads "0" every morning until they take their first break — technically true,
 * emotionally wrong, and the single fastest way to make a streak feel punitive.
 */
export function computeDayStreak(qualifyingDays: Iterable<string>, todayKey: string = toDayKey()): StreakResult {
  const set = new Set(qualifyingDays)
  const todayQualifies = set.has(todayKey)

  let current = 0
  if (set.size > 0) {
    const anchor = todayQualifies ? todayKey : addDays(todayKey, -1)
    let cursor = anchor
    while (set.has(cursor)) {
      current++
      cursor = addDays(cursor, -1)
    }
  }

  // Longest historical run: walk the sorted keys and break on any gap.
  const sorted = [...set].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of sorted) {
    run = previous !== null && dayDiff(previous, key) === 1 ? run + 1 : 1
    if (run > best) best = run
    previous = key
  }

  return { current, best: Math.max(best, current), todayQualifies }
}

/** Consecutive ISO weeks containing at least one qualifying day, ending now. */
export function computeWeekStreak(qualifyingDays: Iterable<string>, todayKey: string = toDayKey()): number {
  const weeks = new Set<string>()
  for (const day of qualifyingDays) weeks.add(isoWeekKey(day))
  if (weeks.size === 0) return 0

  const thisWeekMonday = startOfWeek(todayKey)
  let cursorMonday = weeks.has(isoWeekKey(todayKey)) ? thisWeekMonday : addDays(thisWeekMonday, -7)

  let count = 0
  // 520 weeks ≈ 10 years; a hard bound keeps this loop provably terminating.
  for (let guard = 0; guard < 520; guard++) {
    if (!weeks.has(isoWeekKey(cursorMonday))) break
    count++
    cursorMonday = addDays(cursorMonday, -7)
  }
  return count
}

/** `3725` → `'01:02:05'`; `125` → `'02:05'`. The format used on timers. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return hours > 0
    ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(minutes)}:${pad2(seconds)}`
}

/** `4500` → `'1h 15m'`; `600` → `'10m'`; `45` → `'45s'`. Prose-friendly. */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s}s`
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** Hours with one decimal, for stat tiles: `5400` → `1.5`. */
export function toHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 10) / 10
}

/** `'in 12m'` style relative label for the next reminder. */
export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds <= 0) return 'now'
  if (seconds < 60) return `${Math.ceil(seconds)}s`
  return formatDurationShort(seconds)
}
