/**
 * The renderer's single store.
 *
 * Division of responsibility with the main process:
 *
 *   • **Main owns truth.** Settings and runtime both arrive as complete snapshots
 *     pushed over IPC. The store never derives a countdown or a schedule.
 *   • **The store owns optimism.** A settings write is applied locally *first*, so
 *     dragging the mascot-size slider is instant, then sent to main. Main's
 *     authoritative broadcast lands a few milliseconds later and replaces it.
 *     Without this, every control would lag by a full IPC round trip.
 *   • **Stale snapshots are dropped** using the monotonic `revision`, so an
 *     out-of-order push can never rewind a live countdown.
 */

import { create } from 'zustand'
import type { AppRoute, AppRuntime, AppSettings } from '@shared/types'
import type { ToastMessage, UpdateStatus } from '@shared/ipc'
import { createDefaultSettings } from '@shared/defaults'
import { emptyRuntime } from './emptyRuntime'
import type { DeepPartial } from '@shared/util'
import { deepMerge } from '@shared/util'

interface AppState {
  /** False until the first bootstrap response lands. */
  ready: boolean
  settings: AppSettings
  runtime: AppRuntime
  route: AppRoute
  toasts: ToastMessage[]
  updateStatus: UpdateStatus

  /* actions */
  init: () => Promise<void>
  setRoute: (route: AppRoute) => void
  patchSettings: (patch: DeepPartial<AppSettings>) => Promise<void>
  applySettings: (settings: AppSettings) => void
  applyRuntime: (runtime: AppRuntime) => void
  pushToast: (toast: ToastMessage) => void
  dismissToast: (id: string) => void
}

/** Toasts are transient; more than a few stacked is noise, not information. */
const MAX_TOASTS = 3

export const useAppStore = create<AppState>()((set, get) => ({
  ready: false,
  settings: createDefaultSettings(),
  runtime: emptyRuntime(),
  route: 'dashboard',
  toasts: [],
  updateStatus: { supported: false, checking: false, available: false, version: null, error: null },

  async init() {
    const { settings, runtime } = await window.nudge.bootstrap()
    set({ settings, runtime, ready: true })

    // Subscriptions live for the lifetime of the window, so they are never
    // torn down — the window closing is the teardown.
    window.nudge.on.settings((next) => get().applySettings(next))
    window.nudge.on.runtime((next) => get().applyRuntime(next))
    window.nudge.on.navigate((route) => set({ route }))
    window.nudge.on.toast((toast) => get().pushToast(toast))
    window.nudge.on.updateStatus((updateStatus) => set({ updateStatus }))

    void window.nudge.updates.status().then((updateStatus) => set({ updateStatus }))
  },

  setRoute(route) {
    set({ route })
  },

  async patchSettings(patch) {
    // Optimistic: update local state now, reconcile when main echoes back.
    // The explicit type argument keeps `deepMerge` returning AppSettings rather
    // than widening to the patch's partial shape.
    set((state) => ({ settings: deepMerge<AppSettings>(state.settings, patch) }))
    const authoritative = await window.nudge.settings.patch(patch)
    set({ settings: authoritative })
  },

  applySettings(settings) {
    set({ settings })
  },

  applyRuntime(runtime) {
    // Guard against out-of-order delivery; `revision` only ever increases.
    if (runtime.revision < get().runtime.revision) return
    set({ runtime })
  },

  pushToast(toast) {
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_TOASTS) }))
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  }
}))

/* Narrow selectors keep re-renders tight: a 1 Hz runtime push must not re-render
   the settings screen. */

export const useSettings = (): AppSettings => useAppStore((state) => state.settings)
export const useRuntime = (): AppRuntime => useAppStore((state) => state.runtime)
export const useRoute = (): AppRoute => useAppStore((state) => state.route)
export const useReady = (): boolean => useAppStore((state) => state.ready)
export const useToasts = (): ToastMessage[] => useAppStore((state) => state.toasts)
export const useUpdateStatus = (): UpdateStatus => useAppStore((state) => state.updateStatus)

export const usePatchSettings = (): AppState['patchSettings'] => useAppStore((state) => state.patchSettings)
export const useSetRoute = (): AppState['setRoute'] => useAppStore((state) => state.setRoute)

/** Runtime for one reminder kind, or undefined if it is not registered. */
export const useReminderRuntime = (kind: string) => useAppStore((state) => state.runtime.reminders[kind])
export const useFocusRuntime = () => useAppStore((state) => state.runtime.focus)
export const useToday = () => useAppStore((state) => state.runtime.today)
export const useStreak = () => useAppStore((state) => state.runtime.streak)
