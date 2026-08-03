/**
 * The IPC contract.
 *
 * This file is the ONLY place a channel name is written down. Main registers
 * handlers against `IpcCommandMap`, preload exposes a typed façade over it, and
 * the renderer consumes that façade — so a typo or a shape change breaks the
 * build in all three processes instead of failing silently at runtime.
 *
 * Two directions, two mechanisms:
 *   • Commands — renderer → main, request/response, via `ipcRenderer.invoke`.
 *   • Events   — main → renderer, fire-and-forget, via `webContents.send`.
 */

import type {
  AchievementProgress,
  ActiveBreak,
  AppRoute,
  AppRuntime,
  AppSettings,
  DailyStats,
  MascotCommand,
  RangeSummary,
  SoundId
} from './types'
import type { DeepPartial } from './util'

export interface SoundRequest {
  soundId: SoundId
  /** Final gain 0..1 — the main process has already applied master × feature. */
  volume: number
  customPath: string | null
  /** Correlates a preview request with its "finished" reply. */
  requestId?: string
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  workArea: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  isPrimary: boolean
}

export interface ToastMessage {
  id: string
  tone: 'info' | 'success' | 'warning'
  title: string
  body?: string
  /** Milliseconds before auto-dismiss; 0 keeps it until clicked. */
  timeoutMs: number
}

export type FocusStartRequest = {
  /** Total duration for a plain timer. Ignored in pomodoro mode. */
  minutes: number
  mode: 'timer' | 'pomodoro'
}

export interface ImportResult {
  ok: boolean
  /** Present on success — the imported (and re-validated) settings. */
  settings?: AppSettings
  /** Present on failure — a human-readable reason. */
  error?: string
}

export interface UpdateStatus {
  supported: boolean
  checking: boolean
  available: boolean
  version: string | null
  error: string | null
}

export interface BreakActionRequest {
  kind: string
  /** Only meaningful for 'snooze'. */
  minutes?: number
}

export interface IpcCommandMap {
  /** One round-trip on window open: settings + runtime together. */
  'app:bootstrap': { request: void; response: { settings: AppSettings; runtime: AppRuntime } }
  'app:quit': { request: void; response: void }

  'settings:get': { request: void; response: AppSettings }
  'settings:patch': { request: DeepPartial<AppSettings>; response: AppSettings }
  'settings:reset': { request: void; response: AppSettings }
  'settings:export': { request: void; response: { ok: boolean; path?: string; error?: string } }
  'settings:import': { request: void; response: ImportResult }

  /** Fire a reminder right now, out of band ("Drink water now"). */
  'reminder:triggerNow': { request: { kind: string }; response: void }
  'reminder:complete': { request: BreakActionRequest; response: void }
  'reminder:skip': { request: BreakActionRequest; response: void }
  'reminder:snooze': { request: BreakActionRequest; response: void }
  /** Restart this reminder's interval from now (the "I just drank" button). */
  'reminder:restartInterval': { request: { kind: string }; response: void }
  'reminder:setEnabled': { request: { kind: string; enabled: boolean }; response: void }

  'focus:start': { request: FocusStartRequest; response: void }
  'focus:pause': { request: void; response: void }
  'focus:resume': { request: void; response: void }
  'focus:stop': { request: void; response: void }
  'focus:extend': { request: { minutes: number }; response: void }
  /** Skip to the next pomodoro phase without completing the current one. */
  'focus:skipPhase': { request: void; response: void }

  'stats:range': { request: { from: string; to: string }; response: RangeSummary }
  'stats:recentDays': { request: { days: number }; response: DailyStats[] }
  'stats:achievements': { request: void; response: AchievementProgress[] }
  'stats:lifetime': {
    request: void
    response: { focusSeconds: number; completed: Record<string, number>; skipped: Record<string, number>; activeDays: number; firstDay: string | null }
  }
  'stats:clear': { request: void; response: void }

  'dnd:set': { request: { enabled: boolean; forMinutes?: number | null }; response: void }

  'mascot:setEnabled': { request: { enabled: boolean }; response: void }
  /** Sent by the mascot renderer so main can toggle click-through per hover. */
  'mascot:setInteractive': { request: { interactive: boolean }; response: void }
  /** The mascot was clicked — say hello, or acknowledge a pending reminder. */
  'mascot:poke': { request: void; response: void }
  /**
   * On-alert mode: the mascot has finished its errand and walked off-screen, so
   * the window can be hidden. Reported by the renderer because only it knows
   * when the walk-out animation actually completed.
   */
  'mascot:retired': { request: void; response: void }

  'sound:preview': { request: { soundId: SoundId; volume: number; customPath: string | null }; response: void }
  'sound:pickCustomFile': { request: void; response: { path: string | null } }

  'window:minimize': { request: void; response: void }
  'window:toggleMaximize': { request: void; response: void }
  'window:hide': { request: void; response: void }
  'window:isMaximized': { request: void; response: boolean }
  'system:displays': { request: void; response: DisplayInfo[] }
  'system:openExternal': { request: { url: string }; response: void }
  'system:openDataFolder': { request: void; response: void }

  'update:status': { request: void; response: UpdateStatus }
  'update:check': { request: void; response: UpdateStatus }
}

export type IpcCommandChannel = keyof IpcCommandMap
export type IpcRequest<K extends IpcCommandChannel> = IpcCommandMap[K]['request']
export type IpcResponse<K extends IpcCommandChannel> = IpcCommandMap[K]['response']

export interface IpcEventMap {
  /** ~1 Hz while anything is counting, plus immediately on every change. */
  'runtime:update': AppRuntime
  'settings:update': AppSettings
  /** Tray / global shortcut asked the shell to show a specific screen. */
  'app:navigate': AppRoute
  'app:toast': ToastMessage
  /** Break overlay windows only. `null` tears the overlay down. */
  'break:update': ActiveBreak | null
  /** Mascot window only. */
  'mascot:command': MascotCommand
  /** Audio host window only. */
  'sound:play': SoundRequest
  'update:status': UpdateStatus
}

export type IpcEventChannel = keyof IpcEventMap
export type IpcEventPayload<K extends IpcEventChannel> = IpcEventMap[K]

/** Runtime-checkable list used by the preload allow-list. */
export const IPC_EVENT_CHANNELS: IpcEventChannel[] = [
  'runtime:update',
  'settings:update',
  'app:navigate',
  'app:toast',
  'break:update',
  'mascot:command',
  'sound:play',
  'update:status'
]

export const IPC_COMMAND_CHANNELS: IpcCommandChannel[] = [
  'app:bootstrap',
  'app:quit',
  'settings:get',
  'settings:patch',
  'settings:reset',
  'settings:export',
  'settings:import',
  'reminder:triggerNow',
  'reminder:complete',
  'reminder:skip',
  'reminder:snooze',
  'reminder:restartInterval',
  'reminder:setEnabled',
  'focus:start',
  'focus:pause',
  'focus:resume',
  'focus:stop',
  'focus:extend',
  'focus:skipPhase',
  'stats:range',
  'stats:recentDays',
  'stats:achievements',
  'stats:lifetime',
  'stats:clear',
  'dnd:set',
  'mascot:setEnabled',
  'mascot:setInteractive',
  'mascot:poke',
  'mascot:retired',
  'sound:preview',
  'sound:pickCustomFile',
  'window:minimize',
  'window:toggleMaximize',
  'window:hide',
  'window:isMaximized',
  'system:displays',
  'system:openExternal',
  'system:openDataFolder',
  'update:status',
  'update:check'
]
