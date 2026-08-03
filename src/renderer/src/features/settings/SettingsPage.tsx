/**
 * Settings.
 *
 * Grouped into tabs rather than one long scroll: nine themes, five reminders and
 * eight shortcuts on a single page is a wall. Each tab is a small component
 * below, so a section can be moved or removed without disturbing the others.
 */

import { useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import type { ShortcutAction, ThemeId } from '@shared/types'
import { LOCALES } from '@shared/i18n'
import { LIMITS } from '@shared/defaults'
import { SHORTCUT_ACTIONS } from '@shared/types/settings'
import { Button, Card, CardHeader, Chip, Field, Modal, NumberField, Select, Slider, Switch, TimeField } from '../../components/ui'
import { Icon, type IconName } from '../../components/Icon'
import { NotificationPrefsEditor } from '../../components/NotificationPrefsEditor'
import { THEME_ORDER, THEMES } from '../../theme/themes'
import { usePatchSettings, useRuntime, useSettings, useUpdateStatus } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import { MascotSettingsSection } from './MascotSettingsSection'
import { ShortcutRecorder } from './ShortcutRecorder'
import shell from '../../components/shell.module.css'
import styles from './settings.module.css'

type TabId = 'general' | 'appearance' | 'notifications' | 'mascot' | 'shortcuts' | 'data'

const TABS: Array<{ id: TabId; labelKey: string; icon: IconName }> = [
  { id: 'general', labelKey: 'settings.section.general', icon: 'settings' },
  { id: 'appearance', labelKey: 'settings.section.appearance', icon: 'palette' },
  { id: 'notifications', labelKey: 'settings.section.notifications', icon: 'bell' },
  { id: 'mascot', labelKey: 'settings.section.mascot', icon: 'mascot' },
  { id: 'shortcuts', labelKey: 'settings.section.shortcuts', icon: 'keyboard' },
  { id: 'data', labelKey: 'settings.section.data', icon: 'folder' }
]

function GeneralTab(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()

  return (
    <Card>
      <CardHeader title={t('settings.section.general')} icon="settings" />

      <Field label={t('settings.launchAtStartup')} hint={t('settings.launchAtStartup.desc')}>
        <Switch
          label={t('settings.launchAtStartup')}
          checked={settings.general.launchAtStartup}
          onChange={(launchAtStartup) => void patch({ general: { launchAtStartup } })}
        />
      </Field>

      <Field label={t('settings.startMinimized')}>
        <Switch
          label={t('settings.startMinimized')}
          checked={settings.general.startMinimized}
          onChange={(startMinimized) => void patch({ general: { startMinimized } })}
        />
      </Field>

      <Field label={t('settings.minimizeToTray')} hint={t('settings.minimizeToTray.desc')}>
        <Switch
          label={t('settings.minimizeToTray')}
          checked={settings.general.minimizeToTrayOnClose}
          onChange={(minimizeToTrayOnClose) => void patch({ general: { minimizeToTrayOnClose } })}
        />
      </Field>

      <Field
        label={t('settings.language')}
        hint={t('settings.language.coverage', {
          percent: Math.round((LOCALES.find((locale) => locale.id === settings.general.locale)?.coverage ?? 1) * 100)
        })}
      >
        <Select
          label={t('settings.language')}
          value={settings.general.locale}
          options={LOCALES.map((locale) => ({
            value: locale.id,
            label: locale.coverage >= 0.98 ? locale.nativeName : `${locale.nativeName} · ${Math.round(locale.coverage * 100)}%`
          }))}
          onChange={(locale) => void patch({ general: { locale } })}
        />
      </Field>

      <Field label={t('settings.autoUpdate')}>
        <Switch
          label={t('settings.autoUpdate')}
          checked={settings.general.autoUpdate}
          onChange={(autoUpdate) => void patch({ general: { autoUpdate } })}
        />
      </Field>
    </Card>
  )
}

/** A curated accent palette plus "follow the theme". */
const ACCENT_SWATCHES = ['#4f7cff', '#22d3ee', '#3dd6c0', '#4ade80', '#fbbf24', '#fb923c', '#f472b6', '#a78bfa']

/**
 * The three preview colours as custom properties on the card.
 *
 * Set on the card rather than inline on each swatch layer so the stylesheet owns
 * every visual property and the JSX only supplies data.
 */
export function swatchVars(page: string, card: string, accent: string): CSSProperties {
  return { '--swatch-page': page, '--swatch-card': card, '--swatch-accent': accent } as CSSProperties
}

function AppearanceTab(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()

  return (
    <>
      <Card>
        <CardHeader title={t('settings.theme')} icon="palette" />
        <div className={styles.themeGrid}>
          <button
            type="button"
            className={clsx(styles.themeCard, settings.general.theme === 'system' && styles.themeCardActive)}
            onClick={() => void patch({ general: { theme: 'system' } })}
            // Split swatch: light on the left, dark on the right.
            style={swatchVars('linear-gradient(90deg, #f5f7fb 0 50%, #14161c 50% 100%)', 'rgba(128,128,128,0.35)', '#6d8dff')}
          >
            <span className={styles.themeSwatch}>
              <span className={styles.themeSwatchCard} />
              <span className={styles.themeSwatchAccent} />
            </span>
            <span className={styles.themeName}>
              {t('theme.system')}
              {settings.general.theme === 'system' && <Icon name="check" size={14} />}
            </span>
          </button>

          {THEME_ORDER.map((id) => {
            const theme = THEMES[id]
            const active = settings.general.theme === id
            return (
              <button
                key={id}
                type="button"
                className={clsx(styles.themeCard, active && styles.themeCardActive)}
                onClick={() => void patch({ general: { theme: id as ThemeId } })}
                style={swatchVars(theme.preview[0], theme.preview[1], theme.preview[2])}
              >
                <span className={styles.themeSwatch}>
                  <span className={styles.themeSwatchCard} />
                  <span className={styles.themeSwatchAccent} />
                </span>
                <span className={styles.themeName}>
                  {t(theme.labelKey)}
                  {active && <Icon name="check" size={14} />}
                </span>
              </button>
            )
          })}
        </div>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.accent')} icon="sparkle" />
        <Field label={t('settings.accent')} hint={t('settings.accent.useTheme')}>
          <div className={styles.accentRow}>
            <button
              type="button"
              className={clsx(styles.accentAuto, settings.general.accentOverride === null && styles.accentDotActive)}
              aria-label={t('settings.accent.useTheme')}
              title={t('settings.accent.useTheme')}
              onClick={() => void patch({ general: { accentOverride: null } })}
            >
              <Icon name="close" size={12} />
            </button>
            {ACCENT_SWATCHES.map((colour) => (
              <button
                key={colour}
                type="button"
                className={clsx(styles.accentDot, settings.general.accentOverride === colour && styles.accentDotActive)}
                style={{ background: colour }}
                aria-label={colour}
                title={colour}
                onClick={() => void patch({ general: { accentOverride: colour } })}
              />
            ))}
          </div>
        </Field>

        <Field label={t('settings.reducedMotion')} hint={t('settings.reducedMotion.desc')}>
          <Switch
            label={t('settings.reducedMotion')}
            checked={settings.general.reducedMotion}
            onChange={(reducedMotion) => void patch({ general: { reducedMotion } })}
          />
        </Field>
      </Card>
    </>
  )
}

const DND_PRESETS = [15, 30, 60, 120]

function NotificationsTab(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()
  const runtime = useRuntime()

  return (
    <>
      <Card>
        <CardHeader title={t('settings.section.notifications')} icon="bell" />

        <Field label={t('settings.notifications.master')} hint={t('settings.notifications.master.desc')}>
          <Switch
            label={t('settings.notifications.master')}
            checked={settings.notifications.enabled}
            onChange={(enabled) => void patch({ notifications: { enabled } })}
          />
        </Field>

        <Field label={t('settings.notifications.masterVolume')} disabled={!settings.notifications.enabled}>
          <Slider
            label={t('settings.notifications.masterVolume')}
            value={settings.notifications.masterVolume}
            min={LIMITS.volume.min}
            max={LIMITS.volume.max}
            step={LIMITS.volume.step}
            onChange={(masterVolume) => void patch({ notifications: { masterVolume } })}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        </Field>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.quietHours')} icon="moon" subtitle={t('settings.quietHours.desc')} />

        <Field label={t('common.enabled')}>
          <Switch
            label={t('settings.quietHours')}
            checked={settings.notifications.quietHours.enabled}
            onChange={(enabled) => void patch({ notifications: { quietHours: { enabled } } })}
          />
        </Field>

        <Field label={t('settings.quietHours.from')} disabled={!settings.notifications.quietHours.enabled}>
          <TimeField
            label={t('settings.quietHours.from')}
            value={settings.notifications.quietHours.start}
            onChange={(start) => void patch({ notifications: { quietHours: { start } } })}
          />
        </Field>

        <Field label={t('settings.quietHours.to')} disabled={!settings.notifications.quietHours.enabled}>
          <TimeField
            label={t('settings.quietHours.to')}
            value={settings.notifications.quietHours.end}
            onChange={(end) => void patch({ notifications: { quietHours: { end } } })}
          />
        </Field>

        <Field label={t('settings.quietHours.behaviour')} disabled={!settings.notifications.quietHours.enabled}>
          <Select
            label={t('settings.quietHours.behaviour')}
            value={settings.notifications.quietHoursBehaviour}
            options={[
              { value: 'suppress', label: t('settings.quietHours.suppress') },
              { value: 'deferToEnd', label: t('settings.quietHours.deferToEnd') }
            ]}
            onChange={(quietHoursBehaviour) => void patch({ notifications: { quietHoursBehaviour } })}
          />
        </Field>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.dnd')} icon="bellOff" subtitle={t('settings.dnd.desc')} />

        <Field label={t('settings.dnd')}>
          <Switch
            label={t('settings.dnd')}
            checked={runtime.doNotDisturbActive}
            onChange={(enabled) => void window.nudge.dnd.set(enabled)}
          />
        </Field>

        <Field label={t('settings.dnd.for')}>
          <div className={styles.dataRow}>
            {DND_PRESETS.map((minutes) => (
              <Chip key={minutes} onClick={() => void window.nudge.dnd.set(true, minutes)}>
                {minutes} {t('common.minutesShort')}
              </Chip>
            ))}
          </div>
        </Field>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.section.focus')} icon="timer" />
        <NotificationPrefsEditor
          prefs={settings.focus.notifications}
          onChange={(change) => void patch({ focus: { notifications: change } })}
        />
      </Card>
    </>
  )
}

function ShortcutsTab(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()

  return (
    <Card>
      <CardHeader title={t('settings.section.shortcuts')} icon="keyboard" subtitle={t('settings.shortcuts.desc')} />
      {SHORTCUT_ACTIONS.map((action: ShortcutAction) => (
        <Field key={action} label={t(`settings.shortcut.${action}`)}>
          <ShortcutRecorder
            label={t(`settings.shortcut.${action}`)}
            value={settings.shortcuts[action]}
            onChange={(accelerator) => void patch({ shortcuts: { [action]: accelerator } })}
          />
        </Field>
      ))}
    </Card>
  )
}

function DataTab(): JSX.Element {
  const t = useTranslator()
  const runtime = useRuntime()
  const updateStatus = useUpdateStatus()
  const [confirm, setConfirm] = useState<'clearStats' | 'resetAll' | null>(null)

  return (
    <>
      <Card>
        <CardHeader title={t('settings.section.data')} icon="folder" />

        <Field label={t('settings.data.export')} hint={t('settings.data.export.desc')}>
          <Button icon="download" onClick={() => void window.nudge.settings.export()}>
            {t('settings.data.export')}
          </Button>
        </Field>

        <Field label={t('settings.data.import')} hint={t('settings.data.import.desc')}>
          <Button icon="upload" onClick={() => void window.nudge.settings.import()}>
            {t('settings.data.import')}
          </Button>
        </Field>

        <Field label={t('settings.data.openFolder')}>
          <Button icon="folder" onClick={() => void window.nudge.system.openDataFolder()}>
            {t('settings.data.openFolder')}
          </Button>
        </Field>

        <Field label={t('settings.data.clearStats')} hint={t('settings.data.clearStats.desc')}>
          <Button variant="danger" icon="trash" onClick={() => setConfirm('clearStats')}>
            {t('settings.data.clearStats')}
          </Button>
        </Field>

        <Field label={t('settings.data.resetAll')}>
          <Button variant="danger" icon="refresh" onClick={() => setConfirm('resetAll')}>
            {t('settings.data.resetAll')}
          </Button>
        </Field>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.section.about')} icon="info" />
        <div className={styles.about}>
          <span className={styles.version}>{t('settings.about.version', { version: runtime.appVersion })}</span>
          <span className={styles.version}>
            {updateStatus.supported
              ? updateStatus.available
                ? t('settings.about.updateAvailable', { version: updateStatus.version ?? '?' })
                : t('settings.about.upToDate')
              : t('settings.about.updatesUnavailable')}
          </span>
          <Button
            icon="refresh"
            disabled={!updateStatus.supported || updateStatus.checking}
            onClick={() => void window.nudge.updates.check()}
          >
            {t('settings.about.checkUpdates')}
          </Button>
        </div>
      </Card>

      <Modal
        open={confirm !== null}
        title={confirm === 'clearStats' ? t('settings.data.clearStats') : t('settings.data.resetAll')}
        body={confirm === 'clearStats' ? t('settings.data.confirmClear') : t('settings.data.confirmReset')}
        confirmLabel={confirm === 'clearStats' ? t('settings.data.clearStats') : t('common.reset')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'clearStats') void window.nudge.stats.clear()
          if (confirm === 'resetAll') void window.nudge.settings.reset()
          setConfirm(null)
        }}
      />
    </>
  )
}

export function SettingsPage(): JSX.Element {
  const t = useTranslator()
  const [tab, setTab] = useState<TabId>('general')

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={shell.pageTitle}>{t('settings.title')}</h1>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label={t('settings.title')}>
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={clsx(styles.tab, tab === entry.id && styles.tabActive)}
            onClick={() => setTab(entry.id)}
          >
            <Icon name={entry.icon} size={16} />
            {t(entry.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'mascot' && <MascotSettingsSection />}
      {tab === 'shortcuts' && <ShortcutsTab />}
      {tab === 'data' && <DataTab />}
    </>
  )
}
