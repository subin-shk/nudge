/**
 * Quiet hours and Do Not Disturb evaluation.
 *
 * Split out as free functions because the rules are pure and worth testing on
 * their own — especially the midnight-wrapping window, which is the default
 * (22:00 → 07:00) and therefore the case that must never regress.
 */

import type { AppSettings } from '@shared/types'
import { isWithinDailyWindow } from '@shared/time'

export function isQuietHoursActive(settings: AppSettings, now: Date = new Date()): boolean {
  const { quietHours } = settings.notifications
  if (!quietHours.enabled) return false
  return isWithinDailyWindow(now, quietHours.start, quietHours.end)
}

/**
 * DND is active when the manual switch is on, or a timed DND has not expired.
 * An expired `doNotDisturbUntil` reads as inactive here; the coordinator clears
 * the stored value separately so the UI switch flips back too.
 */
export function isDoNotDisturbActive(settings: AppSettings, now: number = Date.now()): boolean {
  const { doNotDisturb, doNotDisturbUntil } = settings.notifications
  if (doNotDisturb) return true
  return doNotDisturbUntil !== null && doNotDisturbUntil > now
}

/** True when a stored timed-DND has lapsed and should be cleared from settings. */
export function hasExpiredTimedDnd(settings: AppSettings, now: number = Date.now()): boolean {
  const until = settings.notifications.doNotDisturbUntil
  return until !== null && until <= now
}

/** Nothing may be delivered at all — the master switch. */
export function notificationsMuted(settings: AppSettings): boolean {
  return !settings.notifications.enabled
}
