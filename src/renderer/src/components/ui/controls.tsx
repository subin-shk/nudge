/**
 * Form controls: Switch, Slider, Select, NumberField, TextInput, TimeField and
 * SegmentedControl.
 *
 * All are controlled components with the same `value` / `onChange` shape, so a
 * settings row is a one-liner and no screen has to manage local input state.
 */

import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { clamp } from '@shared/util'
import { parseHM } from '@shared/time'
import { Icon } from '../Icon'
import styles from './ui.module.css'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label: string
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(styles.switch, checked && styles.switchOn)}
    >
      <span className={styles.switchThumb} />
    </button>
  )
}

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** Rendered to the right of the track, e.g. `120 px` or `80%`. */
  format?: (value: number) => string
  disabled?: boolean
  label: string
}

export function Slider({ value, min, max, step = 1, onChange, format, disabled, label }: SliderProps): JSX.Element {
  const fillPercent = max === min ? 0 : ((clamp(value, min, max) - min) / (max - min)) * 100

  return (
    <div className={styles.slider}>
      <input
        type="range"
        className={styles.sliderInput}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--slider-fill': `${fillPercent}%` } as CSSProperties}
      />
      {format && <span className={styles.sliderValue}>{format(value)}</span>}
    </div>
  )
}

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectProps<T extends string> {
  value: T
  options: Array<SelectOption<T>>
  onChange: (value: T) => void
  disabled?: boolean
  label: string
  /** Widen for long option text such as monitor names. */
  wide?: boolean
}

/**
 * A native `<select>` deliberately.
 *
 * A custom listbox would match the theme more precisely, but the native control
 * gets keyboard navigation, type-ahead, screen-reader semantics and correct
 * positioning near a screen edge for free — and Chromium honours `color-scheme`,
 * so the popup already follows the light/dark theme.
 */
export function Select<T extends string>({ value, options, onChange, disabled, label, wide }: SelectProps<T>): JSX.Element {
  return (
    <div className={styles.select}>
      <select
        className={styles.selectInput}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        style={wide ? { minWidth: 220 } : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={15} className={styles.selectChevron} />
    </div>
  )
}

export interface NumberFieldProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  suffix?: string
  disabled?: boolean
  label: string
}

/**
 * Number entry with stepper buttons.
 *
 * Typing is held in local state until blur so intermediate values ("" while
 * clearing, or "1" on the way to "15") are never clamped out from under the
 * user's cursor — the single most common bug in numeric inputs.
 */
export function NumberField({ value, min, max, step = 1, onChange, suffix, disabled, label }: NumberFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string>(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const commit = (raw: string): void => {
    const parsed = Number(raw)
    const next = Number.isFinite(parsed) ? clamp(Math.round(parsed / step) * step, min, max) : value
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const nudgeBy = (delta: number): void => {
    const next = clamp(value + delta, min, max)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  return (
    <div className={styles.numberField}>
      <button
        type="button"
        className={styles.numberStep}
        aria-label={`${label} −`}
        disabled={disabled || value <= min}
        onClick={() => nudgeBy(-step)}
      >
        <Icon name="minus" size={14} />
      </button>
      <input
        type="number"
        className={styles.numberInput}
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          focused.current = false
          commit(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      {suffix && <span className={styles.numberSuffix}>{suffix}</span>}
      <button
        type="button"
        className={styles.numberStep}
        aria-label={`${label} +`}
        disabled={disabled || value >= max}
        onClick={() => nudgeBy(step)}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  disabled,
  maxLength
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  disabled?: boolean
  maxLength?: number
}): JSX.Element {
  return (
    <input
      type="text"
      className={styles.textInput}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * 'HH:mm' entry backed by `<input type="time">`.
 * Invalid intermediate states are simply not propagated — the parent keeps the
 * last valid value, so quiet hours can never be left in a half-typed state.
 */
export function TimeField({
  value,
  onChange,
  label,
  disabled
}: {
  value: string
  onChange: (value: string) => void
  label: string
  disabled?: boolean
}): JSX.Element {
  const id = useId()
  return (
    <input
      id={id}
      type="time"
      className={clsx(styles.textInput, styles.timeInput)}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => {
        const next = event.target.value
        if (parseHM(next)) onChange(next)
      }}
    />
  )
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (value: T) => void
  label: string
}

export function SegmentedControl<T extends string>({ value, options, onChange, label }: SegmentedControlProps<T>): JSX.Element {
  return (
    <div className={styles.segmented} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={clsx(styles.segment, option.value === value && styles.segmentActive)}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
