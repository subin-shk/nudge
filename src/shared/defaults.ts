/**
 * Factory defaults.
 *
 * `SCHEMA_VERSION` is the contract between this file and
 * src/main/storage/migrations.ts. Bump it whenever the settings *shape* changes
 * and add the corresponding migration step; never reshape silently.
 */

import { listReminderDefinitions } from './reminders/catalog'
import type { AppSettings, ReminderSettings, ShortcutSettings } from './types/settings'
import { clone } from './util'

export const SCHEMA_VERSION = 1

/** Reminder defaults are assembled from the catalog so plugins seed themselves. */
function defaultReminders(): Record<string, ReminderSettings> {
  const out: Record<string, ReminderSettings> = {}
  for (const definition of listReminderDefinitions()) {
    out[definition.kind] = clone(definition.defaults)
  }
  return out
}

/**
 * Global shortcuts are OFF by default except the two that are unambiguous wins.
 * Grabbing accelerators a user has bound elsewhere is a hostile first impression,
 * so the rest are opt-in from Settings → Shortcuts.
 */
const defaultShortcuts: ShortcutSettings = {
  toggleDashboard: 'Control+Alt+N',
  startFocus: 'Control+Alt+F',
  pauseResumeFocus: null,
  stopFocus: null,
  drinkWaterNow: null,
  startEyeBreak: null,
  toggleDoNotDisturb: 'Control+Alt+D',
  toggleMascot: null
}

export function createDefaultSettings(): AppSettings {
  return {
    schemaVersion: SCHEMA_VERSION,

    general: {
      launchAtStartup: false,
      startMinimized: false,
      minimizeToTrayOnClose: true,
      locale: 'en',
      theme: 'system',
      accentOverride: null,
      reducedMotion: false,
      autoUpdate: true,
      onboardingCompleted: false
    },

    notifications: {
      enabled: true,
      masterVolume: 0.8,
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
      doNotDisturb: false,
      doNotDisturbUntil: null,
      quietHoursBehaviour: 'suppress'
    },

    reminders: defaultReminders(),

    focus: {
      defaultMinutes: 25,
      pauseRemindersDuringFocus: false,
      preventSleep: true,
      pomodoro: {
        enabled: false,
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        longBreakEvery: 4,
        autoStartNext: true
      },
      notifications: {
        desktop: true,
        sound: true,
        soundId: 'bowl',
        customSoundPath: null,
        volume: 0.75,
        mascot: true
      }
    },

    mascot: {
      enabled: true,
      visibility: 'always',
      skin: 'mint',
      size: 120,
      speed: 1,
      displayId: null,
      edge: 'bottom',
      offset: 0,
      homeX: 0.18,
      clickThrough: true,
      speechBubbles: true,
      sleepAfterIdleMinutes: 5
    },

    shortcuts: { ...defaultShortcuts }
  }
}

/**
 * Validation bounds, shared by the settings UI (slider min/max) and the main
 * process (sanitisation on write). One source of truth means the UI can never
 * offer a value the backend will reject.
 */
export const LIMITS = {
  reminderIntervalMinutes: { min: 1, max: 24 * 60, step: 1 },
  breakSeconds: { min: 5, max: 15 * 60, step: 5 },
  dailyGoal: { min: 0, max: 100, step: 1 },
  volume: { min: 0, max: 1, step: 0.05 },
  focusMinutes: { min: 1, max: 12 * 60, step: 1 },
  pomodoroFocusMinutes: { min: 5, max: 120, step: 1 },
  pomodoroBreakMinutes: { min: 1, max: 60, step: 1 },
  longBreakEvery: { min: 2, max: 12, step: 1 },
  mascotSize: { min: 64, max: 260, step: 4 },
  mascotSpeed: { min: 0.3, max: 2.5, step: 0.1 },
  mascotOffset: { min: -200, max: 200, step: 4 },
  sleepAfterIdleMinutes: { min: 1, max: 120, step: 1 },
  snoozeMinutes: { min: 1, max: 120, step: 1 }
} as const

/** Snooze presets offered in the UI when a user edits the list. */
export const SNOOZE_PRESETS = [1, 5, 10, 15, 30] as const
