/**
 * The composition root and the app's only heartbeat.
 *
 * Everything below is constructed here and wired through narrow ports, so the
 * dependency graph is a tree with no cycles:
 *
 *   JsonStorageAdapter
 *        ├── SettingsRepository ──┐
 *        └── ActivityRepository ──┤
 *                                 ├── ReminderEngine ──▶ ReminderNotifier ─┐
 *                                 ├── FocusTimerService ─▶ FocusNotifier ──┤
 *                                 └── StatsService                          │
 *                                                    NotificationService ◀──┘
 *                                                              │
 *                                            WindowManager (all ports)
 *
 * **One timer for the whole application.** A single 1 Hz interval advances the
 * reminder engine and the focus timer, then publishes one immutable `AppRuntime`
 * snapshot to the renderers and the tray. Every alternative — a timer per
 * reminder, `setTimeout` chains, renderer-side countdowns — drifts, and drift in
 * a reminder app is the bug users actually notice.
 */

import { app, dialog, screen, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppRoute, AppRuntime, AppSettings, SoundId } from '@shared/types'
import type { DisplayInfo, FocusStartRequest, ImportResult, UpdateStatus } from '@shared/ipc'
import type { DeepPartial } from '@shared/util'
import { CUSTOM_SOUND_EXTENSIONS } from '@shared/sounds'
import { createTranslator } from '@shared/i18n'
import { lastNDays, toDayKey } from '@shared/time'
import { createLogger } from '../util/logger'
import { readJson } from '../util/fsAtomic'
import { JsonStorageAdapter } from '../storage/JsonStorageAdapter'
import { SettingsRepository, type SettingsChange } from '../storage/SettingsRepository'
import { ActivityRepository } from '../storage/ActivityRepository'
import { ReminderEngine } from '../reminders/ReminderEngine'
import { FocusTimerService } from '../focus/FocusTimerService'
import { StatsService } from '../stats/StatsService'
import { NotificationService } from '../notifications/NotificationService'
import { hasExpiredTimedDnd, isDoNotDisturbActive, isQuietHoursActive } from '../notifications/quietHours'
import { WindowManager } from '../windows/WindowManager'
import { TrayController } from '../tray/TrayController'
import { PowerService } from '../system/PowerService'
import { ShortcutService } from '../system/ShortcutService'
import { UpdateService } from '../system/UpdateService'
import { applyLaunchAtStartup } from '../system/autoLaunch'
import { loadPlugins } from '../plugins/pluginLoader'

const log = createLogger('app')

const TICK_MS = 1000
/** Raw events older than this are pruned; rollups are kept forever. */
const EVENT_RETENTION_DAYS = 400

export class AppController {
  private readonly storage: JsonStorageAdapter
  private readonly settingsRepo: SettingsRepository
  private readonly activityRepo: ActivityRepository
  private readonly stats: StatsService
  private readonly notifications: NotificationService
  private readonly engine: ReminderEngine
  private readonly focus: FocusTimerService
  private readonly windows: WindowManager
  private readonly tray: TrayController
  private readonly power: PowerService
  private readonly shortcuts: ShortcutService
  private readonly updates: UpdateService

  private ticker: ReturnType<typeof setInterval> | null = null
  private revision = 0
  private quitting = false
  private disposers: Array<() => void> = []
  /** Watched each tick so the app resets its "today" figures at midnight. */
  private lastDayKey = toDayKey()

  /**
   * Streaks read the whole rollup archive, which is far too much work for a 1 Hz
   * tick. They are recomputed whenever activity changes and cached in between.
   */
  private streakCache: AppRuntime['streak'] = { current: 0, best: 0, currentWeeks: 0, todayQualifies: false }

  constructor() {
    const dataDirectory = join(app.getPath('userData'), 'data')

    this.storage = new JsonStorageAdapter({ directory: dataDirectory })
    this.settingsRepo = new SettingsRepository(this.storage)

    // The activity log needs to know each reminder's goal to mark `goalsMet`.
    this.activityRepo = new ActivityRepository(
      this.storage,
      (kind) => this.settingsRepo.get().reminders[kind]?.dailyGoal ?? 0
    )

    this.stats = new StatsService(this.activityRepo, this.settingsRepo)
    this.power = new PowerService()

    this.windows = new WindowManager(() => this.settingsRepo.get())

    this.notifications = new NotificationService(
      this.settingsRepo,
      this.windows, // SoundPlayerPort
      this.windows, // MascotPort
      this.windows, // ToastPort
      {
        focusDashboard: () => this.windows.focusDashboard(),
        // Deferred through a closure: the engine is constructed on the next line.
        acknowledgePending: () => this.engine.acknowledgePending()
      }
    )

    this.engine = new ReminderEngine(this.settingsRepo, this.activityRepo, this.notifications, this.windows)
    this.focus = new FocusTimerService(this.settingsRepo, this.activityRepo, this.notifications, this.power)

    this.tray = new TrayController(() => this.settingsRepo.get(), {
      openDashboard: () => this.windows.navigate('dashboard'),
      startFocus: (minutes) => this.startFocus({ minutes, mode: 'timer' }),
      pauseFocus: () => this.focus.pause(),
      resumeFocus: () => this.focus.resume(),
      stopFocus: () => this.focus.stop(),
      triggerReminder: (kind) => this.engine.triggerNow(kind),
      setDoNotDisturb: (enabled, forMinutes) => void this.setDoNotDisturb(enabled, forMinutes),
      setMascotEnabled: (enabled) => void this.settingsRepo.patch({ mascot: { enabled } }),
      quit: () => this.quit()
    })

    this.shortcuts = new ShortcutService({
      toggleDashboard: () => this.windows.main.toggle(),
      startFocus: () => this.startFocus({ minutes: this.settingsRepo.get().focus.defaultMinutes, mode: 'timer' }),
      pauseResumeFocus: () => {
        const runtime = this.focus.getRuntime(Date.now())
        if (runtime.status === 'running') this.focus.pause()
        else if (runtime.status === 'paused') this.focus.resume()
      },
      stopFocus: () => this.focus.stop(),
      drinkWaterNow: () => this.engine.triggerNow('water'),
      startEyeBreak: () => this.engine.triggerNow('eyeCare'),
      toggleDoNotDisturb: () => {
        const active = isDoNotDisturbActive(this.settingsRepo.get())
        void this.setDoNotDisturb(!active, null)
      },
      toggleMascot: () => void this.settingsRepo.patch({ mascot: { enabled: !this.settingsRepo.get().mascot.enabled } })
    })

    this.updates = new UpdateService()
  }

  async start(): Promise<void> {
    await this.storage.init()

    // Plugins register reminder kinds, so they must load before settings are
    // normalised — otherwise a plugin reminder has no defaults to merge against.
    await loadPlugins(app.getPath('userData'))

    await this.settingsRepo.load()
    await this.activityRepo.init()
    await this.stats.init()
    await this.focus.init()

    const settings = this.settingsRepo.get()
    applyLaunchAtStartup(settings.general.launchAtStartup)

    this.engine.init()
    this.windows.bootstrap()
    this.tray.create()

    const failures = this.shortcuts.apply(settings.shortcuts)
    if (failures.length > 0) {
      this.notifications.info('toast.shortcutTaken', { accelerator: failures.join(', ') }, 'warning')
    }

    this.wireEvents()
    await this.updates.init(settings.general.autoUpdate)

    // Housekeeping that should never block startup.
    void this.activityRepo.pruneOldEvents(EVENT_RETENTION_DAYS)

    this.ticker = setInterval(() => this.tick(), TICK_MS)
    this.tick()

    log.info('started', { version: app.getVersion(), locale: settings.general.locale })
  }

  private wireEvents(): void {
    this.disposers.push(
      this.settingsRepo.onChange((change) => this.handleSettingsChange(change)),
      this.engine.onChange(() => this.publish()),
      this.focus.onChange(() => this.publish()),
      this.activityRepo.onChange(() => {
        // Any recorded activity can change the streak and unlock a badge.
        void this.refreshStreak()
        void this.stats.getAchievements()
        this.publish()
      }),
      this.stats.onAchievementUnlocked((id) => this.notifications.announceAchievement(id)),
      this.updates.onStatus((status) => this.windows.broadcastUpdateStatus(status))
    )

    this.power.start({
      onSuspend: () => {
        this.focus.handleSuspend()
      },
      onResume: () => {
        this.engine.handleResume(Date.now())
        this.publish()
      },
      onLock: () => this.publish(),
      onUnlock: () => {
        this.engine.handleResume(Date.now())
        this.publish()
      }
    })

    // Monitors coming and going must re-anchor the mascot and any live overlay.
    const onDisplayChange = (): void => this.windows.handleDisplayChange()
    screen.on('display-added', onDisplayChange)
    screen.on('display-removed', onDisplayChange)
    screen.on('display-metrics-changed', onDisplayChange)
    this.disposers.push(() => {
      screen.off('display-added', onDisplayChange)
      screen.off('display-removed', onDisplayChange)
      screen.off('display-metrics-changed', onDisplayChange)
    })
  }

  private handleSettingsChange(change: SettingsChange): void {
    const touched = (prefix: string): boolean => change.changedPaths.some((path) => path.startsWith(prefix))

    if (touched('general.launchAtStartup')) applyLaunchAtStartup(change.settings.general.launchAtStartup)
    if (touched('general.autoUpdate')) this.updates.setAutoDownload(change.settings.general.autoUpdate)
    if (touched('general.locale')) this.tray.invalidate()
    if (touched('shortcuts.')) {
      const failures = this.shortcuts.apply(change.settings.shortcuts)
      if (failures.length > 0) {
        this.notifications.info('toast.shortcutTaken', { accelerator: failures.join(', ') }, 'warning')
      }
    }

    this.windows.applySettings(change.changedPaths)
    this.engine.handleSettingsChange(change)

    // A changed daily goal retroactively changes which days count as "met".
    if (change.changedPaths.some((path) => path.endsWith('.dailyGoal'))) {
      void this.stats.reevaluateRecentGoals()
    }

    this.windows.broadcastSettings(change.settings)
    this.publish()
  }

  private tick(): void {
    const now = Date.now()

    // Expire a timed Do Not Disturb by writing it back to settings, so the UI
    // switch and the tray checkbox flip on their own.
    const settings = this.settingsRepo.get()
    if (hasExpiredTimedDnd(settings, now)) {
      void this.settingsRepo.patch({ notifications: { doNotDisturbUntil: null, doNotDisturb: false } })
    }

    // Midnight rollover: reset today's rollup, the focus baseline and the streak.
    const dayKey = toDayKey(now)
    if (dayKey !== this.lastDayKey) {
      this.lastDayKey = dayKey
      void this.activityRepo.ensureToday(now).then(async () => {
        await this.focus.refreshTodayBaseline()
        await this.refreshStreak()
      })
    }

    const idleSeconds = this.power.idleSeconds()
    const quietHoursActive = isQuietHoursActive(settings, new Date(now))
    const dndActive = isDoNotDisturbActive(settings, now)

    this.focus.tick(now)
    this.engine.tick(
      now,
      { userIdleSeconds: idleSeconds, focusActive: this.focus.isFocusPhaseRunning() },
      { quietHoursActive, dndActive }
    )

    this.windows.reportIdle(idleSeconds)
    this.publish(now)
  }

  /** Build and distribute one runtime snapshot. */
  private publish(now: number = Date.now()): void {
    const runtime = this.buildRuntime(now)
    this.tray.update(runtime)
    // Skip the renderer hop when nobody is looking — the tray still updates.
    if (this.windows.main.isVisible()) this.windows.broadcastRuntime(runtime)
  }

  private buildRuntime(now: number): AppRuntime {
    const today = this.activityRepo.getTodaySync()
    const settings = this.settingsRepo.get()

    return {
      revision: ++this.revision,
      now,
      reminders: this.engine.getRuntime(now, today.completed),
      focus: this.focus.getRuntime(now),
      activeBreak: this.engine.getActiveBreak(),
      today,
      streak: this.streakCache,
      quietHoursActive: isQuietHoursActive(settings, new Date(now)),
      doNotDisturbActive: isDoNotDisturbActive(settings, now),
      userIdleSeconds: this.power.idleSeconds(),
      mascotVisible: this.windows.mascot.isOnScreen(),
      appVersion: app.getVersion()
    }
  }

  private async refreshStreak(): Promise<void> {
    this.streakCache = await this.stats.getStreak()
  }

  async bootstrap(): Promise<{ settings: AppSettings; runtime: AppRuntime }> {
    await this.refreshStreak()
    return { settings: this.settingsRepo.snapshot(), runtime: this.buildRuntime(Date.now()) }
  }

  getSettings(): AppSettings {
    return this.settingsRepo.snapshot()
  }

  async patchSettings(patch: DeepPartial<AppSettings>): Promise<AppSettings> {
    await this.settingsRepo.patch(patch)
    return this.settingsRepo.snapshot()
  }

  async resetSettings(): Promise<AppSettings> {
    const settings = await this.settingsRepo.reset()
    this.notifications.info('toast.settingsReset', undefined, 'success')
    return settings
  }

  async exportSettings(): Promise<{ ok: boolean; path?: string; error?: string }> {
    const parent = this.windows.main.get()
    const suggested = `nudge-settings-${toDayKey()}.json`

    const result = parent
      ? await dialog.showSaveDialog(parent, { defaultPath: suggested, filters: [{ name: 'JSON', extensions: ['json'] }] })
      : await dialog.showSaveDialog({ defaultPath: suggested, filters: [{ name: 'JSON', extensions: ['json'] }] })

    if (result.canceled || !result.filePath) return { ok: false }

    try {
      await fs.writeFile(result.filePath, JSON.stringify(this.settingsRepo.snapshot(), null, 2), 'utf8')
      this.notifications.info('toast.settingsExported', undefined, 'success')
      return { ok: true, path: result.filePath }
    } catch (error) {
      log.error('settings export failed', error)
      return { ok: false, error: String(error) }
    }
  }

  async importSettings(): Promise<ImportResult> {
    const parent = this.windows.main.get()
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }

    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const chosen = result.filePaths[0]
    if (result.canceled || !chosen) return { ok: false }

    const document = await readJson<unknown>(chosen)
    if (document === null) {
      this.notifications.info('toast.importFailed', undefined, 'warning')
      return { ok: false, error: 'unreadable' }
    }

    const outcome = await this.settingsRepo.replace(document)
    if (!outcome.ok) {
      this.notifications.info('toast.importFailed', undefined, 'warning')
      return { ok: false, error: outcome.error }
    }

    this.notifications.info('toast.settingsImported', undefined, 'success')
    return { ok: true, settings: this.settingsRepo.snapshot() }
  }

  triggerReminder(kind: string): void {
    this.engine.triggerNow(kind)
  }

  completeReminder(kind: string): void {
    this.engine.complete(kind)
    void this.refreshStreak()
  }

  skipReminder(kind: string): void {
    this.engine.skip(kind)
  }

  snoozeReminder(kind: string, minutes: number | undefined): void {
    this.engine.snooze(kind, minutes ?? 5)
  }

  restartReminderInterval(kind: string): void {
    this.engine.restartInterval(kind)
  }

  async setReminderEnabled(kind: string, enabled: boolean): Promise<void> {
    await this.settingsRepo.patch({ reminders: { [kind]: { enabled } } } as DeepPartial<AppSettings>)
  }

  startFocus(request: FocusStartRequest): void {
    const settings = this.settingsRepo.get()
    const mode = settings.focus.pomodoro.enabled && request.mode === 'pomodoro' ? 'pomodoro' : request.mode
    this.focus.start({ minutes: request.minutes, mode })
  }

  pauseFocus(): void {
    this.focus.pause()
  }

  resumeFocus(): void {
    this.focus.resume()
  }

  stopFocus(): void {
    this.focus.stop()
    void this.refreshStreak()
  }

  extendFocus(minutes: number): void {
    this.focus.extend(minutes)
  }

  skipFocusPhase(): void {
    this.focus.skipPhase()
  }

  getRange(from: string, to: string): ReturnType<StatsService['getRange']> {
    return this.stats.getRange(from, to)
  }

  getRecentDays(days: number): ReturnType<StatsService['getRecentDays']> {
    return this.stats.getRecentDays(days)
  }

  getAchievements(): ReturnType<StatsService['getAchievements']> {
    return this.stats.getAchievements()
  }

  getLifetime(): ReturnType<StatsService['getLifetime']> {
    return this.stats.getLifetime()
  }

  async clearStats(): Promise<void> {
    await this.stats.clear()
    await this.refreshStreak()
    this.notifications.info('toast.statsCleared', undefined, 'success')
    this.publish()
  }

  async setDoNotDisturb(enabled: boolean, forMinutes: number | null | undefined): Promise<void> {
    const until = enabled && forMinutes ? Date.now() + forMinutes * 60_000 : null
    await this.settingsRepo.patch({
      notifications: {
        // A timed DND is expressed purely as an expiry so it cannot get stuck on.
        doNotDisturb: enabled && !until,
        doNotDisturbUntil: until
      }
    })
    this.notifications.info(enabled ? 'toast.dndOn' : 'toast.dndOff')
  }

  async setMascotEnabled(enabled: boolean): Promise<void> {
    await this.settingsRepo.patch({ mascot: { enabled } })
  }

  setMascotInteractive(interactive: boolean): void {
    this.windows.mascot.setInteractive(interactive)
  }

  /** On-alert mode: the mascot walked off screen, so hide its window. */
  reportMascotRetired(): void {
    this.windows.retireMascot()
    this.publish()
  }

  /** The user clicked the mascot: acknowledge a pending nudge, else say hello. */
  pokeMascot(): void {
    if (this.engine.acknowledgePending()) {
      void this.refreshStreak()
      return
    }
    const t = createTranslator(this.settingsRepo.get().general.locale)
    this.windows.announce({ kind: 'greeting', message: t('mascot.hello'), emoji: '👋', animation: 'wave' })
  }

  previewSound(request: { soundId: SoundId; volume: number; customPath: string | null }): void {
    this.notifications.previewSound(request)
  }

  async pickCustomSound(): Promise<{ path: string | null }> {
    const parent = this.windows.main.get()
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: CUSTOM_SOUND_EXTENSIONS }]
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
  }

  minimizeWindow(): void {
    this.windows.main.minimize()
  }

  toggleMaximizeWindow(): void {
    this.windows.main.toggleMaximize()
  }

  hideWindow(): void {
    this.windows.main.hide()
  }

  isWindowMaximized(): boolean {
    return this.windows.main.isMaximized()
  }

  listDisplays(): DisplayInfo[] {
    return this.windows.listDisplays()
  }

  async openExternal(url: string): Promise<void> {
    // Only ever hand http(s) to the OS shell — never file:, never a local path.
    if (!/^https?:\/\//i.test(url)) {
      log.warn('refused to open non-http url', { url })
      return
    }
    await shell.openExternal(url)
  }

  async openDataFolder(): Promise<void> {
    await shell.openPath(join(app.getPath('userData'), 'data'))
  }

  navigate(route: AppRoute): void {
    this.windows.navigate(route)
  }

  getUpdateStatus(): UpdateStatus {
    return this.updates.getStatus()
  }

  checkForUpdates(): Promise<UpdateStatus> {
    return this.updates.check()
  }

  isQuitting(): boolean {
    return this.quitting
  }

  quit(): void {
    if (this.quitting) return
    this.quitting = true
    log.info('quitting')
    this.windows.prepareForQuit()
    app.quit()
  }

  /** Flush and release everything. Safe to call more than once. */
  async dispose(): Promise<void> {
    if (this.ticker) clearInterval(this.ticker)
    this.ticker = null

    for (const dispose of this.disposers.splice(0)) dispose()

    this.shortcuts.dispose()
    this.power.dispose()
    this.tray.destroy()
    this.engine.dispose()
    this.focus.dispose()
    this.stats.dispose()
    this.windows.destroyAll()

    await this.storage.close()
    log.info('disposed')
  }

  /** Show the dashboard — used by the second-instance handler. */
  focusExistingWindow(): void {
    this.windows.main.show()
  }

  /** Recent-days helper used by the dashboard's sparkline. */
  recentDayKeys(days: number): string[] {
    return lastNDays(days)
  }
}
