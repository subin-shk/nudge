/**
 * Settings normalisation.
 *
 * `normalizeSettings` is the app's trust boundary: everything read from disk,
 * imported from a backup, or arriving over IPC passes through it. These tests
 * pin the three guarantees the rest of the codebase relies on — totality,
 * bounds, and enum safety — plus the capability rules that stop a reminder from
 * being configured into a state where it can never fire.
 */

import { describe, expect, it } from 'vitest'
import { createDefaultSettings, SCHEMA_VERSION } from '@shared/defaults'
import { looksLikeSettingsDocument, normalizeSettings } from '@main/storage/settingsSchema'
import { migrateSettingsDocument } from '@main/storage/migrations'

describe('normalizeSettings — totality', () => {
  it('fills a completely empty document with defaults', () => {
    const settings = normalizeSettings({})
    expect(settings).toEqual(createDefaultSettings())
  })

  it('survives junk input without throwing', () => {
    expect(() => normalizeSettings(null)).not.toThrow()
    expect(() => normalizeSettings('nope')).not.toThrow()
    expect(() => normalizeSettings(42)).not.toThrow()
    expect(normalizeSettings(null).general.theme).toBe('system')
  })

  it('keeps a partial document and fills the rest', () => {
    const settings = normalizeSettings({ general: { theme: 'ocean' } })
    expect(settings.general.theme).toBe('ocean')
    expect(settings.general.locale).toBe('en')
    expect(settings.reminders.eyeCare).toBeDefined()
  })
})

describe('normalizeSettings — bounds', () => {
  it('clamps a zero reminder interval, which would otherwise fire every tick', () => {
    const settings = normalizeSettings({ reminders: { eyeCare: { schedule: { intervalMinutes: 0 } } } })
    expect(settings.reminders.eyeCare!.schedule.intervalMinutes).toBe(1)
  })

  it('clamps absurdly large values', () => {
    const settings = normalizeSettings({ reminders: { eyeCare: { schedule: { intervalMinutes: 999_999 } } } })
    expect(settings.reminders.eyeCare!.schedule.intervalMinutes).toBe(24 * 60)
  })

  it('clamps volumes into 0..1', () => {
    const settings = normalizeSettings({ notifications: { masterVolume: 7 } })
    expect(settings.notifications.masterVolume).toBe(1)
    expect(normalizeSettings({ notifications: { masterVolume: -3 } }).notifications.masterVolume).toBe(0)
  })

  it('defaults mascot visibility to always and rejects an unknown mode', () => {
    expect(normalizeSettings({}).mascot.visibility).toBe('always')
    expect(normalizeSettings({ mascot: { visibility: 'onAlert' } }).mascot.visibility).toBe('onAlert')
    expect(normalizeSettings({ mascot: { visibility: 'sometimes' } }).mascot.visibility).toBe('always')
  })

  it('clamps mascot size and speed', () => {
    const settings = normalizeSettings({ mascot: { size: 5000, speed: 99 } })
    expect(settings.mascot.size).toBe(260)
    expect(settings.mascot.speed).toBe(2.5)
  })

  it('rejects NaN rather than propagating it into the UI', () => {
    const settings = normalizeSettings({ mascot: { size: Number.NaN } })
    expect(Number.isFinite(settings.mascot.size)).toBe(true)
  })
})

describe('normalizeSettings — enums and formats', () => {
  it('falls back on an unknown theme, locale or skin', () => {
    const settings = normalizeSettings({
      general: { theme: 'neon-vaporwave', locale: 'xx' },
      mascot: { skin: 'not-a-skin' }
    })
    expect(settings.general.theme).toBe('system')
    expect(settings.general.locale).toBe('en')
    expect(settings.mascot.skin).toBe('mint')
  })

  it('accepts a valid hex accent and rejects anything else', () => {
    expect(normalizeSettings({ general: { accentOverride: '#FF8800' } }).general.accentOverride).toBe('#ff8800')
    expect(normalizeSettings({ general: { accentOverride: 'red' } }).general.accentOverride).toBeNull()
    // This one matters: the value is interpolated into CSS.
    expect(normalizeSettings({ general: { accentOverride: 'url(evil)' } }).general.accentOverride).toBeNull()
  })

  it('repairs malformed quiet-hours times', () => {
    const settings = normalizeSettings({ notifications: { quietHours: { start: '99:99', end: '7:5' } } })
    expect(settings.notifications.quietHours.start).toBe('22:00')
    expect(settings.notifications.quietHours.end).toBe('07:00')
  })

  it('normalises a single-digit hour to HH:mm', () => {
    const settings = normalizeSettings({ notifications: { quietHours: { start: '9:05' } } })
    expect(settings.notifications.quietHours.start).toBe('09:05')
  })

  it('drops a shortcut with no modifier — it would swallow that key system-wide', () => {
    const settings = normalizeSettings({ shortcuts: { toggleDashboard: 'N' } })
    expect(settings.shortcuts.toggleDashboard).toBeNull()
    expect(normalizeSettings({ shortcuts: { startFocus: 'Control+Alt+F' } }).shortcuts.startFocus).toBe('Control+Alt+F')
  })
})

describe('normalizeSettings — capability rules', () => {
  it('forces interval mode for a reminder that cannot use time-of-day scheduling', () => {
    // eyeCare declares scheduledTimes: false.
    const settings = normalizeSettings({
      reminders: { eyeCare: { schedule: { mode: 'times', times: ['09:00'] } } }
    })
    expect(settings.reminders.eyeCare!.schedule.mode).toBe('interval')
  })

  it('falls back to interval when times mode has no times — it would never fire', () => {
    const settings = normalizeSettings({ reminders: { water: { schedule: { mode: 'times', times: [] } } } })
    expect(settings.reminders.water!.schedule.mode).toBe('interval')
  })

  it('keeps times mode when the reminder supports it and has times', () => {
    const settings = normalizeSettings({
      reminders: { water: { schedule: { mode: 'times', times: ['14:00', '09:00', '09:00'] } } }
    })
    expect(settings.reminders.water!.schedule.mode).toBe('times')
    // Deduplicated and sorted.
    expect(settings.reminders.water!.schedule.times).toEqual(['09:00', '14:00'])
  })

  it('zeroes the break length for a reminder with no timed break', () => {
    const settings = normalizeSettings({ reminders: { water: { breakSeconds: 300 } } })
    expect(settings.reminders.water!.breakSeconds).toBe(0)
  })

  it('reverts a custom sound with no file, which would be silently silent', () => {
    const settings = normalizeSettings({
      reminders: { eyeCare: { notifications: { soundId: 'custom', customSoundPath: null } } }
    })
    expect(settings.reminders.eyeCare!.notifications.soundId).toBe('chime')
  })

  it('keeps a custom sound that does have a file', () => {
    const settings = normalizeSettings({
      reminders: { eyeCare: { notifications: { soundId: 'custom', customSoundPath: 'C:/sounds/ping.wav' } } }
    })
    expect(settings.reminders.eyeCare!.notifications.soundId).toBe('custom')
  })
})

describe('normalizeSettings — expiring state', () => {
  it('clears a timed Do Not Disturb that has already lapsed', () => {
    const settings = normalizeSettings({ notifications: { doNotDisturbUntil: Date.now() - 60_000 } })
    expect(settings.notifications.doNotDisturbUntil).toBeNull()
  })

  it('keeps one that is still in the future', () => {
    const until = Date.now() + 600_000
    expect(normalizeSettings({ notifications: { doNotDisturbUntil: until } }).notifications.doNotDisturbUntil).toBe(until)
  })
})

describe('unknown reminder kinds', () => {
  it('preserves configuration for a kind whose plugin has not loaded', () => {
    const settings = normalizeSettings({
      reminders: { posture: { enabled: true, schedule: { mode: 'interval', intervalMinutes: 45, times: [] } } }
    })
    expect(settings.reminders.posture).toBeDefined()
    expect(settings.reminders.posture!.enabled).toBe(true)
    expect(settings.reminders.posture!.schedule.intervalMinutes).toBe(45)
  })
})

describe('looksLikeSettingsDocument', () => {
  it('accepts a real settings document', () => {
    expect(looksLikeSettingsDocument(createDefaultSettings())).toBe(true)
  })

  it('rejects unrelated JSON — the wrong file picked in the import dialog', () => {
    expect(looksLikeSettingsDocument({ name: 'package', version: '1.0.0' })).toBe(false)
    expect(looksLikeSettingsDocument([])).toBe(false)
    expect(looksLikeSettingsDocument(null)).toBe(false)
    expect(looksLikeSettingsDocument('{}')).toBe(false)
  })
})

describe('migrateSettingsDocument', () => {
  it('stamps the current schema version onto an unversioned document', () => {
    const outcome = migrateSettingsDocument({ general: { theme: 'dark' } })
    expect((outcome.document as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('reports no change for a current-version document', () => {
    const outcome = migrateSettingsDocument(createDefaultSettings())
    expect(outcome.changed).toBe(false)
    expect(outcome.fromVersion).toBe(SCHEMA_VERSION)
  })

  it('reads a document from a newer build best-effort instead of discarding it', () => {
    const outcome = migrateSettingsDocument({ schemaVersion: SCHEMA_VERSION + 5, general: { theme: 'forest' } })
    expect(outcome.changed).toBe(false)
    expect(normalizeSettings(outcome.document).general.theme).toBe('forest')
  })
})
