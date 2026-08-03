/**
 * OS power and presence signals.
 *
 * Three things the app needs from the operating system:
 *
 *   • **Idle time** — so reminders pause when you are not at the machine and the
 *     mascot can fall asleep. Reading `getSystemIdleTime()` is a syscall, so it
 *     is polled once per tick rather than on demand.
 *   • **Suspend / resume** — a laptop lid closed for two hours must not produce
 *     six queued eye breaks the moment it opens.
 *   • **Screen lock** — treated as "away", the same as idle.
 *
 * The display sleep blocker also lives here, since it is the same Electron
 * subsystem and the focus timer only needs the two-method port.
 */

import { powerMonitor, powerSaveBlocker } from 'electron'
import { createLogger } from '../util/logger'

const log = createLogger('power')

export interface PowerEvents {
  onSuspend(): void
  onResume(): void
  onLock(): void
  onUnlock(): void
}

export class PowerService {
  private blockerId: number | null = null
  private locked = false

  start(events: PowerEvents): void {
    powerMonitor.on('suspend', () => {
      log.info('system suspending')
      events.onSuspend()
    })

    powerMonitor.on('resume', () => {
      log.info('system resumed')
      events.onResume()
    })

    powerMonitor.on('lock-screen', () => {
      this.locked = true
      events.onLock()
    })

    powerMonitor.on('unlock-screen', () => {
      this.locked = false
      events.onUnlock()
    })
  }

  /**
   * Seconds since the last input. A locked screen reports a large value so
   * everything downstream treats "locked" and "away" identically.
   */
  idleSeconds(): number {
    if (this.locked) return Number.MAX_SAFE_INTEGER
    try {
      return powerMonitor.getSystemIdleTime()
    } catch {
      // Some Linux sessions do not expose idle time; assume present.
      return 0
    }
  }

  isScreenLocked(): boolean {
    return this.locked
  }

  block(): void {
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) return
    // 'prevent-display-sleep' also implies preventing app suspension, which is
    // what a focus timer needs: the screen stays readable and the clock stays live.
    this.blockerId = powerSaveBlocker.start('prevent-display-sleep')
    log.debug('display sleep blocked', { id: this.blockerId })
  }

  release(): void {
    if (this.blockerId === null) return
    if (powerSaveBlocker.isStarted(this.blockerId)) powerSaveBlocker.stop(this.blockerId)
    this.blockerId = null
    log.debug('display sleep released')
  }

  dispose(): void {
    this.release()
    powerMonitor.removeAllListeners()
  }
}
