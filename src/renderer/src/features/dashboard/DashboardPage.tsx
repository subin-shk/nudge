/**
 * The dashboard.
 *
 * Answers four questions in order of how often they are asked:
 *   1. Is anything paused right now?          → status banner
 *   2. How am I doing today?                  → stat tiles
 *   3. What is my timer doing?                → focus card
 *   4. When is the next nudge, and can I act? → reminder rows
 */

import { formatDurationShort, toHours } from '@shared/time'
import { Button, Card, CardHeader, Chip, EmptyState, StatTile, Switch } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useRuntime, useSettings, useSetRoute, useToday, useStreak, usePatchSettings } from '../../store/useAppStore'
import { useReminderViews } from '../../hooks/useReminders'
import { useTranslator } from '../../i18n/useTranslator'
import { FocusCard } from './FocusCard'
import { ReminderRow } from './ReminderRow'
import shell from '../../components/shell.module.css'
import styles from './dashboard.module.css'

/** Greeting keyed to the local hour — small touch, disproportionate warmth. */
function greetingKey(hour: number): string {
  if (hour < 5) return 'dashboard.greeting.night'
  if (hour < 12) return 'dashboard.greeting.morning'
  if (hour < 18) return 'dashboard.greeting.afternoon'
  if (hour < 23) return 'dashboard.greeting.evening'
  return 'dashboard.greeting.night'
}

function StatusBanner(): JSX.Element | null {
  const t = useTranslator()
  const runtime = useRuntime()
  const settings = useSettings()

  if (runtime.doNotDisturbActive) {
    return (
      <div className={styles.banner} role="status">
        <Icon name="bellOff" size={17} />
        {t('dashboard.dndActive')}
        <span className={styles.bannerAction}>
          <Button size="sm" variant="ghost" onClick={() => void window.nudge.dnd.set(false)}>
            {t('dashboard.turnOff')}
          </Button>
        </span>
      </div>
    )
  }

  if (runtime.quietHoursActive) {
    return (
      <div className={styles.banner} role="status">
        <Icon name="moon" size={17} />
        {t('dashboard.quietHoursActive')}
      </div>
    )
  }

  if (!settings.notifications.enabled) {
    return (
      <div className={styles.banner} role="status">
        <Icon name="alert" size={17} />
        {t('settings.notifications.master')}: {t('common.off')}
      </div>
    )
  }

  return null
}

function QuickToggles(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const runtime = useRuntime()
  const patch = usePatchSettings()
  const views = useReminderViews()

  return (
    <Card>
      <CardHeader title={t('dashboard.quickToggles')} icon="sparkle" />
      <div className={styles.toggleList}>
        {views.map((view) => (
          <div key={view.definition.kind} className={styles.toggleRow}>
            <span className={styles.toggleLabel}>
              <span className={styles.toggleEmoji}>{view.definition.emoji}</span>
              {view.shortTitle}
            </span>
            <Switch
              label={view.title}
              checked={view.config.enabled}
              onChange={(enabled) => void window.nudge.reminders.setEnabled(view.definition.kind, enabled)}
            />
          </div>
        ))}

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>
            <span className={styles.toggleEmoji}>
              <Icon name="mascot" size={15} />
            </span>
            {t('settings.section.mascot')}
          </span>
          <Switch
            label={t('settings.mascot.enabled')}
            checked={settings.mascot.enabled}
            onChange={(enabled) => void patch({ mascot: { enabled } })}
          />
        </div>

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>
            <span className={styles.toggleEmoji}>
              <Icon name="bellOff" size={15} />
            </span>
            {t('settings.dnd')}
          </span>
          <Switch
            label={t('settings.dnd')}
            checked={runtime.doNotDisturbActive}
            onChange={(enabled) => void window.nudge.dnd.set(enabled)}
          />
        </div>
      </div>
    </Card>
  )
}

function TodayGoals(): JSX.Element | null {
  const t = useTranslator()
  const today = useToday()
  const views = useReminderViews({ onlyEnabled: true }).filter((view) => view.config.dailyGoal > 0)

  if (views.length === 0) return null

  const met = views.filter((view) => (today.completed[view.definition.kind] ?? 0) >= view.config.dailyGoal).length

  return (
    <Card>
      <CardHeader
        title={t('common.goal')}
        icon="target"
        subtitle={t('dashboard.goalsMet', { count: met, total: views.length })}
        actions={met === views.length ? <Chip tone="success" icon="check">{t('common.done')}</Chip> : undefined}
      />
      <div>
        {views.map((view) => {
          const done = today.completed[view.definition.kind] ?? 0
          const complete = done >= view.config.dailyGoal
          return (
            <div key={view.definition.kind} className={styles.goalRow}>
              <span className={styles.goalName}>
                {view.definition.emoji} {view.shortTitle}
              </span>
              <span className={complete ? `${styles.goalCount} ${styles.goalMet}` : styles.goalCount}>
                {done} / {view.config.dailyGoal}
              </span>
              {complete && <Icon name="check" size={14} className={styles.goalMet} />}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function DashboardPage(): JSX.Element {
  const t = useTranslator()
  const today = useToday()
  const streak = useStreak()
  const runtime = useRuntime()
  const setRoute = useSetRoute()
  const views = useReminderViews({ onlyEnabled: true })

  const now = new Date()
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={`${shell.pageTitle} ${styles.greeting}`}>
            {t(greetingKey(now.getHours()))}
            <span className={styles.date}>{dateLabel}</span>
          </h1>
          <p className={shell.pageSubtitle}>{t('app.tagline')}</p>
        </div>
        <Button icon="chart" onClick={() => setRoute('stats')}>
          {t('nav.stats')}
        </Button>
      </header>

      <StatusBanner />

      <div className={styles.statGrid}>
        <StatTile
          label={t('dashboard.focusToday')}
          icon="timer"
          tone="focus"
          value={toHours(runtime.focus.todayFocusSeconds)}
          unit={t('stats.hoursUnit')}
          footer={formatDurationShort(runtime.focus.todayFocusSeconds)}
        />
        <StatTile
          label={t('dashboard.eyeBreaksToday')}
          icon="eye"
          tone="eye"
          value={today.completed.eyeCare ?? 0}
          footer={
            (runtime.reminders.eyeCare?.todayGoal ?? 0) > 0
              ? t('reminder.completedToday', {
                  done: today.completed.eyeCare ?? 0,
                  goal: runtime.reminders.eyeCare?.todayGoal ?? 0
                })
              : undefined
          }
        />
        <StatTile
          label={t('dashboard.waterToday')}
          icon="droplet"
          tone="water"
          value={today.completed.water ?? 0}
          footer={
            (runtime.reminders.water?.todayGoal ?? 0) > 0
              ? t('reminder.completedToday', {
                  done: today.completed.water ?? 0,
                  goal: runtime.reminders.water?.todayGoal ?? 0
                })
              : undefined
          }
        />
        <StatTile
          label={t('dashboard.streak')}
          icon="flame"
          tone="move"
          value={streak.current}
          footer={`${t('stats.bestStreak')}: ${streak.best}`}
        />
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.column}>
          <FocusCard />
          <Card>
            <CardHeader
              title={t('dashboard.reminderStatus')}
              icon="bell"
              actions={
                <Button size="sm" variant="ghost" onClick={() => setRoute('reminders')}>
                  {t('common.edit')}
                </Button>
              }
            />
            {views.length === 0 ? (
              <EmptyState icon="bell" title={t('dashboard.allSet')} body={t('settings.section.reminders')} />
            ) : (
              <div className={styles.reminderList}>
                {views.map((view) => (
                  <ReminderRow key={view.definition.kind} view={view} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={styles.column}>
          <TodayGoals />
          <QuickToggles />
        </div>
      </div>
    </>
  )
}
