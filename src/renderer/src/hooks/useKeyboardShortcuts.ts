/**
 * In-window keyboard shortcuts.
 *
 * Distinct from the *global* shortcuts registered by the main process: these
 * only fire while the dashboard has focus, so they can use plain single keys
 * without colliding with anything system-wide.
 *
 *   1–6      jump to a screen
 *   Space    start / pause the focus timer
 *   Esc      back to the dashboard
 *   Ctrl+,   settings (the platform convention)
 *
 * Keystrokes are ignored while the user is typing in a field — the single most
 * common way app-level shortcuts become infuriating.
 */

import { useEffect } from 'react'
import type { AppRoute } from '@shared/types'
import { useAppStore } from '../store/useAppStore'

const ROUTE_BY_DIGIT: Record<string, AppRoute> = {
  '1': 'dashboard',
  '2': 'focus',
  '3': 'reminders',
  '4': 'stats',
  '5': 'achievements',
  '6': 'settings'
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return

      const store = useAppStore.getState()

      if (event.ctrlKey && event.key === ',') {
        event.preventDefault()
        store.setRoute('settings')
        return
      }

      if (event.ctrlKey || event.altKey || event.metaKey) return

      if (event.key === 'Escape') {
        store.setRoute('dashboard')
        return
      }

      const route = ROUTE_BY_DIGIT[event.key]
      if (route) {
        event.preventDefault()
        store.setRoute(route)
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        const { status } = store.runtime.focus
        if (status === 'running') void window.nudge.focus.pause()
        else if (status === 'paused') void window.nudge.focus.resume()
        else void window.nudge.focus.start(store.settings.focus.defaultMinutes, 'timer')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
