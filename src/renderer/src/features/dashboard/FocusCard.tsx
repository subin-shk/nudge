/**
 * The dashboard's focus timer widget.
 *
 * Shows a progress ring while a session runs and a quick-start row when idle.
 * The ring is fed `remainingSeconds / totalSeconds` straight from the main
 * process — the renderer never runs its own countdown, so the number here and
 * the number in the tray can never disagree.
 */

import { formatClock, formatDurationShort } from '@shared/time'
import { Button, Card, CardHeader, ProgressRing } from '../../components/ui'
import { useFocusRuntime, useSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import styles from './dashboard.module.css'

const QUICK_MINUTES = [15, 25, 45, 60]

export function FocusCard(): JSX.Element {
  const t = useTranslator()
  const focus = useFocusRuntime()
  const settings = useSettings()

  const running = focus.status === 'running'
  const paused = focus.status === 'paused'
  const active = running || paused
  const progress = focus.totalSeconds > 0 ? 1 - focus.remainingSeconds / focus.totalSeconds : 0

  return (
    <Card>
      <CardHeader
        title={t('dashboard.currentTimer')}
        icon="timer"
        subtitle={
          focus.todayFocusSeconds > 0
            ? `${t('dashboard.focusToday')}: ${formatDurationShort(focus.todayFocusSeconds)}`
            : undefined
        }
      />

      <div className={styles.focusCard}>
        {active ? (
          <>
            <ProgressRing
              progress={progress}
              size={188}
              thickness={11}
              colorVar={focus.phase === 'focus' ? '--tone-focus' : '--tone-move'}
            >
              <span className={styles.focusTime}>{formatClock(focus.remainingSeconds)}</span>
              <span className={styles.focusPhase}>{t(`focus.phase.${focus.phase}`)}</span>
            </ProgressRing>

            <div className={styles.focusActions}>
              {running ? (
                <Button icon="pause" onClick={() => void window.nudge.focus.pause()}>
                  {t('common.pause')}
                </Button>
              ) : (
                <Button icon="play" variant="primary" onClick={() => void window.nudge.focus.resume()}>
                  {t('common.resume')}
                </Button>
              )}
              <Button icon="plus" onClick={() => void window.nudge.focus.extend(5)}>
                {t('focus.extend', { minutes: 5 })}
              </Button>
              <Button icon="stop" variant="ghost" onClick={() => void window.nudge.focus.stop()}>
                {t('common.stop')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <ProgressRing progress={0} size={188} thickness={11} instant>
              <span className={styles.focusTime}>{formatClock(settings.focus.defaultMinutes * 60)}</span>
              <span className={styles.focusPhase}>{t('dashboard.noTimer')}</span>
            </ProgressRing>

            <div className={styles.quickStarts}>
              {QUICK_MINUTES.map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  variant={minutes === settings.focus.defaultMinutes ? 'soft' : 'secondary'}
                  onClick={() => void window.nudge.focus.start(minutes, 'timer')}
                >
                  {minutes}m
                </Button>
              ))}
              {settings.focus.pomodoro.enabled && (
                <Button
                  size="sm"
                  variant="primary"
                  icon="target"
                  onClick={() => void window.nudge.focus.start(settings.focus.pomodoro.focusMinutes, 'pomodoro')}
                >
                  {t('focus.mode.pomodoro')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
