/**
 * The custom title bar.
 *
 * The window is frameless (see MainWindow.ts) so the caption can follow all nine
 * themes. That means re-implementing three things the OS would otherwise give
 * us, and they are the reason this component exists rather than being inlined:
 *
 *   • a drag region (`-webkit-app-region`, applied in CSS),
 *   • minimise / maximise / close, routed over IPC,
 *   • a live status readout, which a native caption could not host anyway.
 */

import { useEffect, useState } from 'react'
import { formatClock } from '@shared/time'
import { Icon } from './Icon'
import { useRuntime } from '../store/useAppStore'
import { useTranslator } from '../i18n/useTranslator'
import styles from './shell.module.css'

export function TitleBar(): JSX.Element {
  const t = useTranslator()
  const runtime = useRuntime()
  const [maximized, setMaximized] = useState(false)

  // Electron owns the maximised state; poll it on a slow cadence rather than
  // adding an IPC event for something this cheap and this rarely observed.
  useEffect(() => {
    let cancelled = false
    const sync = async (): Promise<void> => {
      const value = await window.nudge.window.isMaximized()
      if (!cancelled) setMaximized(value)
    }
    void sync()
    const timer = setInterval(sync, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const focus = runtime.focus
  const showTimer = focus.status === 'running' || focus.status === 'paused'

  return (
    <header className={styles.titleBar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <Icon name="droplet" size={12} />
        </span>
        {t('app.name')}
      </div>

      {showTimer && (
        <div className={styles.titleStatus}>
          <Icon name={focus.status === 'paused' ? 'pause' : 'play'} size={12} />
          <span className="nudge-tnum">{formatClock(focus.remainingSeconds)}</span>
          <span>· {t(`focus.phase.${focus.phase}`)}</span>
        </div>
      )}

      {runtime.doNotDisturbActive && (
        <div className={styles.titleStatus}>
          <Icon name="bellOff" size={12} />
          {t('settings.dnd')}
        </div>
      )}

      <div className={styles.windowControls}>
        <button
          type="button"
          className={styles.windowButton}
          aria-label={t('window.minimize')}
          onClick={() => void window.nudge.window.minimize()}
        >
          <Icon name="minimize" size={15} />
        </button>
        <button
          type="button"
          className={styles.windowButton}
          aria-label={maximized ? t('window.restore') : t('window.maximize')}
          onClick={() => void window.nudge.window.toggleMaximize()}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
        </button>
        <button
          type="button"
          className={`${styles.windowButton} ${styles.windowClose}`}
          aria-label={t('window.close')}
          // Close hides to the tray when configured; the main process decides.
          onClick={() => void window.nudge.window.hide()}
        >
          <Icon name="close" size={15} />
        </button>
      </div>
    </header>
  )
}
