/**
 * The desktop mascot's window.
 *
 * The key architectural decision: **the window does not move.** It is a
 * transparent strip spanning the full width of the chosen display, pinned to the
 * top or bottom edge, and the mascot walks *inside* it via CSS transforms.
 *
 * The obvious alternative — a small window that `setPosition`s its way across
 * the screen — looks fine in a demo and terrible in practice: window moves on
 * Windows are not vsynced, cost an IPC round trip per frame, and produce visible
 * tearing against the desktop. A stationary strip gives a GPU-composited
 * 60 fps walk cycle for free.
 *
 * Click-through is handled with `setIgnoreMouseEvents(true, { forward: true })`:
 * the strip is transparent to clicks, but still receives `mousemove`, so the
 * renderer can hit-test the mascot's own bounds and ask for interactivity only
 * while the pointer is actually over the character.
 */

import { BrowserWindow, screen } from 'electron'
import type { Display } from 'electron'
import type { AppSettings, MascotCommand } from '@shared/types'
import { createLogger } from '../util/logger'
import { loadRendererEntry, preloadPath } from './rendererEntry'

const log = createLogger('window:mascot')

/**
 * Vertical room above the character for the speech bubble, as a multiple of the
 * mascot's height. Bubbles are two lines plus padding at the largest size.
 */
const BUBBLE_HEADROOM = 1.6

export class MascotWindow {
  private window: BrowserWindow | null = null
  private interactive = false

  constructor(private readonly getSettings: () => AppSettings) {}

  private targetDisplay(): Display {
    const { displayId } = this.getSettings().mascot
    if (displayId !== null) {
      const match = screen.getAllDisplays().find((display) => display.id === displayId)
      if (match) return match
    }
    return screen.getPrimaryDisplay()
  }

  /**
   * The strip's bounds on the target display.
   *
   * `workArea` (not `bounds`) is used so the mascot stands on top of the
   * taskbar rather than behind it, and `offset` lets the user lift it clear of
   * a dock or a second taskbar.
   */
  private computeBounds(): Electron.Rectangle {
    const settings = this.getSettings().mascot
    const display = this.targetDisplay()
    const area = display.workArea

    const stripHeight = Math.round(settings.size * (1 + BUBBLE_HEADROOM))
    const height = Math.min(stripHeight, area.height)

    const desiredY =
      settings.edge === 'bottom'
        ? area.y + area.height - height - settings.offset
        : area.y + settings.offset

    // A user-supplied offset may push the strip past an edge. Allow half of it
    // to overhang — enough for "peeking over the top" placements — but never let
    // the strip leave the display entirely.
    const minY = area.y - Math.floor(height / 2)
    const maxY = area.y + area.height - Math.ceil(height / 2)

    return {
      x: area.x,
      y: Math.round(Math.min(Math.max(desiredY, minY), maxY)),
      width: area.width,
      height
    }
  }

  create(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const bounds = this.computeBounds()

    const window = new BrowserWindow({
      ...bounds,
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
      // Never steal keyboard focus from whatever the user is typing in.
      focusable: false,
      acceptFirstMouse: true,
      title: 'Nudge Mascot',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // Without this the walk cycle freezes the moment the strip is not the
        // focused window — which is essentially always.
        backgroundThrottling: false
      }
    })

    this.window = window

    // 'pop-up-menu' floats above normal windows without fighting full-screen
    // apps for the very top layer (that is reserved for the break overlay).
    window.setAlwaysOnTop(true, 'pop-up-menu')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    window.setIgnoreMouseEvents(this.getSettings().mascot.clickThrough, { forward: true })

    window.once('ready-to-show', () => {
      // In on-alert mode the window is built but stays hidden until something
      // needs delivering — building it up front keeps the entrance instant.
      if (this.getSettings().mascot.visibility === 'always') window.showInactive()
      this.pushConfig()
    })

    window.on('closed', () => {
      this.window = null
    })

    void loadRendererEntry(window, 'mascot')
    log.info('created', bounds)
    return window
  }

  get(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  /**
   * Can the mascot deliver a message right now?
   *
   * True whenever the window exists — including while hidden in on-alert mode,
   * where `present()` brings it on stage. Checking `isVisible()` here would make
   * on-alert mode silently drop every mascot announcement.
   */
  isAvailable(): boolean {
    return this.get() !== null
  }

  /** Is the mascot actually on screen? Reported in the runtime snapshot. */
  isOnScreen(): boolean {
    const window = this.get()
    return window !== null && window.isVisible()
  }

  /** Bring the mascot on stage (on-alert mode). No-op if already visible. */
  present(): void {
    const window = this.get() ?? (this.getSettings().mascot.enabled ? this.create() : null)
    if (window && !window.isVisible()) {
      window.showInactive()
      log.debug('presented for alert')
    }
  }

  /**
   * Take the mascot off stage after it has walked out of frame.
   * Called from the renderer's `mascot:retired` report — only it knows when the
   * walk-out animation actually finished.
   */
  retire(): void {
    if (this.getSettings().mascot.visibility !== 'onAlert') return
    const window = this.get()
    if (window?.isVisible()) {
      window.hide()
      log.debug('retired off stage')
    }
  }

  destroy(): void {
    const window = this.get()
    if (window) {
      window.destroy()
      log.info('destroyed')
    }
    this.window = null
  }

  /** Reconcile the window with `settings.mascot.enabled` and `.visibility`. */
  sync(): void {
    const settings = this.getSettings()

    if (!settings.mascot.enabled) {
      this.destroy()
      return
    }

    const existed = this.get() !== null
    const window = this.get() ?? this.create()
    if (!existed) return // `ready-to-show` handles first presentation

    this.applyBounds()
    this.pushConfig()

    if (settings.mascot.visibility === 'always') {
      if (!window.isVisible()) window.showInactive()
    } else if (window.isVisible()) {
      // Switched to on-alert while on screen: walk off rather than blink out.
      this.send({ type: 'dismiss', celebrate: false })
    }
  }

  applyBounds(): void {
    const window = this.get()
    if (!window) return
    const bounds = this.computeBounds()
    window.setBounds(bounds)
    window.setIgnoreMouseEvents(this.getSettings().mascot.clickThrough && !this.interactive, { forward: true })
    log.debug('bounds applied', bounds)
  }

  /**
   * Toggle click-through on the fly.
   *
   * The renderer calls this as the pointer enters and leaves the mascot's own
   * bounding box, which is what makes a click-through window still clickable
   * exactly where the character is.
   */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive
    const window = this.get()
    if (!window) return
    const clickThrough = this.getSettings().mascot.clickThrough
    window.setIgnoreMouseEvents(clickThrough && !interactive, { forward: true })
  }

  send(command: MascotCommand): void {
    this.get()?.webContents.send('mascot:command', command)
  }

  /** Mirror the relevant settings into the renderer's animation system. */
  pushConfig(): void {
    const settings = this.getSettings()
    this.send({
      type: 'config',
      size: settings.mascot.size,
      speed: settings.mascot.speed,
      skin: settings.mascot.skin,
      speechBubbles: settings.mascot.speechBubbles,
      reducedMotion: settings.general.reducedMotion,
      visibility: settings.mascot.visibility,
      homeX: settings.mascot.homeX
    })
  }
}
