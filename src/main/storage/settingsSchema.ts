/**
 * Settings normalisation.
 *
 * Anything read from disk, imported from a backup file, or arriving over IPC is
 * *untrusted input*. It passes through `normalizeSettings` before the app looks
 * at it, which guarantees three properties the rest of the codebase relies on:
 *
 *   1. Totality — every field exists (missing keys take their default), so no
 *      consumer needs optional chaining or `?? fallback`.
 *   2. Bounds — numbers are clamped to `LIMITS`, so a hand-edited JSON file
 *      cannot produce a 0-second reminder interval that pegs a CPU core.
 *   3. Enum safety — unknown theme/locale/sound ids fall back rather than
 *      leaving the UI rendering against a token set that does not exist.
 *
 * Unknown *reminder kinds* are deliberately preserved: a user may have a plugin
 * installed that has not loaded yet, and silently deleting their configuration
 * for it would be data loss.
 */

import { LIMITS, createDefaultSettings } from '@shared/defaults'
import { LOCALE_IDS, MASCOT_SKINS, MASCOT_VISIBILITIES, SHORTCUT_ACTIONS, SOUND_IDS, THEME_IDS } from '@shared/types/settings'
import type {
  AppSettings,
  LocaleId,
  MascotSkinId,
  MascotVisibility,
  NotificationPrefs,
  ReminderSettings,
  ShortcutAction,
  ShortcutSettings,
  SoundId,
  ThemeId
} from '@shared/types/settings'
import { getReminderDefinition } from '@shared/reminders/catalog'
import { parseHM } from '@shared/time'
import { clamp, deepMerge } from '@shared/util'

type Bound = { min: number; max: number; step: number }

/** Clamp to bounds and snap to the step, so slider values stay canonical. */
function bounded(value: unknown, bound: Bound, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const snapped = bound.step >= 1 ? Math.round(n / bound.step) * bound.step : n
  return clamp(snapped, bound.min, bound.max)
}

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Keep 'HH:mm' strings well-formed; anything else reverts to the default. */
function timeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const parsed = parseHM(value)
  return parsed ? `${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}` : fallback
}

/** '#rgb' / '#rrggbb' only — this value is interpolated into CSS. */
function hexColour(value: unknown): string | null {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null
}

function normalizeNotificationPrefs(input: unknown, fallback: NotificationPrefs): NotificationPrefs {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const soundId = oneOf<SoundId>(raw.soundId, [...SOUND_IDS, 'custom'], fallback.soundId)
  const customPath = typeof raw.customSoundPath === 'string' && raw.customSoundPath.length > 0 ? raw.customSoundPath : null

  return {
    desktop: bool(raw.desktop, fallback.desktop),
    sound: bool(raw.sound, fallback.sound),
    // A 'custom' selection with no file would be silent-but-look-configured.
    soundId: soundId === 'custom' && !customPath ? fallback.soundId : soundId,
    customSoundPath: customPath,
    volume: bounded(raw.volume, LIMITS.volume, fallback.volume),
    mascot: bool(raw.mascot, fallback.mascot)
  }
}

function normalizeReminder(kind: string, input: unknown, fallback: ReminderSettings): ReminderSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const capabilities = getReminderDefinition(kind)?.capabilities

  const rawSchedule = (typeof raw.schedule === 'object' && raw.schedule !== null ? raw.schedule : {}) as Record<string, unknown>

  const times = Array.isArray(rawSchedule.times)
    ? [...new Set(rawSchedule.times.filter((t): t is string => typeof t === 'string').map((t) => timeString(t, '')))]
        .filter((t) => t.length > 0)
        .sort()
    : fallback.schedule.times

  let mode = oneOf(rawSchedule.mode, ['interval', 'times'] as const, fallback.schedule.mode)
  // Two ways a 'times' schedule would silently never fire; both revert to interval.
  if (capabilities && !capabilities.scheduledTimes) mode = 'interval'
  if (mode === 'times' && times.length === 0) mode = 'interval'

  const snoozeMinutes = Array.isArray(raw.snoozeMinutes)
    ? [...new Set(raw.snoozeMinutes.filter((n): n is number => typeof n === 'number').map((n) => bounded(n, LIMITS.snoozeMinutes, 5)))].sort(
        (a, b) => a - b
      )
    : fallback.snoozeMinutes

  return {
    enabled: bool(raw.enabled, fallback.enabled),
    schedule: {
      mode,
      intervalMinutes: bounded(rawSchedule.intervalMinutes, LIMITS.reminderIntervalMinutes, fallback.schedule.intervalMinutes),
      times
    },
    message: typeof raw.message === 'string' ? raw.message.slice(0, 280) : fallback.message,
    breakSeconds: capabilities && !capabilities.timedBreak ? 0 : bounded(raw.breakSeconds, LIMITS.breakSeconds, fallback.breakSeconds),
    useOverlay: capabilities && !capabilities.overlay ? false : bool(raw.useOverlay, fallback.useOverlay),
    allowSkip: bool(raw.allowSkip, fallback.allowSkip),
    autoResume: bool(raw.autoResume, fallback.autoResume),
    snoozeMinutes: capabilities && !capabilities.snooze ? [] : snoozeMinutes,
    dailyGoal: capabilities && !capabilities.dailyGoal ? 0 : bounded(raw.dailyGoal, LIMITS.dailyGoal, fallback.dailyGoal),
    notifications: normalizeNotificationPrefs(raw.notifications, fallback.notifications)
  }
}

/**
 * Electron accelerators, loosely validated.
 *
 * We check the *shape* (modifiers + a key) rather than the full legal key list;
 * `globalShortcut.register` is the real authority and its failure is handled
 * gracefully by the shortcut service.
 */
function accelerator(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  const parts = value.split('+').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const key = parts[parts.length - 1]!
  if (key.length === 0 || key.length > 12) return null
  return parts.join('+')
}

function normalizeShortcuts(input: unknown, fallback: ShortcutSettings): ShortcutSettings {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const out = {} as ShortcutSettings
  for (const action of SHORTCUT_ACTIONS) {
    out[action as ShortcutAction] = action in raw ? accelerator(raw[action]) : fallback[action]
  }
  return out
}

/**
 * Turn arbitrary input into a valid `AppSettings`.
 *
 * Strategy: deep-merge over the defaults first (guarantees totality), then
 * re-validate every leaf that has a constraint (guarantees bounds + enums).
 */
export function normalizeSettings(input: unknown): AppSettings {
  const defaults = createDefaultSettings()
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const merged = deepMerge(defaults, raw as never)

  const general = {
    launchAtStartup: bool(merged.general.launchAtStartup, defaults.general.launchAtStartup),
    startMinimized: bool(merged.general.startMinimized, defaults.general.startMinimized),
    minimizeToTrayOnClose: bool(merged.general.minimizeToTrayOnClose, defaults.general.minimizeToTrayOnClose),
    locale: oneOf<LocaleId>(merged.general.locale, LOCALE_IDS, defaults.general.locale),
    theme: oneOf<ThemeId>(merged.general.theme, THEME_IDS, defaults.general.theme),
    accentOverride: hexColour(merged.general.accentOverride),
    reducedMotion: bool(merged.general.reducedMotion, defaults.general.reducedMotion),
    autoUpdate: bool(merged.general.autoUpdate, defaults.general.autoUpdate),
    onboardingCompleted: bool(merged.general.onboardingCompleted, defaults.general.onboardingCompleted)
  }

  const dndUntil =
    typeof merged.notifications.doNotDisturbUntil === 'number' && merged.notifications.doNotDisturbUntil > Date.now()
      ? merged.notifications.doNotDisturbUntil
      : null

  const notifications = {
    enabled: bool(merged.notifications.enabled, defaults.notifications.enabled),
    masterVolume: bounded(merged.notifications.masterVolume, LIMITS.volume, defaults.notifications.masterVolume),
    quietHours: {
      enabled: bool(merged.notifications.quietHours.enabled, false),
      start: timeString(merged.notifications.quietHours.start, defaults.notifications.quietHours.start),
      end: timeString(merged.notifications.quietHours.end, defaults.notifications.quietHours.end)
    },
    doNotDisturb: bool(merged.notifications.doNotDisturb, false),
    // An expired timed-DND must not survive a restart as permanent DND.
    doNotDisturbUntil: dndUntil,
    quietHoursBehaviour: oneOf(
      merged.notifications.quietHoursBehaviour,
      ['suppress', 'deferToEnd'] as const,
      defaults.notifications.quietHoursBehaviour
    )
  }

  const reminders: Record<string, ReminderSettings> = {}
  const kinds = new Set([...Object.keys(defaults.reminders), ...Object.keys(merged.reminders ?? {})])
  for (const kind of kinds) {
    const fallback = defaults.reminders[kind] ?? getReminderDefinition(kind)?.defaults
    // Unknown kind with no definition and no default: keep the raw record as-is
    // so an unloaded plugin's config survives, but normalise what we can.
    const base = fallback ?? (defaults.reminders.eyeCare as ReminderSettings)
    reminders[kind] = normalizeReminder(kind, merged.reminders?.[kind], base)
  }

  const focus = {
    defaultMinutes: bounded(merged.focus.defaultMinutes, LIMITS.focusMinutes, defaults.focus.defaultMinutes),
    pauseRemindersDuringFocus: bool(merged.focus.pauseRemindersDuringFocus, defaults.focus.pauseRemindersDuringFocus),
    preventSleep: bool(merged.focus.preventSleep, defaults.focus.preventSleep),
    pomodoro: {
      enabled: bool(merged.focus.pomodoro.enabled, defaults.focus.pomodoro.enabled),
      focusMinutes: bounded(merged.focus.pomodoro.focusMinutes, LIMITS.pomodoroFocusMinutes, defaults.focus.pomodoro.focusMinutes),
      shortBreakMinutes: bounded(
        merged.focus.pomodoro.shortBreakMinutes,
        LIMITS.pomodoroBreakMinutes,
        defaults.focus.pomodoro.shortBreakMinutes
      ),
      longBreakMinutes: bounded(
        merged.focus.pomodoro.longBreakMinutes,
        LIMITS.pomodoroBreakMinutes,
        defaults.focus.pomodoro.longBreakMinutes
      ),
      longBreakEvery: bounded(merged.focus.pomodoro.longBreakEvery, LIMITS.longBreakEvery, defaults.focus.pomodoro.longBreakEvery),
      autoStartNext: bool(merged.focus.pomodoro.autoStartNext, defaults.focus.pomodoro.autoStartNext)
    },
    notifications: normalizeNotificationPrefs(merged.focus.notifications, defaults.focus.notifications)
  }

  const mascot = {
    enabled: bool(merged.mascot.enabled, defaults.mascot.enabled),
    visibility: oneOf<MascotVisibility>(merged.mascot.visibility, MASCOT_VISIBILITIES, defaults.mascot.visibility),
    skin: oneOf<MascotSkinId>(merged.mascot.skin, MASCOT_SKINS, defaults.mascot.skin),
    size: bounded(merged.mascot.size, LIMITS.mascotSize, defaults.mascot.size),
    speed: clamp(
      typeof merged.mascot.speed === 'number' && Number.isFinite(merged.mascot.speed) ? merged.mascot.speed : defaults.mascot.speed,
      LIMITS.mascotSpeed.min,
      LIMITS.mascotSpeed.max
    ),
    displayId: typeof merged.mascot.displayId === 'number' ? merged.mascot.displayId : null,
    edge: oneOf(merged.mascot.edge, ['bottom', 'top'] as const, defaults.mascot.edge),
    offset: bounded(merged.mascot.offset, LIMITS.mascotOffset, defaults.mascot.offset),
    homeX: clamp(typeof merged.mascot.homeX === 'number' ? merged.mascot.homeX : defaults.mascot.homeX, 0, 1),
    clickThrough: bool(merged.mascot.clickThrough, defaults.mascot.clickThrough),
    speechBubbles: bool(merged.mascot.speechBubbles, defaults.mascot.speechBubbles),
    sleepAfterIdleMinutes: bounded(
      merged.mascot.sleepAfterIdleMinutes,
      LIMITS.sleepAfterIdleMinutes,
      defaults.mascot.sleepAfterIdleMinutes
    )
  }

  return {
    schemaVersion: defaults.schemaVersion,
    general,
    notifications,
    reminders,
    focus,
    mascot,
    shortcuts: normalizeShortcuts(merged.shortcuts, defaults.shortcuts)
  }
}

/**
 * Shape check for imported backup files.
 *
 * Deliberately permissive — `normalizeSettings` repairs anything survivable, so
 * this only has to reject files that clearly are not Nudge settings (the user
 * picked the wrong JSON in the file dialog).
 */
export function looksLikeSettingsDocument(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false
  const raw = input as Record<string, unknown>
  const markers = ['general', 'reminders', 'notifications', 'focus', 'mascot']
  return markers.some((key) => typeof raw[key] === 'object' && raw[key] !== null)
}
