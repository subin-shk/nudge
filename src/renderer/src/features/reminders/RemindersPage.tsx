/**
 * Reminders screen — one card per reminder kind, rendered from the catalog.
 *
 * Adding a reminder type (built-in or plugin) makes a fully-configurable card
 * appear here with no change to this file.
 */

import { Button } from '../../components/ui'
import { useReminderViews } from '../../hooks/useReminders'
import { useSetRoute } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import { ReminderCard } from './ReminderCard'
import shell from '../../components/shell.module.css'
import styles from './reminders.module.css'

export function RemindersPage(): JSX.Element {
  const t = useTranslator()
  const views = useReminderViews()
  const setRoute = useSetRoute()

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={shell.pageTitle}>{t('nav.reminders')}</h1>
          <p className={shell.pageSubtitle}>{t('settings.notifications.perFeature')}</p>
        </div>
        <Button icon="bell" onClick={() => setRoute('settings')}>
          {t('settings.section.notifications')}
        </Button>
      </header>

      <div className={styles.list}>
        {views.map((view, index) => (
          // The first enabled reminder starts expanded so the screen is never
          // just a wall of collapsed rows on first visit.
          <ReminderCard key={view.definition.kind} view={view} defaultOpen={index === 0} />
        ))}
      </div>
    </>
  )
}
