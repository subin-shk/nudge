/**
 * The full focus timer screen.
 *
 * Three states, one layout: idle (pick a length), running/paused (the ring), and
 * finished (a moment of acknowledgement before it resets). Pomodoro settings sit
 * alongside rather than on a separate screen, because the decision to use
 * Pomodoro is made *while* looking at the timer.
 */

import { useState } from 'react'
import { LIMITS } from '@shared/defaults'
import { formatClock, formatDurationShort } from '@shared/time'
import { Button, Card, CardHeader, Field, NumberField, ProgressRing, SegmentedControl, Switch } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useFocusRuntime, usePatchSettings, useSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import shell from '../../components/shell.module.css'
import styles from './focus.module.css'

const PRESETS = [10, 15, 25, 30, 45, 60, 90]

function CycleDots({ done, total }: { done: number; total: number }): JSX.Element {
  return (
    <div className={styles.cycleDots} aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < done ? `${styles.cycleDot} ${styles.cycleDotDone}` : styles.cycleDot} />
      ))}
    </div>
  )
}

function PomodoroSettingsCard(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()
  const pomodoro = settings.focus.pomodoro

  return (
    <Card>
      <CardHeader title={t('focus.pomodoro.settings')} icon="target" />

      <Field label={t('focus.mode.pomodoro')}>
        <Switch
          label={t('focus.mode.pomodoro')}
          checked={pomodoro.enabled}
          onChange={(enabled) => void patch({ focus: { pomodoro: { enabled } } })}
        />
      </Field>

      <Field label={t('focus.pomodoro.focusLength')} disabled={!pomodoro.enabled}>
        <NumberField
          label={t('focus.pomodoro.focusLength')}
          value={pomodoro.focusMinutes}
          min={LIMITS.pomodoroFocusMinutes.min}
          max={LIMITS.pomodoroFocusMinutes.max}
          suffix={t('common.minutesShort')}
          onChange={(focusMinutes) => void patch({ focus: { pomodoro: { focusMinutes } } })}
        />
      </Field>

      <Field label={t('focus.pomodoro.shortBreak')} disabled={!pomodoro.enabled}>
        <NumberField
          label={t('focus.pomodoro.shortBreak')}
          value={pomodoro.shortBreakMinutes}
          min={LIMITS.pomodoroBreakMinutes.min}
          max={LIMITS.pomodoroBreakMinutes.max}
          suffix={t('common.minutesShort')}
          onChange={(shortBreakMinutes) => void patch({ focus: { pomodoro: { shortBreakMinutes } } })}
        />
      </Field>

      <Field label={t('focus.pomodoro.longBreak')} disabled={!pomodoro.enabled}>
        <NumberField
          label={t('focus.pomodoro.longBreak')}
          value={pomodoro.longBreakMinutes}
          min={LIMITS.pomodoroBreakMinutes.min}
          max={LIMITS.pomodoroBreakMinutes.max}
          suffix={t('common.minutesShort')}
          onChange={(longBreakMinutes) => void patch({ focus: { pomodoro: { longBreakMinutes } } })}
        />
      </Field>

      <Field label={t('focus.pomodoro.longBreakEvery')} disabled={!pomodoro.enabled}>
        <NumberField
          label={t('focus.pomodoro.longBreakEvery')}
          value={pomodoro.longBreakEvery}
          min={LIMITS.longBreakEvery.min}
          max={LIMITS.longBreakEvery.max}
          onChange={(longBreakEvery) => void patch({ focus: { pomodoro: { longBreakEvery } } })}
        />
      </Field>

      <Field label={t('focus.pomodoro.autoStart')} disabled={!pomodoro.enabled}>
        <Switch
          label={t('focus.pomodoro.autoStart')}
          checked={pomodoro.autoStartNext}
          onChange={(autoStartNext) => void patch({ focus: { pomodoro: { autoStartNext } } })}
        />
      </Field>
    </Card>
  )
}

function BehaviourCard(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()

  return (
    <Card>
      <CardHeader title={t('settings.section.focus')} icon="settings" />

      <Field label={t('focus.pauseReminders')} hint={t('reminder.pausedBecause.focus')}>
        <Switch
          label={t('focus.pauseReminders')}
          checked={settings.focus.pauseRemindersDuringFocus}
          onChange={(pauseRemindersDuringFocus) => void patch({ focus: { pauseRemindersDuringFocus } })}
        />
      </Field>

      <Field label={t('focus.preventSleep')}>
        <Switch
          label={t('focus.preventSleep')}
          checked={settings.focus.preventSleep}
          onChange={(preventSleep) => void patch({ focus: { preventSleep } })}
        />
      </Field>

      <Field label={t('focus.customLength')} hint={t('focus.quickStart')}>
        <NumberField
          label={t('focus.customLength')}
          value={settings.focus.defaultMinutes}
          min={LIMITS.focusMinutes.min}
          max={LIMITS.focusMinutes.max}
          suffix={t('common.minutesShort')}
          onChange={(defaultMinutes) => void patch({ focus: { defaultMinutes } })}
        />
      </Field>
    </Card>
  )
}

export function FocusPage(): JSX.Element {
  const t = useTranslator()
  const focus = useFocusRuntime()
  const settings = useSettings()
  const [mode, setMode] = useState<'timer' | 'pomodoro'>(settings.focus.pomodoro.enabled ? 'pomodoro' : 'timer')
  const [customMinutes, setCustomMinutes] = useState(settings.focus.defaultMinutes)

  const running = focus.status === 'running'
  const paused = focus.status === 'paused'
  const finished = focus.status === 'finished'
  const active = running || paused
  const progress = focus.totalSeconds > 0 ? 1 - focus.remainingSeconds / focus.totalSeconds : 0

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={shell.pageTitle}>{t('focus.title')}</h1>
          <p className={shell.pageSubtitle}>
            {t('dashboard.focusToday')}: {formatDurationShort(focus.todayFocusSeconds)}
          </p>
        </div>
        {!active && !finished && (
          <SegmentedControl
            label={t('focus.title')}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'timer', label: t('focus.mode.timer') },
              { value: 'pomodoro', label: t('focus.mode.pomodoro') }
            ]}
          />
        )}
      </header>

      <Card>
        <div className={styles.stage}>
          {finished ? (
            <div className={styles.finished}>
              <div className={styles.finishedIcon}>
                <Icon name="check" size={30} />
              </div>
              <h2 style={{ fontSize: 'var(--text-xl)' }}>{t('focus.finished')}</h2>
              <p style={{ color: 'var(--text-muted)' }}>
                {t('focus.finishedBody', { duration: formatDurationShort(focus.todayFocusSeconds) })}
              </p>
              <Button
                variant="primary"
                icon="play"
                onClick={() => void window.nudge.focus.start(customMinutes, mode)}
              >
                {t('common.start')}
              </Button>
            </div>
          ) : active ? (
            <>
              <ProgressRing
                progress={progress}
                size={280}
                thickness={14}
                colorVar={focus.phase === 'focus' ? '--tone-focus' : '--tone-move'}
              >
                <span className={styles.time}>{formatClock(focus.remainingSeconds)}</span>
                <span className={styles.phase}>
                  <Icon name={paused ? 'pause' : 'play'} size={12} />
                  {t(`focus.phase.${focus.phase}`)}
                </span>
                {focus.mode === 'pomodoro' && (
                  <CycleDots done={focus.pomodoroCount % settings.focus.pomodoro.longBreakEvery} total={settings.focus.pomodoro.longBreakEvery} />
                )}
              </ProgressRing>

              <div className={styles.actions}>
                {running ? (
                  <Button size="lg" icon="pause" onClick={() => void window.nudge.focus.pause()}>
                    {t('common.pause')}
                  </Button>
                ) : (
                  <Button size="lg" variant="primary" icon="play" onClick={() => void window.nudge.focus.resume()}>
                    {t('common.resume')}
                  </Button>
                )}
                <Button size="lg" icon="plus" onClick={() => void window.nudge.focus.extend(5)}>
                  {t('focus.extend', { minutes: 5 })}
                </Button>
                {focus.mode === 'pomodoro' && (
                  <Button size="lg" icon="skip" onClick={() => void window.nudge.focus.skipPhase()}>
                    {t('focus.skipPhase')}
                  </Button>
                )}
                <Button size="lg" variant="ghost" icon="stop" onClick={() => void window.nudge.focus.stop()}>
                  {t('common.stop')}
                </Button>
              </div>
            </>
          ) : (
            <div className={styles.setup}>
              <ProgressRing progress={0} size={240} thickness={13} instant>
                <span className={styles.time}>
                  {formatClock((mode === 'pomodoro' ? settings.focus.pomodoro.focusMinutes : customMinutes) * 60)}
                </span>
                <span className={styles.phase}>
                  {mode === 'pomodoro' ? t('focus.phase.focus') : t('focus.mode.timer')}
                </span>
              </ProgressRing>

              {mode === 'timer' && (
                <>
                  <div className={styles.presetRow}>
                    {PRESETS.map((minutes) => (
                      <Button
                        key={minutes}
                        variant={minutes === customMinutes ? 'soft' : 'secondary'}
                        onClick={() => setCustomMinutes(minutes)}
                      >
                        {minutes}m
                      </Button>
                    ))}
                  </div>

                  <div className={styles.customRow}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                      {t('focus.customLength')}
                    </span>
                    <NumberField
                      label={t('focus.customLength')}
                      value={customMinutes}
                      min={LIMITS.focusMinutes.min}
                      max={LIMITS.focusMinutes.max}
                      suffix={t('common.minutesShort')}
                      onChange={setCustomMinutes}
                    />
                  </div>
                </>
              )}

              <Button
                size="lg"
                variant="primary"
                icon="play"
                fullWidth
                onClick={() =>
                  void window.nudge.focus.start(mode === 'pomodoro' ? settings.focus.pomodoro.focusMinutes : customMinutes, mode)
                }
              >
                {t('common.start')}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className={styles.sideGrid}>
        <PomodoroSettingsCard />
        <BehaviourCard />
      </div>
    </>
  )
}
