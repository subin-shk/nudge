/**
 * The preload bridge — the *only* path between renderer and main.
 *
 * Security posture:
 *   • `contextIsolation` is on and `nodeIntegration` is off, so the renderer has
 *     no `require`, no `process`, no filesystem.
 *   • Channels are allow-listed from the shared contract. `invoke` refuses any
 *     name that is not in `IPC_COMMAND_CHANNELS`, and `on` refuses any event that
 *     is not in `IPC_EVENT_CHANNELS`. A compromised renderer therefore cannot
 *     reach an unintended handler even by guessing channel names.
 *   • The exposed surface is a *structured API*, not a raw `invoke`. UI code
 *     reads `nudge.reminders.snooze('water', 5)` instead of assembling channel
 *     strings, which is both nicer and impossible to typo into a silent no-op.
 *
 * The same bundle loads into all four renderers; each uses the slice it needs.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  IPC_COMMAND_CHANNELS,
  IPC_EVENT_CHANNELS,
  type IpcCommandChannel,
  type IpcEventChannel,
  type IpcEventPayload,
  type IpcRequest,
  type IpcResponse
} from '@shared/ipc'
import type { AppRoute, AppSettings, SoundId } from '@shared/types'
import type { DeepPartial } from '@shared/util'

const commandAllowList = new Set<string>(IPC_COMMAND_CHANNELS)
const eventAllowList = new Set<string>(IPC_EVENT_CHANNELS)

function invoke<K extends IpcCommandChannel>(channel: K, payload?: IpcRequest<K>): Promise<IpcResponse<K>> {
  if (!commandAllowList.has(channel)) {
    return Promise.reject(new Error(`Blocked IPC command: ${channel}`))
  }
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<K>>
}

/** Subscribe to a main→renderer event. Returns an unsubscribe function. */
function subscribe<K extends IpcEventChannel>(channel: K, listener: (payload: IpcEventPayload<K>) => void): () => void {
  if (!eventAllowList.has(channel)) {
    throw new Error(`Blocked IPC event: ${channel}`)
  }
  const wrapped = (_event: IpcRendererEvent, payload: IpcEventPayload<K>): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

/* The exposed API                                                            */

const api = {
  bootstrap: () => invoke('app:bootstrap'),
  quit: () => invoke('app:quit'),

  settings: {
    get: () => invoke('settings:get'),
    patch: (patch: DeepPartial<AppSettings>) => invoke('settings:patch', patch),
    reset: () => invoke('settings:reset'),
    export: () => invoke('settings:export'),
    import: () => invoke('settings:import')
  },

  reminders: {
    triggerNow: (kind: string) => invoke('reminder:triggerNow', { kind }),
    complete: (kind: string) => invoke('reminder:complete', { kind }),
    skip: (kind: string) => invoke('reminder:skip', { kind }),
    snooze: (kind: string, minutes: number) => invoke('reminder:snooze', { kind, minutes }),
    restartInterval: (kind: string) => invoke('reminder:restartInterval', { kind }),
    setEnabled: (kind: string, enabled: boolean) => invoke('reminder:setEnabled', { kind, enabled })
  },

  focus: {
    start: (minutes: number, mode: 'timer' | 'pomodoro' = 'timer') => invoke('focus:start', { minutes, mode }),
    pause: () => invoke('focus:pause'),
    resume: () => invoke('focus:resume'),
    stop: () => invoke('focus:stop'),
    extend: (minutes: number) => invoke('focus:extend', { minutes }),
    skipPhase: () => invoke('focus:skipPhase')
  },

  stats: {
    range: (from: string, to: string) => invoke('stats:range', { from, to }),
    recentDays: (days: number) => invoke('stats:recentDays', { days }),
    achievements: () => invoke('stats:achievements'),
    lifetime: () => invoke('stats:lifetime'),
    clear: () => invoke('stats:clear')
  },

  dnd: {
    set: (enabled: boolean, forMinutes: number | null = null) => invoke('dnd:set', { enabled, forMinutes })
  },

  mascot: {
    setEnabled: (enabled: boolean) => invoke('mascot:setEnabled', { enabled }),
    /** Called on pointer enter/leave of the mascot's hit box. */
    setInteractive: (interactive: boolean) => invoke('mascot:setInteractive', { interactive }),
    poke: () => invoke('mascot:poke'),
    /** On-alert mode: reported once the walk-out animation has finished. */
    reportRetired: () => invoke('mascot:retired')
  },

  sound: {
    preview: (soundId: SoundId, volume: number, customPath: string | null = null) =>
      invoke('sound:preview', { soundId, volume, customPath }),
    pickCustomFile: () => invoke('sound:pickCustomFile')
  },

  window: {
    minimize: () => invoke('window:minimize'),
    toggleMaximize: () => invoke('window:toggleMaximize'),
    hide: () => invoke('window:hide'),
    isMaximized: () => invoke('window:isMaximized')
  },
  system: {
    displays: () => invoke('system:displays'),
    openExternal: (url: string) => invoke('system:openExternal', { url }),
    openDataFolder: () => invoke('system:openDataFolder')
  },
  updates: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check')
  },

  on: {
    runtime: (listener: (payload: IpcEventPayload<'runtime:update'>) => void) => subscribe('runtime:update', listener),
    settings: (listener: (payload: AppSettings) => void) => subscribe('settings:update', listener),
    navigate: (listener: (route: AppRoute) => void) => subscribe('app:navigate', listener),
    toast: (listener: (payload: IpcEventPayload<'app:toast'>) => void) => subscribe('app:toast', listener),
    /** Break-overlay windows only. */
    breakUpdate: (listener: (payload: IpcEventPayload<'break:update'>) => void) => subscribe('break:update', listener),
    /** Mascot window only. */
    mascotCommand: (listener: (payload: IpcEventPayload<'mascot:command'>) => void) => subscribe('mascot:command', listener),
    /** Audio-host window only. */
    soundPlay: (listener: (payload: IpcEventPayload<'sound:play'>) => void) => subscribe('sound:play', listener),
    updateStatus: (listener: (payload: IpcEventPayload<'update:status'>) => void) => subscribe('update:status', listener)
  }
}

export type NudgeApi = typeof api

contextBridge.exposeInMainWorld('nudge', api)
