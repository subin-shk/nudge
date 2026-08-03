/**
 * One reminder's live status line.
 *
 * Deliberately dense: name, when it next fires, today's progress against the
 * goal, and the two actions worth one click. Anything more belongs on the
 * Reminders screen — the dashboard's job is a glance, not a control panel.
 */

import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { formatCountdown } from '@shared/time'
import { Icon } from '../../components/Icon'
import { IconButton, ProgressBar } from '../../components/ui'
import type { ReminderView } from '../../hooks/useReminders'
import { useTranslator } from '../../i18n/useTranslator'
import styles from './dashboard.module.css'

export function ReminderRow({ view }: { view: ReminderView }): JSX.Element {
  const t = useTranslator()
  const { definition, config, runtime } = view

  const isDue = runtime?.phase === 'due' || runtime?.phase === 'active'
  const pauseReason = runtime?.pauseReasons[0]

  const statusText = (): string => {
    if (!runtime) return '—'
    if (runtime.phase === 'active') return t('reminder.dueNow')
    if (runtime.phase === 'due') return t('reminder.dueNow')
    if (pauseReason) return t(`reminder.pausedBecause.${pauseReason}`)
    if (runtime.phase === 'snoozed') {
      return t('reminder.snoozedUntil', { time: formatCountdown(runtime.secondsUntilNext) })
    }
    return t('reminder.nextIn', { time: formatCountdown(runtime.secondsUntilNext) })
  }

  const goal = config.dailyGoal
  const done = runtime?.todayCompleted ?? 0
  /** The shortest configured snooze — the one worth a one-click button. */
  const firstSnooze = config.snoozeMinutes[0]

  return (
    <div
      className={clsx(styles.reminderRow, isDue && styles.reminderRowDue)}
      style={{ '--row-tone': `var(--tone-${definition.tone})` } as CSSProperties}
    >
      <span className={styles.reminderIcon}>
        <Icon name={definition.icon} size={17} />
      </span>

      <div className={styles.reminderInfo}>
        <div className={styles.reminderName}>{view.shortTitle}</div>
        <div className={styles.reminderMeta}>
          {statusText()}
          {goal > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('reminder.completedToday', { done, goal })}</span>
            </>
          )}
          {goal === 0 && done > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('reminder.completedTodayNoGoal', { done })}</span>
            </>
          )}
        </div>
      </div>

      {goal > 0 && (
        <div className={styles.reminderProgress}>
          <ProgressBar value={done} max={goal} tone={definition.tone} />
        </div>
      )}

      <div className={styles.reminderActions}>
        {isDue ? (
          <IconButton
            icon="check"
            label={t('common.done')}
            onClick={() => void window.nudge.reminders.complete(definition.kind)}
          />
        ) : (
          <IconButton
            icon="play"
            label={t.maybe(`reminder.${definition.kind}.cta`) ?? t('common.start')}
            onClick={() => void window.nudge.reminders.triggerNow(definition.kind)}
          />
        )}
        {isDue && firstSnooze !== undefined && (
          <IconButton
            icon="snooze"
            label={t('break.snoozeFor', { minutes: firstSnooze })}
            onClick={() => void window.nudge.reminders.snooze(definition.kind, firstSnooze)}
          />
        )}
        {!isDue && (
          <IconButton
            icon="refresh"
            label={t('common.reset')}
            onClick={() => void window.nudge.reminders.restartInterval(definition.kind)}
          />
        )}
      </div>
    </div>
  )
}
