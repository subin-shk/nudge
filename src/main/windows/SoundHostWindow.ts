/**
 * The audio host.
 *
 * The Electron main process has no audio stack, so *something* with a Web Audio
 * context has to play notification sounds. The dashboard cannot be it — Nudge
 * spends most of its life closed to the tray, and a reminder that is silent
 * unless the window happens to be open is worse than no reminder.
 *
 * So: one 1×1 invisible window whose only job is to own an AudioContext.
 * It costs a few MB, never paints, and makes sound completely independent of
 * whether any real UI is visible.
 *
 * Two flags make it actually work:
 *   • `backgroundThrottling: false` — a throttled renderer stalls scheduled
 *     Web Audio nodes, producing chimes that arrive seconds late.
 *   • `autoplayPolicy: 'no-user-gesture-required'` — there is no user gesture in
 *     a window the user cannot see or click.
 */

import { BrowserWindow } from 'electron'
import type { SoundRequest } from '@shared/ipc'
import { createLogger } from '../util/logger'
import { loadRendererEntry, preloadPath } from './rendererEntry'

const log = createLogger('window:sound')

export class SoundHostWindow {
  private window: BrowserWindow | null = null
  private ready = false
  /** Requests that arrived before the host finished loading. */
  private queue: SoundRequest[] = []

  create(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const window = new BrowserWindow({
      width: 1,
      height: 1,
      x: -10_000, // parked off-screen as belt-and-braces alongside `show: false`
      y: -10_000,
      show: false,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      title: 'Nudge Audio',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    this.window = window

    window.webContents.once('did-finish-load', () => {
      this.ready = true
      for (const request of this.queue.splice(0)) this.play(request)
      log.info('audio host ready')
    })

    window.on('closed', () => {
      this.window = null
      this.ready = false
    })

    void loadRendererEntry(window, 'sound')
    return window
  }

  play(request: SoundRequest): void {
    const window = this.window && !this.window.isDestroyed() ? this.window : this.create()
    if (!this.ready) {
      // Bound the queue: a burst at startup should not play twelve chimes at once.
      if (this.queue.length < 3) this.queue.push(request)
      return
    }
    window.webContents.send('sound:play', request)
  }

  destroy(): void {
    this.queue = []
    this.ready = false
    const window = this.window
    if (window && !window.isDestroyed()) window.destroy()
    this.window = null
  }
}
