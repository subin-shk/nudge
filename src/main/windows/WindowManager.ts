/**
 * Facade over every window Nudge owns, and the single place messages are
 * broadcast to renderers.
 *
 * It implements the narrow ports the domain services depend on
 * (`BreakPresenter`, `MascotPort`, `ToastPort`, `SoundPlayerPort`), which is what
 * keeps the reminder engine and the notification service free of any Electron
 * import — and therefore unit-testable without spinning up a browser.
 */

import { screen } from 'electron'
import type { ActiveBreak, AppRoute, AppRuntime, AppSettings, MascotAnimation, MascotCommand } from '@shared/types'
import type { DisplayInfo, IpcEventMap, SoundRequest, ToastMessage, UpdateStatus } from '@shared/ipc'
import { createLogger } from '../util/logger'
import { MainWindow } from './MainWindow'
import { MascotWindow } from './MascotWindow'
import { OverlayWindows } from './OverlayWindows'
import { SoundHostWindow } from './SoundHostWindow'

const log = createLogger('windows')

export class WindowManager {
  readonly main: MainWindow
  readonly mascot: MascotWindow
  readonly overlays: OverlayWindows
  readonly sound: SoundHostWindow

  constructor(private readonly getSettings: () => AppSettings) {
    this.main = new MainWindow(getSettings)
    this.mascot = new MascotWindow(getSettings)
    this.overlays = new OverlayWindows()
    this.sound = new SoundHostWindow()
  }

  /** Create the windows that should exist from launch. */
  bootstrap(): void {
    // The audio host comes up first so the very first reminder is not silent.
    this.sound.create()
    // Always constructed; `ready-to-show` decides whether it is shown, honouring
    // the startMinimized setting.
    this.main.create()
    this.mascot.sync()
  }

  private sendTo(target: 'main' | 'overlays' | 'mascot', channel: keyof IpcEventMap, payload: unknown): void {
    if (target === 'main') {
      const window = this.main.get()
      if (window && !window.isDestroyed()) window.webContents.send(channel, payload)
      return
    }
    if (target === 'mascot') {
      this.mascot.send(payload as MascotCommand)
    }
  }

  broadcastRuntime(runtime: AppRuntime): void {
    this.sendTo('main', 'runtime:update', runtime)
  }

  broadcastSettings(settings: AppSettings): void {
    this.sendTo('main', 'settings:update', settings)
  }

  broadcastUpdateStatus(status: UpdateStatus): void {
    this.sendTo('main', 'update:status', status)
  }

  navigate(route: AppRoute): void {
    this.main.show()
    this.sendTo('main', 'app:navigate', route)
  }

  send(message: ToastMessage): void {
    // In-app banners only make sense when the dashboard is actually visible;
    // the OS toast is the fallback when it is not.
    if (this.main.isVisible()) this.sendTo('main', 'app:toast', message)
  }

  showBreak(active: ActiveBreak, useOverlay: boolean): void {
    if (useOverlay) {
      this.overlays.show(active)
    } else if (this.getSettings().mascot.enabled && this.mascot.isAvailable()) {
      // No overlay: the countdown lives in the mascot's speech bubble.
      this.announce({
        kind: active.kind,
        message: active.message,
        emoji: '⏳',
        animation: active.kind === 'stretch' ? 'stretch' : 'knock'
      })
    }
  }

  updateBreak(active: ActiveBreak): void {
    if (this.overlays.isOpen()) this.overlays.update(active)
  }

  hideBreak(celebrate: boolean): void {
    this.overlays.hide()
    if (this.mascot.isAvailable()) this.mascot.send({ type: 'dismiss', celebrate })
  }

  isAvailable(): boolean {
    return this.mascot.isAvailable()
  }

  /** True when the mascot only appears to deliver something, then leaves. */
  private get onAlertOnly(): boolean {
    return this.getSettings().mascot.visibility === 'onAlert'
  }

  announce(input: { kind: string; message: string; emoji: string; animation: MascotAnimation }): void {
    // On-alert mode: bring the window on stage first, and tell the renderer to
    // walk in from off-screen rather than materialise mid-desktop.
    if (this.onAlertOnly) this.mascot.present()
    this.mascot.send({ type: 'announce', ...input, entrance: this.onAlertOnly })
  }

  dismiss(celebrate: boolean): void {
    // The renderer decides what "done" means per mode — go home, or walk off and
    // report back so the window can be hidden.
    this.mascot.send({ type: 'dismiss', celebrate })
  }

  perform(animation: MascotAnimation): void {
    if (this.onAlertOnly) this.mascot.present()
    this.mascot.send({ type: 'perform', animation, entrance: this.onAlertOnly })
  }

  /** The renderer finished its walk-out; take the window off screen. */
  retireMascot(): void {
    this.mascot.retire()
  }

  /** Keep the mascot's sleep/wake behaviour in step with real user idleness. */
  reportIdle(idleSeconds: number): void {
    // Pointless in on-alert mode: the mascot is never idling on screen.
    if (this.mascot.isOnScreen() && !this.onAlertOnly) {
      this.mascot.send({ type: 'setIdle', idleSeconds })
    }
  }

  play(request: SoundRequest): void {
    this.sound.play(request)
  }

  focusDashboard(): void {
    this.main.show()
  }

  listDisplays(): DisplayInfo[] {
    const primaryId = screen.getPrimaryDisplay().id
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label: display.label || `Display ${index + 1}`,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      isPrimary: display.id === primaryId
    }))
  }

  /** Re-anchor everything after a monitor is plugged in, removed or rescaled. */
  handleDisplayChange(): void {
    log.info('display configuration changed')
    this.mascot.applyBounds()
    this.overlays.handleDisplayChange()
  }

  /** React to a settings change: only the parts that actually need it. */
  applySettings(changedPaths: string[]): void {
    const touched = (prefix: string): boolean => changedPaths.some((path) => path.startsWith(prefix))

    if (touched('mascot.enabled') || touched('mascot.visibility')) this.mascot.sync()
    else if (touched('mascot.')) {
      this.mascot.applyBounds()
      this.mascot.pushConfig()
    }
    if (touched('general.reducedMotion')) this.mascot.pushConfig()
  }

  prepareForQuit(): void {
    this.main.prepareForQuit()
  }

  destroyAll(): void {
    this.overlays.destroy()
    this.mascot.destroy()
    this.sound.destroy()
    this.main.destroy()
  }
}
