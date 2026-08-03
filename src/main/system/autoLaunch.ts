/**
 * "Launch at Windows startup".
 *
 * Electron's `setLoginItemSettings` writes the per-user Run key on Windows and a
 * LaunchAgent on macOS, which is exactly the right mechanism — no elevation, no
 * scheduled task, and it disappears cleanly on uninstall.
 *
 * `--hidden` is passed so an auto-started Nudge goes straight to the tray. A
 * wellness app that throws a window in your face during login is one people
 * disable on day two.
 */

import { app } from 'electron'
import { createLogger } from '../util/logger'

const log = createLogger('autolaunch')

/** The flag an auto-started instance sees in `process.argv`. */
export const HIDDEN_LAUNCH_FLAG = '--hidden'

export function wasStartedHidden(): boolean {
  return process.argv.includes(HIDDEN_LAUNCH_FLAG) || app.getLoginItemSettings().wasOpenedAsHidden
}

export function applyLaunchAtStartup(enabled: boolean): void {
  // In development the executable is `electron.exe` in node_modules; registering
  // that would create a startup entry that outlives the dev session.
  if (!app.isPackaged) {
    log.debug('skipping login item registration (unpackaged build)', { enabled })
    return
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true, // macOS
      args: enabled ? [HIDDEN_LAUNCH_FLAG] : [] // Windows/Linux
    })
    log.info('login item updated', { enabled })
  } catch (error) {
    log.error('failed to update login item', error)
  }
}

export function isLaunchAtStartupEnabled(): boolean {
  if (!app.isPackaged) return false
  try {
    return app.getLoginItemSettings().openAtLogin
  } catch {
    return false
  }
}
