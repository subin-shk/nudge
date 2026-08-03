/**
 * Full-screen break overlays.
 *
 * Multi-monitor rule: a break covers **every** display. Dimming one screen while
 * a user keeps reading the other defeats the entire purpose of a 20-20-20 break,
 * and it looks like a bug. Each display gets its own window; the primary one
 * shows the full countdown UI and the others show a calm secondary panel
 * (decided in the renderer from the `primary` query flag).
 *
 * Windows are created on demand and destroyed when the break ends rather than
 * being kept hidden. A hidden always-on-top full-screen window is a reliable way
 * to confuse both the user's alt-tab list and screen-capture software.
 */

import { BrowserWindow, screen } from 'electron'
import type { ActiveBreak } from '@shared/types'
import { createLogger } from '../util/logger'
import { loadRendererEntry, preloadPath } from './rendererEntry'

const log = createLogger('window:overlay')

export class OverlayWindows {
  private windows: BrowserWindow[] = []
  private current: ActiveBreak | null = null

  /** Are overlays currently on screen? */
  isOpen(): boolean {
    return this.windows.some((window) => !window.isDestroyed())
  }

  show(active: ActiveBreak): void {
    this.current = active

    if (this.isOpen()) {
      this.update(active)
      return
    }

    const displays = screen.getAllDisplays()
    const primaryId = screen.getPrimaryDisplay().id

    this.windows = displays.map((display) => {
      const window = new BrowserWindow({
        // `bounds`, not `workArea`: the overlay must cover the taskbar too.
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        // Focusable so Esc-to-skip works without the user clicking first.
        focusable: true,
        title: 'Nudge Break',
        webPreferences: {
          preload: preloadPath(),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
          backgroundThrottling: false
        }
      })

      // 'screen-saver' is the highest ordinary level — a break should sit above
      // full-screen video, which is exactly when people forget to blink.
      window.setAlwaysOnTop(true, 'screen-saver')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

      window.once('ready-to-show', () => {
        window.show()
        if (display.id === primaryId) window.focus()
        // Push state immediately: the window may have been created mid-countdown.
        if (this.current) window.webContents.send('break:update', this.current)
      })

      window.on('closed', () => {
        this.windows = this.windows.filter((candidate) => candidate !== window)
      })

      void loadRendererEntry(window, 'overlay', {
        primary: display.id === primaryId ? '1' : '0',
        displayId: String(display.id)
      })

      return window
    })

    log.info('overlays shown', { displays: this.windows.length })
  }

  update(active: ActiveBreak): void {
    this.current = active
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.webContents.send('break:update', active)
    }
  }

  hide(): void {
    if (!this.isOpen()) {
      this.current = null
      return
    }
    // Tell the renderer first so it can play its exit animation, then destroy
    // after one animation frame budget. Destroying immediately makes the break
    // vanish with a snap that reads as a crash.
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.webContents.send('break:update', null)
    }
    const toClose = [...this.windows]
    this.windows = []
    this.current = null

    setTimeout(() => {
      for (const window of toClose) {
        if (!window.isDestroyed()) window.destroy()
      }
    }, 260)

    log.info('overlays hidden')
  }

  /** Rebuild for a changed monitor layout while a break is in flight. */
  handleDisplayChange(): void {
    if (!this.isOpen() || !this.current) return
    const active = this.current
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.windows = []
    this.show(active)
    log.info('overlays rebuilt for display change')
  }

  destroy(): void {
    for (const window of this.windows) {
      if (!window.isDestroyed()) window.destroy()
    }
    this.windows = []
    this.current = null
  }
}
