/**
 * The persisted settings tree.
 *
 * Design rules that keep this file the single source of truth:
 *
 *  1. Every reminder — shipped or added later — is described by the SAME
 *     `ReminderSettings` shape. Adding "posture check" means adding a catalog
 *     entry plus a default record, not a new settings type, not a new UI screen.
 *  2. Notification preferences are a reusable leaf (`NotificationPrefs`) so
 *     "independent controls per feature" is structural, not copy-pasted.
 *  3. `schemaVersion` is bumped whenever the shape changes; migrations in
 *     src/main/storage/migrations.ts move old files forward.
 */

export const THEME_IDS = [
  'system',
  'light',
  'dark',
  'amoled',
  'ocean',
  'forest',
  'sakura',
  'sunset',
  'purpleNight',
  'minimalGray'
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const LOCALE_IDS = ['en', 'es', 'de', 'ne'] as const
export type LocaleId = (typeof LOCALE_IDS)[number]

/**
 * Built-in sounds are *synthesised* at runtime by the audio host (Web Audio
 * oscillators + envelopes) rather than shipped as files. That keeps the repo
 * asset-free, makes every sound instantly re-tunable, and still allows users to
 * point at their own audio via `customSoundPath`.
 */
export const SOUND_IDS = ['chime', 'marimba', 'droplet', 'bell', 'pluck', 'bowl', 'blip', 'none'] as const
export type SoundId = (typeof SOUND_IDS)[number] | 'custom'

export interface NotificationPrefs {
  /** Native OS toast for this feature. */
  desktop: boolean
  /** Play a sound for this feature. */
  sound: boolean
  /** Which built-in preset, or `custom` to use `customSoundPath`. */
  soundId: SoundId
  /** Absolute path to a user-supplied audio file (used when soundId==='custom'). */
  customSoundPath: string | null
  /** Per-feature volume, 0..1. Multiplied by the global master volume. */
  volume: number
  /** Let the mascot deliver this reminder (walk over, knock, speech bubble). */
  mascot: boolean
}

export type ScheduleMode = 'interval' | 'times'

export interface ReminderSchedule {
  mode: ScheduleMode
  /** Used when mode === 'interval'. Stored in minutes; the UI offers hours too. */
  intervalMinutes: number
  /** Used when mode === 'times'. Local wall-clock, 'HH:mm', sorted ascending. */
  times: string[]
}

export interface ReminderSettings {
  enabled: boolean
  schedule: ReminderSchedule
  /** Empty string → fall back to the localised default for this reminder kind. */
  message: string
  /** Length of the guided break in seconds. 0 → acknowledge-only reminder. */
  breakSeconds: number
  /** Full-screen overlay (eye care) vs. a toast you can ignore (water). */
  useOverlay: boolean
  /** Show a "Skip" affordance during the break. */
  allowSkip: boolean
  /** Reschedule automatically once the break countdown completes. */
  autoResume: boolean
  /** Offered snooze durations, in minutes. */
  snoozeMinutes: number[]
  /** 0 → no daily goal tracked for this reminder. */
  dailyGoal: number
  notifications: NotificationPrefs
}

/** Keys of shipped reminders. `(string & {})` keeps plugin kinds assignable. */
export type ReminderKind = 'eyeCare' | 'water' | 'stretch' | 'standUp' | 'blink' | (string & {})

export interface PomodoroSettings {
  enabled: boolean
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** A long break replaces the short one every N completed focus phases. */
  longBreakEvery: number
  /** Roll straight into the next phase without waiting for a click. */
  autoStartNext: boolean
}

export interface FocusSettings {
  /** Seed values for the "quick start" duration picker. */
  defaultMinutes: number
  /** Suppress wellness reminders while a focus phase is running. */
  pauseRemindersDuringFocus: boolean
  /** Keep the screen awake for the duration of a focus phase. */
  preventSleep: boolean
  pomodoro: PomodoroSettings
  notifications: NotificationPrefs
}

export const MASCOT_SKINS = ['mint', 'blueberry', 'peach', 'matcha', 'grape', 'ghost'] as const
export type MascotSkinId = (typeof MASCOT_SKINS)[number]

/**
 * How much of the mascot the user wants.
 *
 *   always   — lives on the desktop: wanders, idles, sleeps when you are away.
 *   onAlert  — stays off-screen entirely and only walks on to deliver a
 *              reminder, then leaves again.
 *
 * The second mode exists because "I want the reminder delivered charmingly" and
 * "I want a character on my desktop all day" are genuinely different wants, and
 * forcing the second to get the first loses people who would otherwise keep the
 * mascot switched on.
 */
export const MASCOT_VISIBILITIES = ['always', 'onAlert'] as const
export type MascotVisibility = (typeof MASCOT_VISIBILITIES)[number]

export interface MascotSettings {
  enabled: boolean
  visibility: MascotVisibility
  skin: MascotSkinId
  /** Rendered height in CSS pixels. */
  size: number
  /** Walk-speed multiplier, 1 = reference pace. */
  speed: number
  /** Display to live on. `null` → the OS primary display. */
  displayId: number | null
  /** Which screen edge the mascot walks along. */
  edge: 'bottom' | 'top'
  /** Nudge the mascot up/down away from the chosen edge (px). */
  offset: number
  /** Horizontal home position as a 0..1 fraction of screen width. */
  homeX: number
  /** Allow clicks to pass through to whatever is behind the mascot. */
  clickThrough: boolean
  speechBubbles: boolean
  /** Minutes of user inactivity before the mascot falls asleep. */
  sleepAfterIdleMinutes: number
}

export interface GeneralSettings {
  launchAtStartup: boolean
  startMinimized: boolean
  /** Close button hides to tray instead of quitting. */
  minimizeToTrayOnClose: boolean
  locale: LocaleId
  theme: ThemeId
  /** Overrides the theme's accent when set (hex). */
  accentOverride: string | null
  /** Honour prefers-reduced-motion behaviour app-wide. */
  reducedMotion: boolean
  autoUpdate: boolean
  /** Cleared by the welcome flow; drives first-run onboarding. */
  onboardingCompleted: boolean
}

export interface QuietHours {
  enabled: boolean
  /** 'HH:mm' local. `start > end` is valid and means the window wraps midnight. */
  start: string
  end: string
}

export interface GlobalNotificationSettings {
  /** Master kill-switch: no toasts, no sounds, no mascot announcements. */
  enabled: boolean
  masterVolume: number
  quietHours: QuietHours
  /** Manual Do Not Disturb. */
  doNotDisturb: boolean
  /** Temporary DND expiry (epoch ms) set from the tray, e.g. "DND for 1 hour". */
  doNotDisturbUntil: number | null
  /**
   * During quiet hours / DND, reminders can either be swallowed entirely or
   * silently counted and delivered as a single summary when the window ends.
   */
  quietHoursBehaviour: 'suppress' | 'deferToEnd'
}

export const SHORTCUT_ACTIONS = [
  'toggleDashboard',
  'startFocus',
  'pauseResumeFocus',
  'stopFocus',
  'drinkWaterNow',
  'startEyeBreak',
  'toggleDoNotDisturb',
  'toggleMascot'
] as const

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]

/** Electron accelerator strings, or `null` to leave the action unbound. */
export type ShortcutSettings = Record<ShortcutAction, string | null>

export interface AppSettings {
  schemaVersion: number
  general: GeneralSettings
  notifications: GlobalNotificationSettings
  /** Keyed by ReminderKind so new reminder types need no schema change. */
  reminders: Record<string, ReminderSettings>
  focus: FocusSettings
  mascot: MascotSettings
  shortcuts: ShortcutSettings
}
