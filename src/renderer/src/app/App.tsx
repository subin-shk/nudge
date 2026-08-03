/**
 * The dashboard shell.
 *
 * Routing is a `switch` over one piece of store state rather than a router
 * library: there are six screens, no URLs, no deep links, and no history to
 * manage in a desktop window. A router here would be ceremony.
 */

import { useEffect } from 'react'
import { ThemeProvider } from '../theme/ThemeProvider'
import { TitleBar } from '../components/TitleBar'
import { Sidebar } from '../components/Sidebar'
import { ToastHost } from '../components/ui'
import { useAppStore, useReady, useRoute, useSettings, useToasts } from '../store/useAppStore'
import { useTranslator } from '../i18n/useTranslator'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { FocusPage } from '../features/focus/FocusPage'
import { RemindersPage } from '../features/reminders/RemindersPage'
import { StatsPage } from '../features/stats/StatsPage'
import { AchievementsPage } from '../features/achievements/AchievementsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { Onboarding } from '../features/onboarding/Onboarding'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import styles from '../components/shell.module.css'

function Splash(): JSX.Element {
  return (
    <div className={styles.splash}>
      <div className={styles.splashPulse} />
    </div>
  )
}

function Routes(): JSX.Element {
  const route = useRoute()
  switch (route) {
    case 'focus':
      return <FocusPage />
    case 'reminders':
      return <RemindersPage />
    case 'stats':
      return <StatsPage />
    case 'achievements':
      return <AchievementsPage />
    case 'settings':
      return <SettingsPage />
    case 'dashboard':
    default:
      return <DashboardPage />
  }
}

export function App(): JSX.Element {
  const ready = useReady()
  const route = useRoute()
  const settings = useSettings()
  const toasts = useToasts()
  const init = useAppStore((state) => state.init)
  const setRoute = useAppStore((state) => state.setRoute)
  const dismissToast = useAppStore((state) => state.dismissToast)
  const t = useTranslator()

  useEffect(() => {
    void init()
  }, [init])

  useKeyboardShortcuts()

  // The document language matters for hyphenation and for screen readers.
  useEffect(() => {
    document.documentElement.lang = settings.general.locale
    document.title = `${t('app.name')} — ${t('app.tagline')}`
  }, [settings.general.locale, t])

  return (
    <ThemeProvider
      themeId={settings.general.theme}
      accentOverride={settings.general.accentOverride}
      reducedMotion={settings.general.reducedMotion}
    >
      <div className={styles.app}>
        <TitleBar />
        {ready ? (
          <div className={styles.body}>
            <Sidebar route={route} onNavigate={setRoute} />
            <main className={styles.content}>
              {/* Keyed on the route so each screen replays its entrance animation. */}
              <div className={styles.contentInner} key={route}>
                <Routes />
              </div>
            </main>
          </div>
        ) : (
          <Splash />
        )}
        <ToastHost toasts={toasts} onDismiss={dismissToast} />
        {ready && !settings.general.onboardingCompleted && <Onboarding />}
      </div>
    </ThemeProvider>
  )
}
