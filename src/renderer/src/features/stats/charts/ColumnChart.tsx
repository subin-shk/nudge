/**
 * Column chart — single-series or stacked.
 *
 * Follows the app's mark specs exactly:
 *   • columns capped at 24px and occupying 62% of their band (the rest is air),
 *   • a 4px rounded cap with a square baseline,
 *   • a 2px surface-coloured gap between stacked segments — never a stroke,
 *   • hairline solid gridlines one step off the surface,
 *   • one y-axis, always. Two measures never share a plot.
 *
 * The hover target is the full-height band, not the column, so a 3px-tall bar is
 * as easy to hit as a full one.
 */

import { useMemo, useState } from 'react'
import { MARK, barPath, niceScale, useElementWidth, useTooltip, type TooltipState } from './useChartLayout'
import type { ChartSeries } from './ChartFrame'
import styles from './charts.module.css'

export interface ColumnDatum {
  /** X-axis category key, e.g. a day key. */
  key: string
  label: string
  /** Series key → value. */
  values: Record<string, number>
}

export interface ColumnChartProps {
  data: ColumnDatum[]
  series: ChartSeries[]
  height?: number
  /** Formats the y-axis ticks and tooltip values. */
  formatValue: (value: number) => string
  /** Called with tooltip state so the frame can render it. */
  onTooltip?: (state: TooltipState | null) => void
}

const PADDING = { top: 12, right: 8, bottom: 26, left: 44 }

export function ColumnChart({ data, series, height = 220, formatValue, onTooltip }: ColumnChartProps): JSX.Element {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const { show, hide } = useTooltip()

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right)
  const plotHeight = Math.max(0, height - PADDING.top - PADDING.bottom)

  const { max, ticks } = useMemo(() => {
    let peak = 0
    for (const datum of data) {
      let total = 0
      for (const entry of series) total += datum.values[entry.key] ?? 0
      if (total > peak) peak = total
    }
    return niceScale(peak)
  }, [data, series])

  const bandWidth = data.length > 0 ? plotWidth / data.length : 0
  const barWidth = Math.min(MARK.maxBarThickness, bandWidth * MARK.bandFill)

  // Thin out x labels until they stop colliding; ~54px is comfortable for a
  // 'Mon 12' style label at 11px.
  const labelStride = Math.max(1, Math.ceil((data.length * 54) / Math.max(plotWidth, 1)))

  const emit = (state: TooltipState | null): void => {
    if (state) show(state)
    else hide()
    onTooltip?.(state)
  }

  return (
    <div ref={ref} className={styles.plot} style={{ height }}>
      {width > 0 && (
        <svg className={styles.svg} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
          {/* --- gridlines + y ticks --- */}
          {ticks.map((tick) => {
            const y = PADDING.top + plotHeight - (tick / max) * plotHeight
            return (
              <g key={tick}>
                <line className={styles.gridLine} x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} />
                <text className={styles.axisLabel} x={PADDING.left - 8} y={y + 4} textAnchor="end">
                  {formatValue(tick)}
                </text>
              </g>
            )
          })}

          {/* --- baseline --- */}
          <line
            className={styles.axisLine}
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={PADDING.top + plotHeight}
            y2={PADDING.top + plotHeight}
          />

          {/* --- columns --- */}
          {data.map((datum, index) => {
            const bandX = PADDING.left + index * bandWidth
            const barX = bandX + (bandWidth - barWidth) / 2

            // Stack from the baseline upwards.
            let cursor = PADDING.top + plotHeight
            const segments = series
              .map((entry) => {
                const value = datum.values[entry.key] ?? 0
                if (value <= 0) return null
                const rawHeight = (value / max) * plotHeight
                const top = cursor - rawHeight
                cursor = top
                return { entry, value, top, rawHeight }
              })
              .filter((segment): segment is NonNullable<typeof segment> => segment !== null)

            return (
              <g key={datum.key}>
                <rect
                  className={`${styles.bandHighlight} ${activeIndex === index ? styles.bandHighlightActive : ''}`}
                  x={bandX}
                  y={PADDING.top}
                  width={bandWidth}
                  height={plotHeight}
                  rx={4}
                />

                {segments.map((segment, segmentIndex) => {
                  const isTop = segmentIndex === segments.length - 1
                  // The 2px separator is taken off the top of every segment that
                  // has another one above it — white doing the separating.
                  const gap = isTop ? 0 : MARK.surfaceGap
                  const drawHeight = Math.max(0, segment.rawHeight - gap)
                  if (drawHeight <= 0) return null

                  return (
                    <path
                      key={segment.entry.key}
                      d={barPath(barX, segment.top + gap, barWidth, drawHeight, isTop ? MARK.cornerRadius : 0)}
                      fill={segment.entry.color}
                    />
                  )
                })}

                {/* Full-height hit band: a generous target regardless of value. */}
                <rect
                  className={styles.hit}
                  x={bandX}
                  y={PADDING.top}
                  width={Math.max(bandWidth, MARK.minHitSize)}
                  height={plotHeight}
                  tabIndex={0}
                  role="button"
                  aria-label={`${datum.label}: ${series
                    .map((entry) => `${entry.label} ${formatValue(datum.values[entry.key] ?? 0)}`)
                    .join(', ')}`}
                  onMouseEnter={() => {
                    setActiveIndex(index)
                    emit({
                      x: bandX + bandWidth / 2,
                      y: PADDING.top - 6,
                      title: datum.label,
                      rows: series
                        .filter((entry) => (datum.values[entry.key] ?? 0) > 0)
                        .map((entry) => ({
                          label: entry.label,
                          value: formatValue(datum.values[entry.key] ?? 0),
                          color: entry.color
                        }))
                    })
                  }}
                  onFocus={() => setActiveIndex(index)}
                  onMouseLeave={() => {
                    setActiveIndex(null)
                    emit(null)
                  }}
                  onBlur={() => setActiveIndex(null)}
                />
              </g>
            )
          })}

          {/* --- x labels --- */}
          {data.map((datum, index) =>
            index % labelStride === 0 ? (
              <text
                key={`label-${datum.key}`}
                className={styles.axisLabel}
                x={PADDING.left + index * bandWidth + bandWidth / 2}
                y={height - 8}
                textAnchor="middle"
              >
                {datum.label}
              </text>
            ) : null
          )}
        </svg>
      )}
    </div>
  )
}
