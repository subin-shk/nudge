/**
 * Global keyboard shortcuts.
 *
 * `globalShortcut.register` returns false when another application already owns
 * the accelerator. That failure is surfaced to the user as a toast rather than
 * swallowed — a shortcut that silently does nothing is the kind of bug people
 * never report and always resent.
 */

import { globalShortcut } from 'electron'
import { SHORTCUT_ACTIONS, type ShortcutAction, type ShortcutSettings } from '@shared/types/settings'
import { createLogger } from '../util/logger'

const log = createLogger('shortcuts')

export type ShortcutHandlers = Record<ShortcutAction, () => void>

export class ShortcutService {
  private registered = new Map<ShortcutAction, string>()

  constructor(private readonly handlers: ShortcutHandlers) {}

  /**
   * Reconcile the OS registration with `settings.shortcuts`.
   * Returns accelerators that could not be claimed, for user feedback.
   */
  apply(settings: ShortcutSettings): string[] {
    const failures: string[] = []

    for (const action of SHORTCUT_ACTIONS) {
      const desired = settings[action]
      const current = this.registered.get(action) ?? null
      if (desired === current) continue

      if (current) {
        globalShortcut.unregister(current)
        this.registered.delete(action)
      }
      if (!desired) continue

      // Two actions bound to the same accelerator: first one wins, and the
      // second is reported so the settings UI can show the clash.
      if ([...this.registered.values()].includes(desired)) {
        failures.push(desired)
        continue
      }

      let ok = false
      try {
        ok = globalShortcut.register(desired, () => {
          log.debug('shortcut fired', { action, accelerator: desired })
          this.handlers[action]()
        })
      } catch (error) {
        log.warn('invalid accelerator', { action, accelerator: desired, error: String(error) })
      }

      if (ok) this.registered.set(action, desired)
      else failures.push(desired)
    }

    if (failures.length > 0) log.warn('shortcuts unavailable', { failures })
    return failures
  }

  dispose(): void {
    globalShortcut.unregisterAll()
    this.registered.clear()
  }
}
