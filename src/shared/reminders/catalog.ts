/**
 * The reminder catalog — Nudge's extensibility seam.
 *
 * A reminder is *data*, not code. Everything the app needs to schedule, render,
 * notify, chart and score a reminder lives in one `ReminderDefinition`. The
 * engine, the settings screen, the dashboard cards, the tray menu and the stats
 * charts all iterate this catalog, so adding a reminder type is:
 *
 *    1. append a definition below (or drop a plugin manifest on disk),
 *    2. add its strings to the locale files.
 *
 * No new components, no new IPC channels, no schema migration.
 */

import type { ReminderSettings } from '../types/settings'

export interface ReminderCapabilities {
  /** Has a timed break phase (eye care) rather than a one-shot ack (water). */
  timedBreak: boolean
  /** May take over the screen with a full-screen overlay. */
  overlay: boolean
  snooze: boolean
  /** Contributes a countable daily goal. */
  dailyGoal: boolean
  /** Offer "specific times of day" scheduling in addition to intervals. */
  scheduledTimes: boolean
}

export interface ReminderDefinition {
  kind: string
  /** i18n keys — never user-visible literals. */
  titleKey: string
  shortTitleKey: string
  defaultMessageKey: string
  /** Shown in the mascot's speech bubble and native toasts. */
  emoji: string
  /** Name resolved by the renderer's inline icon set. */
  icon: string
  /** Theme token used to tint this reminder's card/series colour. */
  tone: 'eye' | 'water' | 'focus' | 'move' | 'neutral'
  capabilities: ReminderCapabilities
  /** Sort order in every list the user sees. */
  order: number
  source: 'builtin' | 'plugin'
  /** Seed settings for a fresh install. */
  defaults: ReminderSettings
}

/* Shared default fragments                                                   */

const notificationDefaults = (soundId: ReminderSettings['notifications']['soundId']) => ({
  desktop: true,
  sound: true,
  soundId,
  customSoundPath: null,
  volume: 0.7,
  mascot: true
})

/* Built-in reminders                                                         */

const BUILTIN: ReminderDefinition[] = [
  {
    kind: 'eyeCare',
    titleKey: 'reminder.eyeCare.title',
    shortTitleKey: 'reminder.eyeCare.short',
    defaultMessageKey: 'reminder.eyeCare.message',
    emoji: '👀',
    icon: 'eye',
    tone: 'eye',
    capabilities: { timedBreak: true, overlay: true, snooze: true, dailyGoal: true, scheduledTimes: false },
    order: 10,
    source: 'builtin',
    defaults: {
      enabled: true,
      schedule: { mode: 'interval', intervalMinutes: 20, times: [] },
      message: '',
      breakSeconds: 20,
      useOverlay: true,
      allowSkip: true,
      autoResume: true,
      snoozeMinutes: [1, 5, 10],
      // 8 working hours ÷ 20 minutes ≈ 24 breaks; 20 is an achievable target.
      dailyGoal: 20,
      notifications: notificationDefaults('chime')
    }
  },
  {
    kind: 'water',
    titleKey: 'reminder.water.title',
    shortTitleKey: 'reminder.water.short',
    defaultMessageKey: 'reminder.water.message',
    emoji: '💧',
    icon: 'droplet',
    tone: 'water',
    capabilities: { timedBreak: false, overlay: false, snooze: true, dailyGoal: true, scheduledTimes: true },
    order: 20,
    source: 'builtin',
    defaults: {
      enabled: true,
      schedule: { mode: 'interval', intervalMinutes: 60, times: [] },
      message: '',
      breakSeconds: 0,
      useOverlay: false,
      allowSkip: true,
      autoResume: true,
      snoozeMinutes: [5, 10, 15],
      dailyGoal: 8,
      notifications: notificationDefaults('droplet')
    }
  },
  {
    kind: 'stretch',
    titleKey: 'reminder.stretch.title',
    shortTitleKey: 'reminder.stretch.short',
    defaultMessageKey: 'reminder.stretch.message',
    emoji: '🤸',
    icon: 'stretch',
    tone: 'move',
    capabilities: { timedBreak: true, overlay: true, snooze: true, dailyGoal: true, scheduledTimes: false },
    order: 30,
    source: 'builtin',
    defaults: {
      enabled: false,
      schedule: { mode: 'interval', intervalMinutes: 90, times: [] },
      message: '',
      breakSeconds: 60,
      useOverlay: false,
      allowSkip: true,
      autoResume: true,
      snoozeMinutes: [5, 10, 15],
      dailyGoal: 5,
      notifications: notificationDefaults('marimba')
    }
  },
  {
    kind: 'standUp',
    titleKey: 'reminder.standUp.title',
    shortTitleKey: 'reminder.standUp.short',
    defaultMessageKey: 'reminder.standUp.message',
    emoji: '🧍',
    icon: 'stand',
    tone: 'move',
    capabilities: { timedBreak: true, overlay: false, snooze: true, dailyGoal: true, scheduledTimes: false },
    order: 40,
    source: 'builtin',
    defaults: {
      enabled: false,
      schedule: { mode: 'interval', intervalMinutes: 45, times: [] },
      message: '',
      breakSeconds: 120,
      useOverlay: false,
      allowSkip: true,
      autoResume: true,
      snoozeMinutes: [5, 10],
      dailyGoal: 8,
      notifications: notificationDefaults('pluck')
    }
  },
  {
    kind: 'blink',
    titleKey: 'reminder.blink.title',
    shortTitleKey: 'reminder.blink.short',
    defaultMessageKey: 'reminder.blink.message',
    emoji: '😌',
    icon: 'blink',
    tone: 'eye',
    capabilities: { timedBreak: true, overlay: false, snooze: false, dailyGoal: false, scheduledTimes: false },
    order: 50,
    source: 'builtin',
    defaults: {
      enabled: false,
      schedule: { mode: 'interval', intervalMinutes: 10, times: [] },
      message: '',
      breakSeconds: 5,
      useOverlay: false,
      // A blink nudge that interrupts is worse than no blink nudge: it is
      // silent, mascot-only, and never steals focus.
      allowSkip: true,
      autoResume: true,
      snoozeMinutes: [],
      dailyGoal: 0,
      notifications: { ...notificationDefaults('blip'), desktop: false, sound: false, volume: 0.35 }
    }
  }
]

/* Registry                                                                   */

const registry = new Map<string, ReminderDefinition>()
for (const definition of BUILTIN) registry.set(definition.kind, definition)

/**
 * Register a reminder discovered at runtime (a plugin manifest).
 * Built-ins win on conflict so a broken plugin cannot shadow eye care.
 */
export function registerReminder(definition: ReminderDefinition): boolean {
  const existing = registry.get(definition.kind)
  if (existing && existing.source === 'builtin') return false
  registry.set(definition.kind, definition)
  return true
}

export function unregisterReminder(kind: string): void {
  const existing = registry.get(kind)
  if (existing?.source === 'plugin') registry.delete(kind)
}

export function getReminderDefinition(kind: string): ReminderDefinition | undefined {
  return registry.get(kind)
}

/** All definitions in display order. */
export function listReminderDefinitions(): ReminderDefinition[] {
  return [...registry.values()].sort((a, b) => a.order - b.order || a.kind.localeCompare(b.kind))
}

export function reminderKinds(): string[] {
  return listReminderDefinitions().map((d) => d.kind)
}

/** Kinds that count toward the "wellness" streak. */
export function goalTrackedKinds(): string[] {
  return listReminderDefinitions()
    .filter((d) => d.capabilities.dailyGoal)
    .map((d) => d.kind)
}
