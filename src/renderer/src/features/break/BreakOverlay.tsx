/**
 * The full-screen break overlay.
 *
 * Design intent: this is the most interruptive surface in the app, so it has to
 * earn the interruption. It is calm rather than alarming — a soft scrim, one
 * large breathing ring, one sentence, and the two escape hatches (skip, snooze)
 * clearly available rather than hidden.
 *
 * One overlay is created per display. The non-primary ones render the same thing
 * at reduced emphasis, because a break that only dims one monitor is not a break.
 */

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { ActiveBreak, AppSettings } from '@shared/types'
import { createTranslator } from '@shared/i18n'
import { getReminderDefinition } from '@shared/reminders/catalog'
import { applyTheme } from '../../theme/ThemeProvider'
import { resolveTheme } from '../../theme/themes'
import { MascotCharacter } from '../mascot/MascotCharacter'
import { getSkin } from '../mascot/skins'
import styles from './break.module.css'

/** Read once from the URL — the main process tags each overlay window. */
const params = new URLSearchParams(window.location.search)
const IS_PRIMARY = params.get('primary') !== '0'

export function BreakOverlay(): JSX.Element | null {
  const [active, setActive] = useState<ActiveBreak | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    const applyFrom = (next: AppSettings): void => {
      if (cancelled) return
      setSettings(next)
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      applyTheme(resolveTheme(next.general.theme, prefersDark), next.general.accentOverride)
      document.documentElement.dataset.reducedMotion = String(next.general.reducedMotion)
    }

    void window.nudge.settings.get().then(applyFrom)
    const unsubscribe = window.nudge.on.settings(applyFrom)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return window.nudge.on.breakUpdate((next) => {
      if (next === null) {
        // Play the exit animation before the window is destroyed (main gives
        // us ~260ms of grace for exactly this).
        setLeaving(true)
        return
      }
      setLeaving(false)
      setActive(next)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!active) return
      if (event.key === 'Escape' && active.allowSkip) {
        void window.nudge.reminders.skip(active.kind)
      }
      if (event.key === 'Enter') {
        void window.nudge.reminders.complete(active.kind)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

  if (!active || !settings) return null

  const t = createTranslator(settings.general.locale)
  const definition = getReminderDefinition(active.kind)
  const progress = active.totalSeconds > 0 ? 1 - active.remainingSeconds / active.totalSeconds : 0
  const finished = active.remainingSeconds <= 0

  // Ring geometry: a large stroke reads as "breathing" rather than "loading".
  const size = IS_PRIMARY ? 300 : 200
  const thickness = IS_PRIMARY ? 8 : 6
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div className={clsx(styles.root, leaving && styles.leaving, !IS_PRIMARY && styles.secondary)}>
      <div className={styles.content}>
        {IS_PRIMARY && settings.mascot.enabled && (
          <div className={styles.mascot}>
            <MascotCharacter
              skin={getSkin(settings.mascot.skin)}
              size={104}
              animation={finished ? 'celebrate' : active.kind === 'water' ? 'drink' : 'idle'}
              blinking={false}
              facing={1}
            />
          </div>
        )}

        <div className={styles.ringWrap}>
          <svg width={size} height={size} className={styles.ring} aria-hidden="true">
            <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={radius} strokeWidth={thickness} fill="none" />
            <circle
              className={styles.ringFill}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={thickness}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ stroke: `var(--tone-${definition?.tone ?? 'neutral'})` }}
            />
          </svg>
          <div className={styles.ringInner}>
            <span className={styles.seconds}>{finished ? '✓' : active.remainingSeconds}</span>
            {!finished && <span className={styles.secondsUnit}>{t('common.secondsShort')}</span>}
          </div>
        </div>

        <div className={styles.copy}>
          <div className={styles.emoji}>{definition?.emoji ?? '🔔'}</div>
          <h1 className={styles.message}>{finished ? t('break.finished') : active.message}</h1>
          {finished && <p className={styles.sub}>{t('break.finishedBody')}</p>}
        </div>

        {IS_PRIMARY && (
          <>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={() => void window.nudge.reminders.complete(active.kind)}>
                {finished ? t('common.done') : t('break.imDone')}
              </button>

              {active.snoozeMinutes.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={styles.secondaryAction}
                  onClick={() => void window.nudge.reminders.snooze(active.kind, minutes)}
                >
                  {t('break.snoozeFor', { minutes })}
                </button>
              ))}

              {active.allowSkip && (
                <button
                  type="button"
                  className={styles.ghostAction}
                  onClick={() => void window.nudge.reminders.skip(active.kind)}
                >
                  {t('common.skip')}
                </button>
              )}
            </div>

            {active.allowSkip && <p className={styles.hint}>{t('break.pressEsc')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
