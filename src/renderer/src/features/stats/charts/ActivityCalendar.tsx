/**
 * Activity calendar — a sequential heat grid, one cell per day.
 *
 * Sequential encoding rules: one hue, light→dark, with the anchor flipped in dark
 * mode so "nothing happened" always recedes toward the surface rather than
 * standing out as a bright block. A scale legend is always shown, because a
 * continuous colour encoding is unreadable without one.
 */

import { useMemo, useState } from 'react'
import type { DailyStats } from '@shared/types'
import { fromDayKey } from '@shared/time'
import type { ChartPalette } from '../chartPalette'
import { sequentialStep } from '../chartPalette'
import type { TooltipState } from './useChartLayout'
import styles from './charts.module.css'

export interface ActivityCalendarProps {
  days: DailyStats[]
  palette: ChartPalette
  /** The scalar each cell encodes. */
  valueOf: (day: DailyStats) => number
  formatValue: (value: number) => string
  labels: { less: string; more: string }
  onTooltip?: (state: TooltipState | null) => void
}

const CELL = 14
const GAP = 3
const WEEKDAY_LABELS = ['M', '', 'W', '', 'F', '', '']

export function ActivityCalendar({ days, palette, valueOf, formatValue, labels, onTooltip }: ActivityCalendarProps): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null)

  const { weeks, max, monthMarkers } = useMemo(() => {
    if (days.length === 0) return { weeks: [] as Array<Array<DailyStats | null>>, max: 0, monthMarkers: [] as Array<{ label: string; column: number }> }

    let peak = 0
    for (const day of days) peak = Math.max(peak, valueOf(day))

    // Pad the first week so every column starts on Monday.
    const first = fromDayKey(days[0]!.day)
    const leadingBlanks = (first.getDay() + 6) % 7

    const cells: Array<DailyStats | null> = [...Array<null>(leadingBlanks).fill(null), ...days]
    const grouped: Array<Array<DailyStats | null>> = []
    for (let index = 0; index < cells.length; index += 7) {
      grouped.push(cells.slice(index, index + 7))
    }

    // One label per month, positioned at the column where that month begins.
    const markers: Array<{ label: string; column: number }> = []
    let lastMonth = -1
    grouped.forEach((week, column) => {
      const firstReal = week.find((cell): cell is DailyStats => cell !== null)
      if (!firstReal) return
      const date = fromDayKey(firstReal.day)
      if (date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth()
        markers.push({ label: date.toLocaleDateString(undefined, { month: 'short' }), column })
      }
    })

    return { weeks: grouped, max: peak, monthMarkers: markers }
  }, [days, valueOf])

  return (
    <div>
      <div className={styles.calendar}>
        <div className={styles.calendarWeekdays} aria-hidden="true">
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={index} className={styles.calendarWeekday}>
              {label}
            </span>
          ))}
        </div>

        <div className={styles.calendarBody}>
          <div className={styles.calendarMonths} aria-hidden="true">
            {monthMarkers.map((marker) => (
              <span key={`${marker.label}-${marker.column}`} className={styles.calendarMonthLabel} style={{ left: marker.column * (CELL + GAP) }}>
                {marker.label}
              </span>
            ))}
          </div>

          <div className={styles.calendarGrid}>
            {weeks.map((week, weekIndex) =>
              week.map((day, dayIndex) => {
                if (!day) return <span key={`blank-${weekIndex}-${dayIndex}`} style={{ visibility: 'hidden' }} className={styles.calendarCell} />

                const value = valueOf(day)
                const fill = sequentialStep(palette, value, max)
                const date = fromDayKey(day.day)

                return (
                  <span
                    key={day.day}
                    className={styles.calendarCell}
                    style={fill ? { background: fill } : undefined}
                    tabIndex={0}
                    role="button"
                    aria-label={`${date.toLocaleDateString()}: ${formatValue(value)}`}
                    onMouseEnter={(event) => {
                      setHovered(day.day)
                      const rect = event.currentTarget.getBoundingClientRect()
                      const parent = event.currentTarget.closest(`.${styles.calendar}`)?.getBoundingClientRect()
                      onTooltip?.({
                        x: rect.left - (parent?.left ?? 0) + CELL / 2,
                        y: rect.top - (parent?.top ?? 0) - 6,
                        title: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                        rows: [{ label: labels.more, value: formatValue(value) }]
                      })
                    }}
                    onMouseLeave={() => {
                      setHovered(null)
                      onTooltip?.(null)
                    }}
                    data-active={hovered === day.day}
                  />
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className={styles.calendarScale}>
        {labels.less}
        <span className={styles.calendarScaleSteps}>
          <span className={styles.calendarScaleStep} style={{ background: 'var(--bg-inset)' }} />
          {palette.sequential.map((step) => (
            <span key={step} className={styles.calendarScaleStep} style={{ background: step }} />
          ))}
        </span>
        {labels.more}
      </div>
    </div>
  )
}
