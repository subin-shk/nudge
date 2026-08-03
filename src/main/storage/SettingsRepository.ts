/**
 * The single owner of persisted settings.
 *
 * Every read in the app goes through `get()` (which returns the live object, so
 * hot paths do not clone) and every write through `patch()` (which normalises,
 * persists, and notifies). Nothing else is allowed to touch settings.json —
 * that is what makes "change a setting and the scheduler reacts immediately"
 * a two-line subscription rather than a refresh problem.
 */

import { EventEmitter } from 'node:events'
import type { AppSettings } from '@shared/types'
import type { DeepPartial } from '@shared/util'
import { clone, deepMerge } from '@shared/util'
import { createLogger } from '../util/logger'
import { migrateSettingsDocument } from './migrations'
import { looksLikeSettingsDocument, normalizeSettings } from './settingsSchema'
import type { StorageAdapter } from './StorageAdapter'

const log = createLogger('settings')

export interface SettingsChange {
  settings: AppSettings
  previous: AppSettings
  /** Dotted paths that actually changed, e.g. `['mascot.size', 'general.theme']`. */
  changedPaths: string[]
}

/** Flatten to dotted leaf paths so subscribers can react to precise changes. */
function diffPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (a === b) return []

  const bothObjects =
    typeof a === 'object' && a !== null && !Array.isArray(a) && typeof b === 'object' && b !== null && !Array.isArray(b)

  if (!bothObjects) {
    // Arrays and primitives are compared by value; a changed array is one path.
    return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix || '.']
  }

  const out: string[] = []
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
  for (const key of keys) {
    const next = prefix ? `${prefix}.${key}` : key
    out.push(...diffPaths((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], next))
  }
  return out
}

export class SettingsRepository {
  private readonly emitter = new EventEmitter()
  private current: AppSettings
  private loaded = false

  constructor(private readonly storage: StorageAdapter) {
    // Valid from construction so a crash during load still leaves the app usable.
    this.current = normalizeSettings({})
    this.emitter.setMaxListeners(40)
  }

  async load(): Promise<AppSettings> {
    const raw = await this.storage.readSettingsDocument()

    if (raw === null) {
      log.info('no settings file — seeding defaults')
      this.current = normalizeSettings({})
      await this.storage.writeSettingsDocument(this.current)
      this.loaded = true
      return this.current
    }

    const outcome = migrateSettingsDocument(raw)
    this.current = normalizeSettings(outcome.document)

    // Persist when a migration ran OR when normalisation repaired something, so
    // the file on disk converges to a canonical form instead of being re-fixed
    // on every launch.
    const canonical = JSON.stringify(this.current)
    if (outcome.changed || canonical !== JSON.stringify(outcome.document)) {
      await this.storage.writeSettingsDocument(this.current)
      log.info('settings normalised on load', { from: outcome.fromVersion, to: outcome.toVersion })
    }

    this.loaded = true
    return this.current
  }

  get(): AppSettings {
    if (!this.loaded) log.warn('settings read before load() completed')
    return this.current
  }

  /** A structural copy — for export and for handing across IPC. */
  snapshot(): AppSettings {
    return clone(this.current)
  }

  /**
   * Merge a partial patch, normalise, persist and notify.
   * No-ops (and skips the disk write) when nothing actually changed.
   */
  async patch(patch: DeepPartial<AppSettings>): Promise<AppSettings> {
    const previous = this.current
    const candidate = normalizeSettings(deepMerge(previous, patch))
    const changedPaths = diffPaths(previous, candidate)

    if (changedPaths.length === 0) return this.current

    this.current = candidate
    await this.storage.writeSettingsDocument(candidate)
    log.debug('settings changed', { paths: changedPaths })
    this.emitter.emit('change', { settings: candidate, previous, changedPaths } satisfies SettingsChange)
    return candidate
  }

  /** Wholesale replace — used by "import backup". Rejects unrelated JSON. */
  async replace(document: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!looksLikeSettingsDocument(document)) {
      return { ok: false, error: 'not-nudge-settings' }
    }
    const previous = this.current
    const migrated = migrateSettingsDocument(document)
    const candidate = normalizeSettings(migrated.document)

    this.current = candidate
    await this.storage.writeSettingsDocument(candidate)
    this.emitter.emit('change', {
      settings: candidate,
      previous,
      changedPaths: diffPaths(previous, candidate)
    } satisfies SettingsChange)
    log.info('settings replaced from import')
    return { ok: true }
  }

  async reset(): Promise<AppSettings> {
    const previous = this.current
    const defaults = normalizeSettings({})
    // Onboarding stays "done" through a reset — re-running the welcome flow on
    // someone who just wanted default colours back is a jarring surprise.
    defaults.general.onboardingCompleted = previous.general.onboardingCompleted

    this.current = defaults
    await this.storage.writeSettingsDocument(defaults)
    this.emitter.emit('change', {
      settings: defaults,
      previous,
      changedPaths: diffPaths(previous, defaults)
    } satisfies SettingsChange)
    log.info('settings reset to defaults')
    return defaults
  }

  onChange(listener: (change: SettingsChange) => void): () => void {
    this.emitter.on('change', listener)
    return () => this.emitter.off('change', listener)
  }
}
