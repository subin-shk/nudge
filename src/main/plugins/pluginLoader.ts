/**
 * Declarative reminder plugins.
 *
 * A plugin is a folder containing `plugin.json` — **data only, never code.**
 * That constraint is the whole security model: Nudge will happily add a
 * "Posture check" reminder from a manifest, but nothing a plugin ships is ever
 * evaluated, required, or given access to the renderer, the filesystem, or IPC.
 * The worst a malicious manifest can do is describe an annoying reminder, which
 * the user can delete.
 *
 * Location: `<userData>/plugins/<name>/plugin.json`
 *
 * Everything a reminder needs is already expressible as data (see
 * `ReminderDefinition`), so this buys real extensibility at essentially no risk.
 * If a future plugin genuinely needs behaviour, the right next step is a
 * sandboxed utility process — not `require()`.
 */

import { join } from 'node:path'
import { LOCALE_IDS } from '@shared/types/settings'
import type { ReminderDefinition } from '@shared/reminders/catalog'
import { registerReminder } from '@shared/reminders/catalog'
import { registerMessages } from '@shared/i18n'
import { clamp } from '@shared/util'
import { listFiles, readJson } from '../util/fsAtomic'
import { createLogger } from '../util/logger'

const log = createLogger('plugins')

/** Manifest format version this build understands. */
export const PLUGIN_API_VERSION = 1

interface ManifestReminder {
  kind?: unknown
  title?: unknown
  shortTitle?: unknown
  message?: unknown
  emoji?: unknown
  icon?: unknown
  tone?: unknown
  defaultIntervalMinutes?: unknown
  breakSeconds?: unknown
  dailyGoal?: unknown
  useOverlay?: unknown
  snoozeMinutes?: unknown
}

interface PluginManifest {
  id?: unknown
  name?: unknown
  version?: unknown
  nudgeApi?: unknown
  reminders?: unknown
}

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** Reminder kinds must be safe to use as an object key and a CSS class suffix. */
const isValidKind = (kind: string): boolean => /^[a-z][a-zA-Z0-9_]{1,30}$/.test(kind)

const VALID_TONES = ['eye', 'water', 'focus', 'move', 'neutral'] as const

function toDefinition(pluginId: string, entry: ManifestReminder, order: number): ReminderDefinition | null {
  const kind = asString(entry.kind)
  if (!isValidKind(kind)) {
    log.warn('plugin reminder rejected: invalid kind', { pluginId, kind })
    return null
  }

  const title = asString(entry.title, kind)
  const shortTitle = asString(entry.shortTitle, title)
  const message = asString(entry.message, title)

  // Plugin copy is injected as ordinary i18n strings so it resolves through the
  // same translator (and can be overridden by a locale file later).
  const keys = {
    title: `plugin.${kind}.title`,
    short: `plugin.${kind}.short`,
    message: `plugin.${kind}.message`
  }
  for (const locale of LOCALE_IDS) {
    registerMessages(locale, { [keys.title]: title, [keys.short]: shortTitle, [keys.message]: message })
  }

  const breakSeconds = clamp(Math.round(asNumber(entry.breakSeconds, 0)), 0, 900)
  const interval = clamp(Math.round(asNumber(entry.defaultIntervalMinutes, 60)), 1, 1440)
  const dailyGoal = clamp(Math.round(asNumber(entry.dailyGoal, 0)), 0, 100)

  const snoozeMinutes = Array.isArray(entry.snoozeMinutes)
    ? entry.snoozeMinutes.filter((n): n is number => typeof n === 'number').map((n) => clamp(Math.round(n), 1, 120))
    : [5, 10]

  const tone = (VALID_TONES as readonly string[]).includes(asString(entry.tone))
    ? (asString(entry.tone) as ReminderDefinition['tone'])
    : 'neutral'

  return {
    kind,
    titleKey: keys.title,
    shortTitleKey: keys.short,
    defaultMessageKey: keys.message,
    emoji: asString(entry.emoji, '🔔').slice(0, 4),
    icon: asString(entry.icon, 'bell'),
    tone,
    capabilities: {
      timedBreak: breakSeconds > 0,
      overlay: Boolean(entry.useOverlay) && breakSeconds > 0,
      snooze: snoozeMinutes.length > 0,
      dailyGoal: dailyGoal > 0,
      scheduledTimes: true
    },
    // Plugins sort after every built-in reminder.
    order: 1000 + order,
    source: 'plugin',
    defaults: {
      // Opt-in: a newly discovered plugin never starts interrupting on its own.
      enabled: false,
      schedule: { mode: 'interval', intervalMinutes: interval, times: [] },
      message: '',
      breakSeconds,
      useOverlay: Boolean(entry.useOverlay) && breakSeconds > 0,
      allowSkip: true,
      autoResume: true,
      snoozeMinutes,
      dailyGoal,
      notifications: {
        desktop: true,
        sound: true,
        soundId: 'marimba',
        customSoundPath: null,
        volume: 0.7,
        mascot: true
      }
    }
  }
}

export interface LoadedPlugin {
  id: string
  name: string
  version: string
  kinds: string[]
}

/** Scan `<userData>/plugins` and register everything valid it finds. */
export async function loadPlugins(userDataPath: string): Promise<LoadedPlugin[]> {
  const root = join(userDataPath, 'plugins')
  const entries = await listFiles(root)
  if (entries.length === 0) return []

  const loaded: LoadedPlugin[] = []

  for (const entry of entries) {
    const manifestPath = join(root, entry, 'plugin.json')
    const manifest = await readJson<PluginManifest>(manifestPath)
    if (!manifest) continue

    const api = asNumber(manifest.nudgeApi, 0)
    if (api !== PLUGIN_API_VERSION) {
      log.warn('plugin skipped: unsupported API version', { plugin: entry, api })
      continue
    }

    const id = asString(manifest.id, entry)
    const reminders = Array.isArray(manifest.reminders) ? manifest.reminders : []
    const kinds: string[] = []

    reminders.forEach((raw, index) => {
      const definition = toDefinition(id, raw as ManifestReminder, index)
      if (definition && registerReminder(definition)) kinds.push(definition.kind)
    })

    if (kinds.length > 0) {
      loaded.push({ id, name: asString(manifest.name, id), version: asString(manifest.version, '0.0.0'), kinds })
      log.info('plugin loaded', { id, kinds })
    }
  }

  return loaded
}
