/**
 * Main-process entry point.
 *
 * Kept deliberately small: acquire the single-instance lock, configure logging,
 * hand everything else to `AppController`. Startup order is the one thing this
 * file owns, and it matters — see the comments inline.
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { AppController } from './app/AppController'
import { registerHandlers } from './ipc/registerHandlers'
import type { IpcRouter } from './ipc/router'
import { configureLogger, createLogger } from './util/logger'

/**
 * Nudge is a tray app with global shortcuts and a single tray icon: a second
 * instance would double every reminder and fight over the same data files.
 * The lock must be requested before anything else touches disk.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

configureLogger({
  directory: join(app.getPath('userData'), 'logs'),
  level: app.isPackaged ? 'info' : 'debug'
})

const log = createLogger('main')

// Windows uses this for toast attribution and taskbar grouping. Without it,
// notifications show up as "electron.app.Electron".
app.setAppUserModelId('app.nudge.desktop')

let controller: AppController | null = null
let router: IpcRouter | null = null

app.on('second-instance', () => {
  log.info('second instance launched — focusing the existing window')
  controller?.focusExistingWindow()
})

app.whenReady().then(async () => {
  try {
    controller = new AppController()
    // Handlers are registered before `start()` so a renderer that loads fast
    // cannot invoke a channel that does not exist yet.
    router = registerHandlers(controller)
    await controller.start()
  } catch (error) {
    log.error('fatal error during startup', error)
    app.quit()
  }
})

/**
 * Nudge intentionally does NOT quit when its last window closes — that is the
 * whole point of a tray app. Quitting happens through the tray menu, the
 * dashboard's quit action, or an OS shutdown.
 */
app.on('window-all-closed', () => {
  log.debug('all windows closed — staying alive in the tray')
})

// macOS: re-open the dashboard when the dock icon is clicked.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) controller?.focusExistingWindow()
})

app.on('before-quit', () => {
  // Runs before windows are destroyed, so pending writes still have a chance.
  void controller?.dispose()
  router?.dispose()
})

process.on('uncaughtException', (error) => {
  log.error('uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  log.error('unhandled rejection', reason)
})
