/**
 * Primary navigation.
 *
 * The footer doubles as an at-a-glance status line — whether reminders are
 * actually running right now. That question ("is this thing on?") is the one
 * users of background apps ask most, and answering it in the chrome means they
 * never have to go looking.
 */

import clsx from 'clsx'
import type { AppRoute } from '@shared/types'
import { Icon, type IconName } from './Icon'
import { useRuntime, useSettings } from '../store/useAppStore'
import { useTranslator } from '../i18n/useTranslator'
import styles from './shell.module.css'

interface NavEntry {
  route: AppRoute
  labelKey: string
  icon: IconName
}

const NAV: NavEntry[] = [
  { route: 'dashboard', labelKey: 'nav.dashboard', icon: 'home' },
  { route: 'focus', labelKey: 'nav.focus', icon: 'timer' },
  { route: 'reminders', labelKey: 'nav.reminders', icon: 'bell' },
  { route: 'stats', labelKey: 'nav.stats', icon: 'chart' },
  { route: 'achievements', labelKey: 'nav.achievements', icon: 'trophy' },
  { route: 'settings', labelKey: 'nav.settings', icon: 'settings' }
]

export function Sidebar({ route, onNavigate }: { route: AppRoute; onNavigate: (route: AppRoute) => void }): JSX.Element {
  const t = useTranslator()
  const runtime = useRuntime()
  const settings = useSettings()

  const enabledCount = Object.values(settings.reminders).filter((reminder) => reminder.enabled).length
  const paused = runtime.doNotDisturbActive || runtime.quietHoursActive || !settings.notifications.enabled

  const statusLabel = !settings.notifications.enabled
    ? t('common.disabled')
    : runtime.doNotDisturbActive
      ? t('settings.dnd')
      : runtime.quietHoursActive
        ? t('settings.quietHours')
        : t('reminder.next')

  return (
    <nav className={styles.sidebar} aria-label={t('nav.dashboard')}>
      {NAV.map((entry) => (
        <button
          key={entry.route}
          type="button"
          className={clsx(styles.navItem, route === entry.route && styles.navItemActive)}
          aria-current={route === entry.route ? 'page' : undefined}
          onClick={() => onNavigate(entry.route)}
        >
          <Icon name={entry.icon} size={18} />
          <span className={styles.navLabel}>{t(entry.labelKey)}</span>
          {entry.route === 'reminders' && enabledCount > 0 && <span className={styles.navBadge}>{enabledCount}</span>}
        </button>
      ))}

      <div className={styles.sidebarSpacer} />

      <div className={styles.sidebarFooter}>
        <div className={styles.statusRow}>
          <span
            className={clsx(
              styles.statusDot,
              paused && styles.statusDotWarning,
              !settings.notifications.enabled && styles.statusDotMuted
            )}
          />
          {statusLabel}
        </div>
        <div className={styles.statusRow}>
          <Icon name="flame" size={13} />
          {t('stats.days', { count: runtime.streak.current })}
        </div>
      </div>
    </nav>
  )
}
