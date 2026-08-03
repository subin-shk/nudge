/**
 * One collapsible reminder configuration card.
 *
 * Every control is rendered from the reminder's *capabilities*, so a plugin that
 * declares `timedBreak: false` simply has no break-length row — there is no
 * per-kind branching anywhere in this file.
 */

import clsx from 'clsx'
import { useState, type CSSProperties } from 'react'
import type { NotificationPrefs, ReminderSchedule, ReminderSettings } from '@shared/types'
import type { DeepPartial } from '@shared/util'
import type { AppSettings } from '@shared/types'
import { LIMITS, SNOOZE_PRESETS } from '@shared/defaults'
import { formatCountdown, formatDurationShort } from '@shared/time'
import { Card, Chip, Field, NumberField, Switch, TextInput } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { NotificationPrefsEditor } from '../../components/NotificationPrefsEditor'
import type { ReminderView } from '../../hooks/useReminders'
import { usePatchSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import { ScheduleEditor } from './ScheduleEditor'
import styles from './reminders.module.css'

export function ReminderCard({ view, defaultOpen }: { view: ReminderView; defaultOpen?: boolean }): JSX.Element {
  const t = useTranslator()
  const patch = usePatchSettings()
  const [open, setOpen] = useState(defaultOpen ?? false)

  const { definition, config, runtime } = view
  const kind = definition.kind
  const capabilities = definition.capabilities

  /** Patch this reminder's settings without touching any other kind. */
  const update = (change: DeepPartial<ReminderSettings>): void => {
    void patch({ reminders: { [kind]: change } } as DeepPartial<AppSettings>)
  }

  const summary = (): string => {
    if (!config.enabled) return t('common.disabled')
    const cadence =
      config.schedule.mode === 'times'
        ? config.schedule.times.join(', ') || t('reminder.schedule.noTimes')
        : `${t('reminder.schedule.interval')} ${formatDurationShort(config.schedule.intervalMinutes * 60)}`
    const next = runtime?.secondsUntilNext != null ? ` · ${t('reminder.nextIn', { time: formatCountdown(runtime.secondsUntilNext) })}` : ''
    return `${cadence}${next}`
  }

  return (
    <Card style={{ '--card-tone': `var(--tone-${definition.tone})` } as CSSProperties}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.head}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{ background: 'none', padding: 0 }}
        >
          <span className={styles.badge} aria-hidden="true">
            {definition.emoji}
          </span>
          <span className={styles.headText}>
            <span className={styles.title}>
              {view.title}
              {definition.source === 'plugin' && <Chip tone="accent">plugin</Chip>}
            </span>
            <span className={styles.summary}>{summary()}</span>
          </span>
          <Icon name="chevronRight" size={18} className={clsx(styles.expand, open && styles.expandOpen)} />
        </button>

        <Switch
          label={view.title}
          checked={config.enabled}
          onChange={(enabled) => void window.nudge.reminders.setEnabled(kind, enabled)}
        />
      </div>

      <div className={clsx(styles.bodyWrap, open && styles.bodyWrapOpen)}>
        <div className={styles.body}>
          <div className={styles.bodyInner}>
            <ScheduleEditor
              schedule={config.schedule}
              allowTimes={capabilities.scheduledTimes}
              disabled={!config.enabled}
              onChange={(change: Partial<ReminderSchedule>) => update({ schedule: change })}
            />

            <Field label={t('reminder.customMessage')} stacked disabled={!config.enabled}>
              <TextInput
                label={t('reminder.customMessage')}
                value={config.message}
                placeholder={view.message}
                maxLength={280}
                onChange={(message) => update({ message })}
              />
            </Field>

            {capabilities.timedBreak && (
              <Field label={t('reminder.breakLength')} disabled={!config.enabled}>
                <NumberField
                  label={t('reminder.breakLength')}
                  value={config.breakSeconds}
                  min={LIMITS.breakSeconds.min}
                  max={LIMITS.breakSeconds.max}
                  step={5}
                  suffix={t('common.secondsShort')}
                  onChange={(breakSeconds) => update({ breakSeconds })}
                />
              </Field>
            )}

            {capabilities.overlay && (
              <Field label={t('reminder.useOverlay')} hint={t('reminder.useOverlay.desc')} disabled={!config.enabled}>
                <Switch
                  label={t('reminder.useOverlay')}
                  checked={config.useOverlay}
                  onChange={(useOverlay) => update({ useOverlay })}
                />
              </Field>
            )}

            {capabilities.timedBreak && (
              <>
                <Field label={t('reminder.allowSkip')} disabled={!config.enabled}>
                  <Switch
                    label={t('reminder.allowSkip')}
                    checked={config.allowSkip}
                    onChange={(allowSkip) => update({ allowSkip })}
                  />
                </Field>
                <Field label={t('reminder.autoResume')} disabled={!config.enabled}>
                  <Switch
                    label={t('reminder.autoResume')}
                    checked={config.autoResume}
                    onChange={(autoResume) => update({ autoResume })}
                  />
                </Field>
              </>
            )}

            {capabilities.snooze && (
              <Field label={t('reminder.snoozeOptions')} stacked disabled={!config.enabled}>
                <div className={styles.snoozeRow}>
                  {SNOOZE_PRESETS.map((minutes) => {
                    const selected = config.snoozeMinutes.includes(minutes)
                    return (
                      <Chip
                        key={minutes}
                        selected={selected}
                        onClick={() => {
                          const next = selected
                            ? config.snoozeMinutes.filter((value) => value !== minutes)
                            : [...config.snoozeMinutes, minutes].sort((a, b) => a - b)
                          update({ snoozeMinutes: next })
                        }}
                      >
                        {minutes} {t('common.minutesShort')}
                      </Chip>
                    )
                  })}
                </div>
              </Field>
            )}

            {capabilities.dailyGoal && (
              <Field
                label={t('reminder.dailyGoal')}
                hint={config.dailyGoal === 0 ? t('reminder.dailyGoal.off') : undefined}
                disabled={!config.enabled}
              >
                <NumberField
                  label={t('reminder.dailyGoal')}
                  value={config.dailyGoal}
                  min={LIMITS.dailyGoal.min}
                  max={LIMITS.dailyGoal.max}
                  suffix={t('common.perDay')}
                  onChange={(dailyGoal) => update({ dailyGoal })}
                />
              </Field>
            )}

            <h4 className={styles.subhead}>{t('settings.section.notifications')}</h4>
            <NotificationPrefsEditor
              prefs={config.notifications}
              disabled={!config.enabled}
              onChange={(change: Partial<NotificationPrefs>) => update({ notifications: change })}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
