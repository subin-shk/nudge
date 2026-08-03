/**
 * The dashboard shell.
 *
 * Frameless with a React-drawn title bar. That is a deliberate trade: a native
 * frame cannot follow nine themes (AMOLED black in particular looks broken
 * behind a light Windows caption), so the app draws its own and exposes
 * minimise / maximise / hide over IPC.
 *
 * Two behaviours users of tray apps expect and notice when missing:
 *   • `backgroundColor` is seeded from the active theme, so launching never
 *     flashes white before React paints.
 *   • Closing hides instead of quitting when "minimise to tray" is on, and the
 *     real quit path sets a flag so the window closes for good.
 */

import { BrowserWindow, shell } from 'electron'
import type { AppSettings } from '@shared/types'
import { createLogger } from '../util/logger'
import { loadRendererEntry, preloadPath, resourcePath } from './rendererEntry'

const log = createLogger('window:main')

const MIN_WIDTH = 900
const MIN_HEIGHT = 620

/** Approximate background per theme, used only to avoid a white launch flash. */
const THEME_BACKGROUNDS: Record<string, string> = {
  light: '#f6f8fc',
  dark: '#14161c',
  amoled: '#000000',
  ocean: '#0b2033',
  forest: '#0f1f18',
  sakura: '#fdf3f6',
  sunset: '#221317',
  purpleNight: '#160f26',
  minimalGray: '#f2f2f3',
  system: '#14161c'
}

export class MainWindow {
  private window: BrowserWindow | null = null
  /** Set by the app before a real quit, so `close` is allowed through. */
  private allowClose = false

  constructor(private readonly getSettings: () => AppSettings) {}

  create(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const settings = this.getSettings()

    const window = new BrowserWindow({
      width: 1080,
      height: 720,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      frame: false,
      backgroundColor: THEME_BACKGROUNDS[settings.general.theme] ?? THEME_BACKGROUNDS.dark,
      icon: resourcePath('icon.png'),
      title: 'Nudge',
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // The dashboard runs live countdowns; Chromium's background throttling
        // would make them stutter whenever the window loses focus.
        backgroundThrottling: false
      }
    })

    this.window = window

    window.once('ready-to-show', () => {
      if (!settings.general.startMinimized) window.show()
    })

    // Keep every external link in the user's browser — nothing in this app
    // should ever navigate the shell away from the React bundle.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    window.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
        event.preventDefault()
        void shell.openExternal(url)
      }
    })

    window.on('close', (event) => {
      if (this.allowClose) return
      if (this.getSettings().general.minimizeToTrayOnClose) {
        event.preventDefault()
        window.hide()
        log.debug('close intercepted → hidden to tray')
      }
    })

    window.on('closed', () => {
      this.window = null
    })

    void loadRendererEntry(window, 'index')
    log.info('created')
    return window
  }

  get(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  /** Create-if-needed, then bring to the front and focus. */
  show(): void {
    const window = this.get() ?? this.create()
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  hide(): void {
    this.get()?.hide()
  }

  toggle(): void {
    const window = this.get()
    if (window?.isVisible() && window.isFocused()) window.hide()
    else this.show()
  }

  minimize(): void {
    this.get()?.minimize()
  }

  toggleMaximize(): void {
    const window = this.get()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  }

  isMaximized(): boolean {
    return this.get()?.isMaximized() ?? false
  }

  isVisible(): boolean {
    return this.get()?.isVisible() ?? false
  }

  /** Allow the next `close` to actually destroy the window. */
  prepareForQuit(): void {
    this.allowClose = true
  }

  destroy(): void {
    this.allowClose = true
    this.get()?.destroy()
    this.window = null
  }
}
