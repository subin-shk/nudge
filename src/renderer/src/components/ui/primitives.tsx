/**
 * Buttons, icon buttons and chips — the smallest interactive pieces.
 */

import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import styles from './ui.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  /** Place the icon after the label — for "Next →" style actions. */
  trailingIcon?: IconName
  fullWidth?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  trailingIcon,
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={clsx(
        styles.button,
        styles[variant],
        size === 'sm' && styles.sizeSm,
        size === 'lg' && styles.sizeLg,
        fullWidth && styles.fullWidth,
        className
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} size={size === 'sm' ? 15 : 17} />}
    </button>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** Required: an icon-only control is unusable by screen readers without it. */
  label: string
  size?: number
  active?: boolean
}

export function IconButton({ icon, label, size = 18, active, className, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(styles.iconButton, active && styles.iconButtonActive, className)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  )
}

export interface ChipProps {
  children: ReactNode
  tone?: 'default' | 'accent' | 'success' | 'warning'
  icon?: IconName
  selected?: boolean
  onClick?: () => void
  title?: string
}

export function Chip({ children, tone = 'default', icon, selected, onClick, title }: ChipProps): JSX.Element {
  const interactive = typeof onClick === 'function'
  const Element = interactive ? 'button' : 'span'

  return (
    <Element
      // `as any` avoided by branching: a <span> must not receive type="button".
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      title={title}
      className={clsx(
        styles.chip,
        tone === 'accent' && styles.chipAccent,
        tone === 'success' && styles.chipSuccess,
        tone === 'warning' && styles.chipWarning,
        interactive && styles.chipInteractive,
        selected && styles.chipSelected
      )}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
    </Element>
  )
}
