/**
 * Runtime (non-persisted) state.
 *
 * The main process owns ALL of it. Renderers never compute schedule maths or
 * countdowns from their own clock — they receive `AppRuntime` snapshots and
 * render them. That single rule removes an entire class of bug where a
 * background-throttled renderer drifts out of sync with the real timer.
 */

import type { DailyStats, StreakInfo } from './activity'

export type ReminderPauseReason = 'quietHours' | 'doNotDisturb' | 'focus' | 'userIdle' | 'suspended'

export type ReminderPhase =
  | 'disabled'
  | 'waiting' // counting down to the next fire
  | 'due' // fired, waiting for the user to engage
  | 'active' // break in progress
  | 'snoozed'
  | 'paused'

export interface ReminderRuntime {
  kind: string
  phase: ReminderPhase
  /** Epoch ms of the next scheduled fire, or null when nothing is scheduled. */
  nextFireAt: number | null
  /** Seconds until `nextFireAt`; pre-computed so the UI never does clock maths. */
  secondsUntilNext: number | null
  snoozedUntil: number | null
  pauseReasons: ReminderPauseReason[]
  todayCompleted: number
  todayGoal: number
  /** Total times this reminder has fired since the app launched. */
  firedThisSession: number
}

export type FocusStatus = 'idle' | 'running' | 'paused' | 'finished'
export type FocusPhase = 'focus' | 'shortBreak' | 'longBreak'

export interface FocusRuntime {
  status: FocusStatus
  mode: 'timer' | 'pomodoro'
  phase: FocusPhase
  totalSeconds: number
  remainingSeconds: number
  /** Epoch ms when the current phase began; null when idle. */
  startedAt: number | null
  /** Completed focus phases in the current pomodoro chain. */
  pomodoroCount: number
  /** Seconds of focus banked today, including the in-flight session. */
  todayFocusSeconds: number
}

/** An in-progress guided break, mirrored to the overlay windows. */
export interface ActiveBreak {
  kind: string
  message: string
  totalSeconds: number
  remainingSeconds: number
  allowSkip: boolean
  snoozeMinutes: number[]
  startedAt: number
}

export interface AppRuntime {
  /** Monotonically increasing; lets renderers drop out-of-order snapshots. */
  revision: number
  now: number
  reminders: Record<string, ReminderRuntime>
  focus: FocusRuntime
  activeBreak: ActiveBreak | null
  today: DailyStats
  streak: StreakInfo
  quietHoursActive: boolean
  doNotDisturbActive: boolean
  /** Seconds since the last keyboard/mouse input, from Electron's powerMonitor. */
  userIdleSeconds: number
  /** True while the mascot window is up and animating. */
  mascotVisible: boolean
  appVersion: string
}

export type MascotAnimation =
  | 'idle'
  | 'walk'
  | 'sleep'
  | 'wake'
  | 'wave'
  | 'lookAround'
  | 'knock'
  | 'jump'
  | 'drink'
  | 'blink'
  | 'stretch'
  | 'celebrate'

/** A command the main process sends to the mascot window. */
export type MascotCommand =
  | {
      type: 'announce'
      kind: string
      message: string
      emoji: string
      animation: MascotAnimation
      /** Walk on from off-screen instead of appearing in place (on-alert mode). */
      entrance?: boolean
    }
  | { type: 'dismiss'; celebrate: boolean }
  | { type: 'perform'; animation: MascotAnimation; entrance?: boolean }
  | { type: 'setIdle'; idleSeconds: number }
  | {
      type: 'config'
      size: number
      speed: number
      skin: string
      speechBubbles: boolean
      reducedMotion: boolean
      /** 'always' → wander freely; 'onAlert' → leave the stage when done. */
      visibility: 'always' | 'onAlert'
      homeX: number
    }

/** Screens the dashboard shell can be asked to open from the tray/shortcuts. */
export type AppRoute = 'dashboard' | 'focus' | 'reminders' | 'stats' | 'achievements' | 'settings'
