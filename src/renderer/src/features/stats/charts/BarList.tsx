/**
 * Horizontal bar list — "where your breaks go".
 *
 * Each row is a different entity, so each keeps the colour it has everywhere
 * else in the app (colour follows the entity, never its rank in this list).
 * Values are direct-labelled at the tip, which is also the relief channel the
 * palette's light-mode contrast warning requires.
 */

import { barPathHorizontal, MARK } from './useChartLayout'
import styles from './charts.module.css'

export interface BarListItem {
  key: string
  label: string
  value: number
  color: string
  /** Optional emoji rendered before the label. */
  emoji?: string
}

export interface BarListProps {
  items: BarListItem[]
  formatValue: (value: number) => string
}

const TRACK_HEIGHT = 14

export function BarList({ items, formatValue }: BarListProps): JSX.Element {
  const max = items.reduce((peak, item) => Math.max(peak, item.value), 0)

  return (
    <div className={styles.barList}>
      {items.map((item) => {
        // Percentages are fine here: the bar scales with its container and the
        // rounded end is drawn in a fixed-height, 100%-wide SVG.
        const ratio = max > 0 ? item.value / max : 0

        return (
          <div key={item.key} className={styles.barRow}>
            <span className={styles.barLabel} title={item.label}>
              <span className={styles.legendSwatch} style={{ background: item.color }} />
              {item.emoji} {item.label}
            </span>

            <svg
              className={styles.svg}
              height={TRACK_HEIGHT}
              viewBox={`0 0 100 ${TRACK_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${item.label}: ${formatValue(item.value)}`}
            >
              {/* Radius is expressed in viewBox units; with preserveAspectRatio
                  off, a uniform corner would stretch — so the cap is kept small
                  and the track short enough that the distortion is invisible. */}
              <path d={barPathHorizontal(0, 0, Math.max(ratio * 100, 0), TRACK_HEIGHT, MARK.cornerRadius / 4)} fill={item.color} />
            </svg>

            <span className={styles.barValue}>{formatValue(item.value)}</span>
          </div>
        )
      })}
    </div>
  )
}
