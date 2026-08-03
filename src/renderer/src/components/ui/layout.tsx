/**
 * Surfaces and structure: Card, Section, Field, StatTile, ProgressBar,
 * EmptyState. These carry the app's spacing and elevation rules so screens can
 * be written as content, not as padding.
 */

import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import styles from './ui.module.css'

export interface CardProps {
  children: ReactNode
  /** Set false when the card supplies its own edge-to-edge content. */
  padded?: boolean
  hoverable?: boolean
  className?: string
  style?: CSSProperties
}

export function Card({ children, padded = true, hoverable, className, style }: CardProps): JSX.Element {
  return (
    <div className={clsx(styles.card, padded && styles.cardPad, hoverable && styles.cardHoverable, className)} style={style}>
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: IconName
  actions?: ReactNode
}): JSX.Element {
  return (
    <header className={styles.cardHeader}>
      <div>
        <div className={styles.cardTitle}>
          {icon && <Icon name={icon} size={17} />}
          {title}
        </div>
        {subtitle && <div className={styles.cardSubtitle}>{subtitle}</div>}
      </div>
      {actions}
    </header>
  )
}

export function Section({
  title,
  description,
  children,
  actions
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  actions?: ReactNode
}): JSX.Element {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {description && <p className={styles.sectionDescription}>{description}</p>}
          </div>
          {actions}
        </div>
      </header>
      {children}
    </section>
  )
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  /** Put the control on its own row — for wide controls like a text input. */
  stacked?: boolean
  disabled?: boolean
}

export function Field({ label, hint, children, stacked, disabled }: FieldProps): JSX.Element {
  return (
    <div className={clsx(styles.field, stacked && styles.fieldStacked, disabled && styles.fieldDisabled)}>
      <div>
        <div className={styles.fieldLabel}>{label}</div>
        {hint && <div className={styles.fieldHint}>{hint}</div>}
      </div>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  )
}

export type StatTone = 'eye' | 'water' | 'focus' | 'move' | 'neutral'

export interface StatTileProps {
  label: string
  value: ReactNode
  unit?: string
  icon: IconName
  tone?: StatTone
  footer?: ReactNode
}

/**
 * The dashboard's headline number.
 * The tone drives one CSS variable, which the icon chip reads — so a new
 * reminder tone needs no new component variant.
 */
export function StatTile({ label, value, unit, icon, tone = 'neutral', footer }: StatTileProps): JSX.Element {
  const style = {
    '--tile-tone': `var(--tone-${tone})`,
    // 18% alpha over the card gives a tint that works in light and dark alike.
    '--tile-tone-soft': `color-mix(in srgb, var(--tone-${tone}) 16%, transparent)`
  } as CSSProperties

  return (
    <div className={styles.stat} style={style}>
      <div className={styles.statHead}>
        <span className={styles.statIcon}>
          <Icon name={icon} size={15} />
        </span>
        {label}
      </div>
      <div className={styles.statValue}>
        {value}
        {unit && <span className={styles.statUnit}>{unit}</span>}
      </div>
      {footer && <div className={styles.statFoot}>{footer}</div>}
    </div>
  )
}

export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: StatTone }): JSX.Element {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div
      className={styles.bar}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={tone ? ({ '--bar-tone': `var(--tone-${tone})` } as CSSProperties) : undefined}
    >
      <div className={styles.barFill} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body?: string }): JSX.Element {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>
        <Icon name={icon} size={24} />
      </div>
      <div className={styles.emptyTitle}>{title}</div>
      {body && <p className={styles.emptyBody}>{body}</p>}
    </div>
  )
}
