/**
 * Schedule editor: "every N minutes" or "at these times of day".
 *
 * Interval entry is split into hours + minutes rather than one large minute
 * field, because "every 90 minutes" is how the setting is stored but "1 h 30 m"
 * is how people think about it.
 */

import { useState } from 'react'
import type { ReminderSchedule, ScheduleMode } from '@shared/types'
import { LIMITS } from '@shared/defaults'
import { parseHM } from '@shared/time'
import { Button, Field, NumberField, SegmentedControl, TimeField } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useTranslator } from '../../i18n/useTranslator'
import styles from './reminders.module.css'

export interface ScheduleEditorProps {
  schedule: ReminderSchedule
  /** False for reminders whose cadence only makes sense as an interval. */
  allowTimes: boolean
  onChange: (patch: Partial<ReminderSchedule>) => void
  disabled?: boolean
}

export function ScheduleEditor({ schedule, allowTimes, onChange, disabled }: ScheduleEditorProps): JSX.Element {
  const t = useTranslator()
  const [draftTime, setDraftTime] = useState('09:00')

  const hours = Math.floor(schedule.intervalMinutes / 60)
  const minutes = schedule.intervalMinutes % 60

  const setInterval = (nextHours: number, nextMinutes: number): void => {
    // Never allow zero — a 0-minute interval would fire every tick.
    const total = Math.max(LIMITS.reminderIntervalMinutes.min, nextHours * 60 + nextMinutes)
    onChange({ intervalMinutes: total })
  }

  const addTime = (): void => {
    if (!parseHM(draftTime)) return
    if (schedule.times.includes(draftTime)) return
    onChange({ times: [...schedule.times, draftTime].sort() })
  }

  const removeTime = (value: string): void => {
    onChange({ times: schedule.times.filter((time) => time !== value) })
  }

  return (
    <>
      {allowTimes && (
        <Field label={t('reminder.schedule.mode')} disabled={disabled}>
          <SegmentedControl<ScheduleMode>
            label={t('reminder.schedule.mode')}
            value={schedule.mode}
            onChange={(mode) => onChange({ mode })}
            options={[
              { value: 'interval', label: t('reminder.schedule.interval') },
              { value: 'times', label: t('reminder.schedule.times') }
            ]}
          />
        </Field>
      )}

      {schedule.mode === 'interval' ? (
        <Field label={t('reminder.schedule.interval')} disabled={disabled}>
          <NumberField
            label={t('common.hours')}
            value={hours}
            min={0}
            max={23}
            suffix={t('common.hoursShort')}
            onChange={(value) => setInterval(value, minutes)}
          />
          <NumberField
            label={t('common.minutes')}
            value={minutes}
            min={0}
            max={59}
            suffix={t('common.minutesShort')}
            onChange={(value) => setInterval(hours, value)}
          />
        </Field>
      ) : (
        <Field
          label={t('reminder.schedule.times')}
          hint={schedule.times.length === 0 ? t('reminder.schedule.noTimes') : undefined}
          stacked
          disabled={disabled}
        >
          <div className={styles.timeList}>
            {schedule.times.map((time) => (
              <span key={time} className={styles.timePill}>
                {time}
                <button
                  type="button"
                  className={styles.timePillRemove}
                  aria-label={`${t('common.remove')} ${time}`}
                  onClick={() => removeTime(time)}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
            <TimeField label={t('reminder.schedule.addTime')} value={draftTime} onChange={setDraftTime} />
            <Button size="sm" icon="plus" onClick={addTime}>
              {t('common.add')}
            </Button>
          </div>
        </Field>
      )}
    </>
  )
}
