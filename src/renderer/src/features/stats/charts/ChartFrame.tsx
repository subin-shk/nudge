/**
 * The frame every chart sits in: title, legend, table-view toggle, tooltip host.
 *
 * The table toggle is not a nicety — it is the required accessible twin. Three
 * light-mode palette slots sit below 3:1 contrast, which obligates a relief
 * channel; direct labels cover it on the bar list, and this table covers it
 * everywhere else. It is also how a screen-reader user reads the data at all.
 */

import type { ReactNode } from 'react'
import { useState } from 'react'
import { IconButton } from '../../../components/ui'
import { useTranslator } from '../../../i18n/useTranslator'
import type { TooltipState } from './useChartLayout'
import styles from './charts.module.css'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface ChartFrameProps {
  title: string
  subtitle?: string
  /** Omitted for single-series charts — the title already names the data. */
  series?: ChartSeries[]
  children: ReactNode
  /** The accessible twin. Rendered in place of the plot when toggled. */
  table: ReactNode
  tooltip?: TooltipState | null
}

export function ChartFrame({ title, subtitle, series, children, table, tooltip }: ChartFrameProps): JSX.Element {
  const t = useTranslator()
  const [showTable, setShowTable] = useState(false)

  return (
    <div className={styles.frame}>
      <header className={styles.frameHead}>
        <div>
          <div className={styles.frameTitle}>{title}</div>
          {subtitle && <div className={styles.frameSubtitle}>{subtitle}</div>}
        </div>
        <div className={styles.frameActions}>
          <IconButton
            icon={showTable ? 'chart' : 'keyboard'}
            label={showTable ? t('nav.stats') : t('stats.calendar')}
            active={showTable}
            onClick={() => setShowTable((value) => !value)}
          />
        </div>
      </header>

      {/* A legend is always present for two or more series. */}
      {series && series.length > 1 && !showTable && (
        <div className={styles.legend}>
          {series.map((entry) => (
            <span key={entry.key} className={styles.legendItem}>
              <span className={styles.legendSwatch} style={{ background: entry.color }} />
              {entry.label}
            </span>
          ))}
        </div>
      )}

      {showTable ? (
        <div className={styles.tableScroll}>{table}</div>
      ) : (
        <div className={styles.plot}>
          {children}
          {tooltip && (
            <div className={styles.tooltip} style={{ left: tooltip.x, top: tooltip.y }} role="status">
              <div className={styles.tooltipTitle}>{tooltip.title}</div>
              {tooltip.rows.map((row) => (
                <div key={row.label} className={styles.tooltipRow}>
                  {row.color && <span className={styles.tooltipDot} style={{ background: row.color }} />}
                  {row.label}
                  <span className={styles.tooltipValue}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
