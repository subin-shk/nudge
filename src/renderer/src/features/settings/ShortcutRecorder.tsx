/**
 * Captures a keyboard shortcut and formats it as an Electron accelerator.
 *
 * Rules that keep the captured value actually registerable:
 *   • At least one modifier is required. A bare "F" as a *global* shortcut would
 *     swallow that key for every application on the machine.
 *   • Escape cancels, Backspace/Delete clears the binding.
 *   • Modifier-only presses are ignored, so holding Ctrl while deciding does not
 *     commit a broken accelerator.
 */

import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useTranslator } from '../../i18n/useTranslator'
import styles from './settings.module.css'

/** Map a `KeyboardEvent.code`/`key` to Electron's accelerator vocabulary. */
function toAcceleratorKey(event: KeyboardEvent): string | null {
  const { key, code } = event

  if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(key)) return null

  if (/^F\d{1,2}$/.test(key)) return key
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Numpad')) return `num${code.slice(6).toLowerCase()}`

  const named: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
    '-': 'Minus',
    '=': 'Plus',
    ',': ',',
    '.': '.',
    '/': '/',
    '\\': '\\',
    ';': ';',
    "'": "'",
    '[': '[',
    ']': ']',
    '`': '`'
  }
  return named[key] ?? (key.length === 1 ? key.toUpperCase() : null)
}

/** Human-readable rendering: `Control+Alt+N` → `Ctrl + Alt + N`. */
export function formatAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => (part === 'Control' ? 'Ctrl' : part === 'CommandOrControl' ? 'Ctrl' : part))
    .join(' + ')
}

export interface ShortcutRecorderProps {
  value: string | null
  onChange: (accelerator: string | null) => void
  label: string
}

export function ShortcutRecorder({ value, onChange, label }: ShortcutRecorderProps): JSX.Element {
  const t = useTranslator()
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(false)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        onChange(null)
        setRecording(false)
        return
      }

      const key = toAcceleratorKey(event)
      if (!key) return

      const modifiers: string[] = []
      if (event.ctrlKey) modifiers.push('Control')
      if (event.altKey) modifiers.push('Alt')
      if (event.shiftKey) modifiers.push('Shift')
      if (event.metaKey) modifiers.push('Super')

      // Reject un-modified keys: see the note at the top of the file.
      if (modifiers.length === 0) return

      onChange([...modifiers, key].join('+'))
      setRecording(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange])

  return (
    <>
      <button
        type="button"
        className={clsx(styles.shortcutButton, recording && styles.shortcutRecording, !value && !recording && styles.shortcutUnbound)}
        aria-label={label}
        onClick={() => setRecording((current) => !current)}
      >
        {recording ? t('settings.shortcuts.recording') : value ? formatAccelerator(value) : t('settings.shortcuts.unbound')}
      </button>
      {value && !recording && (
        <button
          type="button"
          aria-label={t('settings.shortcuts.clear')}
          title={t('settings.shortcuts.clear')}
          onClick={() => onChange(null)}
          style={{ color: 'var(--text-faint)', display: 'grid', placeItems: 'center', width: 28, height: 28 }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </>
  )
}
