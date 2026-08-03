/**
 * Feedback surfaces: Tooltip, ProgressRing, Modal and the toast host.
 */

import clsx from 'clsx'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ToastMessage } from '@shared/ipc'
import { Icon, type IconName } from '../Icon'
import { Button, IconButton } from './primitives'
import styles from './ui.module.css'

export function Tooltip({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  const [visible, setVisible] = useState(false)
  return (
    <span
      className={styles.tooltipWrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span role="tooltip" className={styles.tooltip}>
          {label}
        </span>
      )}
    </span>
  )
}

export interface ProgressRingProps {
  /** 0..1 */
  progress: number
  size?: number
  thickness?: number
  /** Colour token name, e.g. `--tone-focus`. Defaults to the accent. */
  colorVar?: string
  children?: ReactNode
  /** Suppress the stroke transition — used when a timer resets to full. */
  instant?: boolean
}

/**
 * The focus timer's centrepiece.
 *
 * Drawn with `stroke-dasharray` on a rotated circle: one SVG element, GPU
 * composited, and it stays crisp at any size — unlike a conic-gradient ring,
 * which visibly bands on the large sizes this is used at.
 */
export function ProgressRing({
  progress,
  size = 220,
  thickness = 12,
  colorVar = '--accent',
  children,
  instant
}: ProgressRingProps): JSX.Element {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, progress))
  const offset = circumference * (1 - clamped)

  return (
    <div className={styles.ring} style={{ width: size, height: size }}>
      <svg className={styles.ringSvg} width={size} height={size} aria-hidden="true">
        <circle className={styles.ringTrack} cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} />
        <circle
          className={styles.ringFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ stroke: `var(${colorVar})`, transition: instant ? 'none' : undefined }}
        />
      </svg>
      <div className={styles.ringContent}>{children}</div>
    </div>
  )
}

export interface ModalProps {
  open: boolean
  title: string
  body?: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A confirmation dialog. Rendered in a portal so it escapes any transformed or
 * `overflow: hidden` ancestor, and Esc always cancels.
 */
export function Modal({ open, title, body, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
      if (event.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, onConfirm])

  if (!open) return null

  return createPortal(
    <div className={styles.modalScrim} onClick={onCancel} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className={styles.modalTitle}>{title}</h2>
        {body && <div className={styles.modalBody}>{body}</div>}
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const TOAST_ICONS: Record<ToastMessage['tone'], IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert'
}

function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }): JSX.Element {
  useEffect(() => {
    if (toast.timeoutMs <= 0) return
    const timer = setTimeout(() => onDismiss(toast.id), toast.timeoutMs)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div
      className={clsx(
        styles.toast,
        toast.tone === 'success' && styles.toastSuccess,
        toast.tone === 'warning' && styles.toastWarning
      )}
      role="status"
    >
      <span className={styles.toastIcon}>
        <Icon name={TOAST_ICONS[toast.tone]} size={17} />
      </span>
      <div>
        <div className={styles.toastTitle}>{toast.title}</div>
        {toast.body && <div className={styles.toastBody}>{toast.body}</div>}
      </div>
      <IconButton
        icon="close"
        label="Dismiss"
        size={14}
        className={styles.toastClose}
        onClick={() => onDismiss(toast.id)}
        style={{ width: 24, height: 24 } as CSSProperties}
      />
    </div>
  )
}

export function ToastHost({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }): JSX.Element {
  return (
    <div className={styles.toastHost} aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
