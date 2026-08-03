/**
 * Auto-update, wired but inert.
 *
 * `electron-updater` is fully integrated and gated on two conditions: a packaged
 * build, and a real `publish` provider in electron-builder.yml. Until someone
 * points that at an actual server the service reports `supported: false` and the
 * Settings screen says so honestly, instead of showing a "Check for updates"
 * button that spins forever.
 *
 * The download is never installed behind the user's back — a wellness app
 * restarting itself mid-focus-session would be a poor joke.
 */

import { app } from 'electron'
import type { UpdateStatus } from '@shared/ipc'
import { createLogger } from '../util/logger'

const log = createLogger('updater')

/** Set once a provider is configured; keeps the feature obviously inert. */
const PUBLISH_CONFIGURED = false

export class UpdateService {
  private status: UpdateStatus = {
    supported: false,
    checking: false,
    available: false,
    version: null,
    error: null
  }

  private listeners = new Set<(status: UpdateStatus) => void>()
  private autoUpdater: typeof import('electron-updater').autoUpdater | null = null

  onStatus(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener({ ...this.status })
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  async init(autoUpdateEnabled: boolean): Promise<void> {
    this.status.supported = app.isPackaged && PUBLISH_CONFIGURED
    if (!this.status.supported) {
      log.info('updates disabled', { packaged: app.isPackaged, publishConfigured: PUBLISH_CONFIGURED })
      this.emit()
      return
    }

    // Imported lazily so an unpackaged dev run never loads the module at all.
    const { autoUpdater } = await import('electron-updater')
    this.autoUpdater = autoUpdater
    autoUpdater.autoDownload = autoUpdateEnabled
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.status = { ...this.status, checking: true, error: null }
      this.emit()
    })
    autoUpdater.on('update-available', (info) => {
      this.status = { ...this.status, checking: false, available: true, version: info.version }
      this.emit()
    })
    autoUpdater.on('update-not-available', () => {
      this.status = { ...this.status, checking: false, available: false }
      this.emit()
    })
    autoUpdater.on('error', (error) => {
      this.status = { ...this.status, checking: false, error: error.message }
      this.emit()
    })

    if (autoUpdateEnabled) void this.check()
  }

  async check(): Promise<UpdateStatus> {
    if (!this.autoUpdater) return this.getStatus()
    try {
      await this.autoUpdater.checkForUpdates()
    } catch (error) {
      this.status = { ...this.status, checking: false, error: String(error) }
      this.emit()
    }
    return this.getStatus()
  }

  setAutoDownload(enabled: boolean): void {
    if (this.autoUpdater) this.autoUpdater.autoDownload = enabled
  }
}
