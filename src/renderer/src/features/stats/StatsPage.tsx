/**
 * Statistics.
 *
 * One filter row above everything, scoping every chart on the page — never a
 * per-chart range picker. Four forms, each chosen for the job its data does:
 *
 *   totals           → stat tiles (the number *is* the chart)
 *   focus over time  → single-series columns
 *   breaks over time → stacked columns, one slot per reminder kind
 *   break mix        → horizontal bars with direct value labels
 *   consistency      → sequential heat calendar
 */

import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { DailyStats, RangeSummary } from '@shared/types'
import { addDays, formatDurationShort, fromDayKey, toDayKey, toHours } from '@shared/time'
import { listReminderDefinitions } from '@shared/reminders/catalog'
import { Card, EmptyState, StatTile } from '../../components/ui'
import { useRuntime, useSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import { resolveTheme } from '../../theme/themes'
import { getChartPalette, seriesColor } from './chartPalette'
import { ChartFrame, type ChartSeries } from './charts/ChartFrame'
import { ColumnChart, type ColumnDatum } from './charts/ColumnChart'
import { BarList } from './charts/BarList'
import { ActivityCalendar } from './charts/ActivityCalendar'
import type { TooltipState } from './charts/useChartLayout'
import shell from '../../components/shell.module.css'
import chartStyles from './charts/charts.module.css'
import styles from './stats.module.css'

const RANGES = [
  { days: 7, labelKey: 'stats.range.week' },
  { days: 30, labelKey: 'stats.range.month' },
  { days: 90, labelKey: 'stats.range.quarter' },
  { days: 365, labelKey: 'stats.range.year' }
] as const

export function StatsPage(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const runtime = useRuntime()

  const [rangeDays, setRangeDays] = useState<number>(30)
  const [summary, setSummary] = useState<RangeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [focusTooltip, setFocusTooltip] = useState<TooltipState | null>(null)
  const [breaksTooltip, setBreaksTooltip] = useState<TooltipState | null>(null)
  const [calendarTooltip, setCalendarTooltip] = useState<TooltipState | null>(null)

  const palette = useMemo(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    return getChartPalette(resolveTheme(settings.general.theme, prefersDark).scheme)
  }, [settings.general.theme])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const to = toDayKey()
    const from = addDays(to, -(rangeDays - 1))

    void window.nudge.stats.range(from, to).then((result) => {
      if (cancelled) return
      setSummary(result)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
    // `runtime.today` re-fetches when the user completes something while the
    // page is open — the range endpoints have not changed, so this is cheap.
  }, [rangeDays, runtime.today])

  const reminderSeries: ChartSeries[] = useMemo(
    () =>
      listReminderDefinitions()
        .filter((definition) => settings.reminders[definition.kind]?.enabled)
        .map((definition, _position, all) => ({
          key: definition.kind,
          label: t(definition.shortTitleKey),
          // Index is taken from the *full* catalog, not the filtered list, so
          // disabling a reminder never repaints the others.
          color: seriesColor(palette, listReminderDefinitions().indexOf(definition))
        })),
    [palette, settings.reminders, t]
  )

  const focusSeries: ChartSeries[] = useMemo(
    () => [{ key: 'focus', label: t('stats.totalFocus'), color: palette.categorical[0]! }],
    [palette, t]
  )

  const days: DailyStats[] = summary?.days ?? []

  const dayLabel = (day: string): string => {
    const date = fromDayKey(day)
    return rangeDays <= 7
      ? date.toLocaleDateString(undefined, { weekday: 'short' })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const focusData: ColumnDatum[] = days.map((day) => ({
    key: day.day,
    label: dayLabel(day.day),
    values: { focus: toHours(day.focusSeconds) }
  }))

  const breaksData: ColumnDatum[] = days.map((day) => ({
    key: day.day,
    label: dayLabel(day.day),
    values: Object.fromEntries(reminderSeries.map((entry) => [entry.key, day.completed[entry.key] ?? 0]))
  }))

  const mixItems = useMemo(
    () =>
      reminderSeries
        .map((entry) => {
          const definition = listReminderDefinitions().find((candidate) => candidate.kind === entry.key)
          return {
            key: entry.key,
            label: entry.label,
            emoji: definition?.emoji,
            value: summary?.totals.completed[entry.key] ?? 0,
            color: entry.color
          }
        })
        .filter((item) => item.value > 0)
        .sort((a, b) => b.value - a.value),
    [reminderSeries, summary]
  )

  const totals = summary?.totals
  const completedTotal = totals ? Object.values(totals.completed).reduce((sum, count) => sum + count, 0) : 0
  const skippedTotal = totals ? Object.values(totals.skipped).reduce((sum, count) => sum + count, 0) : 0
  const followThrough = completedTotal + skippedTotal > 0 ? completedTotal / (completedTotal + skippedTotal) : null

  const hasAnyData = days.some((day) => day.focusSeconds > 0 || Object.keys(day.completed).length > 0)

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={shell.pageTitle}>{t('stats.title')}</h1>
          <p className={shell.pageSubtitle}>
            {t('stats.days', { count: rangeDays })} · {t('stats.activeDays')}: {totals?.activeDays ?? 0}
          </p>
        </div>
      </header>

      {/* One filter row above everything it scopes. */}
      <div className={styles.filterRow} role="tablist" aria-label={t('stats.title')}>
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            role="tab"
            aria-selected={rangeDays === range.days}
            className={clsx(styles.filterChip, rangeDays === range.days && styles.filterChipActive)}
            onClick={() => setRangeDays(range.days)}
          >
            {t(range.labelKey)}
          </button>
        ))}
      </div>

      {/* Hold the previous render at reduced opacity on refetch — no skeleton flash. */}
      <div className={clsx(styles.body, loading && summary && styles.refetching)}>
        <div className={styles.tileGrid}>
          <StatTile
            label={t('stats.totalFocus')}
            icon="timer"
            tone="focus"
            value={toHours(totals?.focusSeconds ?? 0)}
            unit={t('stats.hoursUnit')}
            footer={formatDurationShort(totals?.focusSeconds ?? 0)}
          />
          <StatTile label={t('stats.eyeBreaks')} icon="eye" tone="eye" value={totals?.completed.eyeCare ?? 0} />
          <StatTile label={t('stats.waterLogged')} icon="droplet" tone="water" value={totals?.completed.water ?? 0} />
          <StatTile
            label={t('stats.dayStreak')}
            icon="flame"
            tone="move"
            value={runtime.streak.current}
            footer={`${t('stats.bestStreak')}: ${runtime.streak.best}`}
          />
          <StatTile
            label={t('stats.completionRate')}
            icon="target"
            tone="neutral"
            value={followThrough === null ? '—' : `${Math.round(followThrough * 100)}%`}
            footer={t('stats.completionRate.desc')}
          />
          <StatTile
            label={t('stats.weekStreak')}
            icon="calendar"
            tone="neutral"
            value={runtime.streak.currentWeeks}
            footer={t('stats.weeks', { count: runtime.streak.currentWeeks })}
          />
        </div>

        {!hasAnyData && !loading ? (
          <Card>
            <EmptyState icon="chart" title={t('stats.emptyRange')} body={t('stats.empty')} />
          </Card>
        ) : (
          <>
            <Card>
              <ChartFrame
                title={t('stats.focusByDay')}
                subtitle={t('stats.hoursUnit')}
                tooltip={focusTooltip}
                table={
                  <table className={chartStyles.table}>
                    <thead>
                      <tr>
                        <th>{t('common.today')}</th>
                        <th>{t('stats.totalFocus')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day) => (
                        <tr key={day.day}>
                          <td>{day.day}</td>
                          <td>{formatDurationShort(day.focusSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <ColumnChart
                  data={focusData}
                  series={focusSeries}
                  formatValue={(value) => `${value}`}
                  onTooltip={setFocusTooltip}
                />
              </ChartFrame>
            </Card>

            <div className={styles.chartGrid}>
              <Card>
                <ChartFrame
                  title={t('stats.remindersByDay')}
                  series={reminderSeries}
                  tooltip={breaksTooltip}
                  table={
                    <table className={chartStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('common.today')}</th>
                          {reminderSeries.map((entry) => (
                            <th key={entry.key}>
                              <span className={chartStyles.tableSwatch} style={{ background: entry.color }} />
                              {entry.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((day) => (
                          <tr key={day.day}>
                            <td>{day.day}</td>
                            {reminderSeries.map((entry) => (
                              <td key={entry.key}>{day.completed[entry.key] ?? 0}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                >
                  <ColumnChart
                    data={breaksData}
                    series={reminderSeries}
                    formatValue={(value) => `${Math.round(value)}`}
                    onTooltip={setBreaksTooltip}
                  />
                </ChartFrame>
              </Card>

              <Card>
                <ChartFrame
                  title={t('stats.splitByKind')}
                  table={
                    <table className={chartStyles.table}>
                      <thead>
                        <tr>
                          <th>{t('nav.reminders')}</th>
                          <th>{t('common.done')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mixItems.map((item) => (
                          <tr key={item.key}>
                            <td>
                              <span className={chartStyles.tableSwatch} style={{ background: item.color }} />
                              {item.label}
                            </td>
                            <td>{item.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                >
                  {mixItems.length === 0 ? (
                    <EmptyState icon="bell" title={t('stats.emptyRange')} />
                  ) : (
                    <BarList items={mixItems} formatValue={(value) => `${value}`} />
                  )}
                </ChartFrame>
              </Card>
            </div>

            <Card>
              <ChartFrame
                title={t('stats.calendar')}
                subtitle={summary ? `${summary.from} → ${summary.to}` : undefined}
                tooltip={calendarTooltip}
                table={
                  <table className={chartStyles.table}>
                    <thead>
                      <tr>
                        <th>{t('common.today')}</th>
                        <th>{t('stats.totalFocus')}</th>
                        <th>{t('stats.remindersByDay')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((day) => (
                        <tr key={day.day}>
                          <td>{day.day}</td>
                          <td>{formatDurationShort(day.focusSeconds)}</td>
                          <td>{Object.values(day.completed).reduce((sum, count) => sum + count, 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              >
                <ActivityCalendar
                  days={days}
                  palette={palette}
                  valueOf={(day) =>
                    Object.values(day.completed).reduce((sum, count) => sum + count, 0) + Math.round(day.focusSeconds / 900)
                  }
                  formatValue={(value) => `${value}`}
                  labels={{ less: t('common.none'), more: t('stats.calendar') }}
                  onTooltip={setCalendarTooltip}
                />
              </ChartFrame>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
