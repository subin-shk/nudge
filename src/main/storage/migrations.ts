/**
 * Settings migrations.
 *
 * Contract: a document written by version N must be readable by version N+k for
 * any k. Each step transforms *only* the shape — never the meaning — and the
 * result always goes through `normalizeSettings` afterwards, so a migration step
 * never has to worry about clamping or enum validity.
 *
 * Adding a migration:
 *   1. bump `SCHEMA_VERSION` in src/shared/defaults.ts,
 *   2. append a step here with `to` set to the new version,
 *   3. add a case to tests/migrations.test.ts with a real v(N) document.
 *
 * Never edit an existing step — users in the wild have already run it.
 */

import { SCHEMA_VERSION } from '@shared/defaults'
import { createLogger } from '../util/logger'

const log = createLogger('storage:migrations')

type Document = Record<string, unknown>

interface MigrationStep {
  /** Version this step upgrades the document *to*. */
  to: number
  describe: string
  migrate: (document: Document) => Document
}

/**
 * The migration ladder, ordered by `to`.
 *
 * Empty at v1 because v1 is the first published schema. The example below is
 * kept as a comment so the next person has a template rather than a blank file.
 *
 *   {
 *     to: 2,
 *     describe: 'split reminders.water.intervalMinutes into schedule.*',
 *     migrate: (doc) => {
 *       const reminders = (doc.reminders ?? {}) as Record<string, any>
 *       for (const reminder of Object.values(reminders)) {
 *         if (typeof reminder?.intervalMinutes === 'number') {
 *           reminder.schedule = { mode: 'interval', intervalMinutes: reminder.intervalMinutes, times: [] }
 *           delete reminder.intervalMinutes
 *         }
 *       }
 *       return doc
 *     }
 *   }
 */
const STEPS: MigrationStep[] = []

export interface MigrationOutcome {
  document: unknown
  /** True when at least one step ran — the caller should persist the result. */
  changed: boolean
  fromVersion: number
  toVersion: number
}

export function migrateSettingsDocument(input: unknown): MigrationOutcome {
  const document = (typeof input === 'object' && input !== null ? { ...(input as Document) } : {}) as Document

  const rawVersion = document.schemaVersion
  // A document with no version predates versioning; treat it as v1 and let
  // normalisation fill the gaps rather than discarding the user's config.
  const fromVersion = typeof rawVersion === 'number' && rawVersion > 0 ? rawVersion : 1

  if (fromVersion > SCHEMA_VERSION) {
    // Downgrade: the user ran a newer build. Unknown fields are dropped by
    // normalisation, known ones survive — the least destructive option.
    log.warn('settings written by a newer version; reading best-effort', {
      fileVersion: fromVersion,
      appVersion: SCHEMA_VERSION
    })
    return { document, changed: false, fromVersion, toVersion: SCHEMA_VERSION }
  }

  let current = document
  let changed = false
  for (const step of STEPS) {
    if (step.to <= fromVersion) continue
    log.info(`migrating settings → v${step.to}`, { step: step.describe })
    current = step.migrate(current)
    changed = true
  }

  current.schemaVersion = SCHEMA_VERSION
  if (fromVersion !== SCHEMA_VERSION) changed = true

  return { document: current, changed, fromVersion, toVersion: SCHEMA_VERSION }
}

/** Storage-layout version, tracked separately from the settings schema. */
export const STORAGE_VERSION = 1
