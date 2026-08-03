/**
 * Focus timer + Pomodoro.
 *
 * Two modes share one implementation because a Pomodoro *is* a chain of timers:
 *
 *   timer     → one phase, whatever length the user picked, then done.
 *   pomodoro  → focus → short break → focus → … → long break every N, looping.
 *
 * Time accounting rules that matter for honest statistics:
 *
 *   • Elapsed time is derived from wall-clock anchors (`phaseStartedAt` plus
 *     accumulated pause time), never from counting ticks. A dropped or delayed
 *     tick therefore cannot lose a minute of someone's focus record.
 *   • Stopping early still banks the time actually spent. A tool that erases 24
 *     minutes because you stopped at minute 24 of 25 trains people to lie to it.
 *   • Break phases never count as focus time.
 */

import { EventEmitter } from 'node:events'
import type { FocusPhase, FocusRuntime, FocusStatus } from '@shared/types'
import { createLogger } from '../util/logger'
import type { ActivityRepository } from '../storage/ActivityRepository'
import type { SettingsRepository } from '../storage/SettingsRepository'

const log = createLogger('focus')

export interface FocusNotifier {
  /** A phase finished. `next` is null when the chain ended. */
  announcePhaseComplete(input: { phase: FocusPhase; durationSeconds: number; next: FocusPhase | null }): void
  announceFocusStarted(): void
}

/** Keeps the display awake during focus; implemented over Electron powerSaveBlocker. */
export interface SleepBlocker {
  block(): void
  release(): void
}

export class FocusTimerService {
  private readonly emitter = new EventEmitter()

  private status: FocusStatus = 'idle'
  private mode: 'timer' | 'pomodoro' = 'timer'
  private phase: FocusPhase = 'focus'

  private phaseTotalSeconds = 0
  /** Wall-clock start of the current phase. */
  private phaseStartedAt: number | null = null
  /** Milliseconds spent paused during the current phase. */
  private pausedAccumulatedMs = 0
  private pausedAt: number | null = null

  /** Completed focus phases in the current pomodoro chain. */
  private pomodoroCount = 0
  /** Focus seconds already recorded today, excluding the in-flight phase. */
  private todayRecordedFocusSeconds = 0

  constructor(
    private readonly settings: SettingsRepository,
    private readonly activity: ActivityRepository,
    private readonly notifier: FocusNotifier,
    private readonly sleepBlocker: SleepBlocker
  ) {}

  async init(): Promise<void> {
    const today = await this.activity.ensureToday()
    this.todayRecordedFocusSeconds = today.focusSeconds
  }

  onChange(listener: () => void): () => void {
    this.emitter.on('changed', listener)
    return () => this.emitter.off('changed', listener)
  }

  private notifyChanged(): void {
    this.emitter.emit('changed')
  }

  isFocusPhaseRunning(): boolean {
    return this.status === 'running' && this.phase === 'focus'
  }

  /** Seconds elapsed in the current phase, excluding paused time. */
  private elapsedSeconds(now: number): number {
    if (this.phaseStartedAt === null) return 0
    const pausedMs = this.pausedAccumulatedMs + (this.pausedAt !== null ? now - this.pausedAt : 0)
    return Math.max(0, Math.floor((now - this.phaseStartedAt - pausedMs) / 1000))
  }

  private remainingSeconds(now: number): number {
    if (this.status === 'idle') return 0
    return Math.max(0, this.phaseTotalSeconds - this.elapsedSeconds(now))
  }

  getRuntime(now: number): FocusRuntime {
    const inFlightFocus = this.phase === 'focus' && this.status !== 'idle' ? this.elapsedSeconds(now) : 0
    return {
      status: this.status,
      mode: this.mode,
      phase: this.phase,
      totalSeconds: this.phaseTotalSeconds,
      remainingSeconds: this.remainingSeconds(now),
      startedAt: this.phaseStartedAt,
      pomodoroCount: this.pomodoroCount,
      todayFocusSeconds: this.todayRecordedFocusSeconds + inFlightFocus
    }
  }

  start(request: { minutes: number; mode: 'timer' | 'pomodoro' }, now: number = Date.now()): void {
    // Starting over an existing session banks what has been done so far rather
    // than discarding it.
    if (this.status !== 'idle') this.stop(now)

    const focus = this.settings.get().focus
    this.mode = request.mode
    this.phase = 'focus'
    this.pomodoroCount = 0
    this.phaseTotalSeconds =
      request.mode === 'pomodoro' ? focus.pomodoro.focusMinutes * 60 : Math.max(1, Math.round(request.minutes)) * 60

    this.phaseStartedAt = now
    this.pausedAccumulatedMs = 0
    this.pausedAt = null
    this.status = 'running'

    void this.activity.record({ type: 'focus_started', kind: 'focus', at: now, meta: { mode: request.mode } })
    if (focus.preventSleep) this.sleepBlocker.block()
    this.notifier.announceFocusStarted()

    log.info('focus started', { mode: request.mode, seconds: this.phaseTotalSeconds })
    this.notifyChanged()
  }

  pause(now: number = Date.now()): void {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.pausedAt = now
    this.sleepBlocker.release()
    log.info('focus paused')
    this.notifyChanged()
  }

  resume(now: number = Date.now()): void {
    if (this.status !== 'paused') return
    if (this.pausedAt !== null) this.pausedAccumulatedMs += now - this.pausedAt
    this.pausedAt = null
    this.status = 'running'
    if (this.settings.get().focus.preventSleep) this.sleepBlocker.block()
    log.info('focus resumed')
    this.notifyChanged()
  }

  /** Stop the chain entirely, banking any focus time already spent. */
  stop(now: number = Date.now()): void {
    if (this.status === 'idle') return

    const elapsed = this.elapsedSeconds(now)
    if (this.phase === 'focus' && elapsed > 0) {
      this.todayRecordedFocusSeconds += elapsed
      void this.activity.record({ type: 'focus_aborted', kind: 'focus', at: now, durationSeconds: elapsed })
    }

    this.reset()
    log.info('focus stopped', { bankedSeconds: elapsed })
    this.notifyChanged()
  }

  /** Add time to the current phase — the "just five more minutes" button. */
  extend(minutes: number): void {
    if (this.status === 'idle') return
    this.phaseTotalSeconds += Math.max(1, Math.round(minutes)) * 60
    // Re-entering `running` lets "extend" rescue a phase that already finished.
    if (this.status === 'finished') this.status = 'running'
    log.info('focus extended', { minutes })
    this.notifyChanged()
  }

  /** Jump to the next phase without completing this one. */
  skipPhase(now: number = Date.now()): void {
    if (this.status === 'idle') return
    const elapsed = this.elapsedSeconds(now)
    if (this.phase === 'focus' && elapsed > 0) {
      this.todayRecordedFocusSeconds += elapsed
      void this.activity.record({ type: 'focus_aborted', kind: 'focus', at: now, durationSeconds: elapsed })
    }
    this.advance(now, { creditPhase: false })
  }

  private reset(): void {
    this.status = 'idle'
    this.phase = 'focus'
    this.phaseTotalSeconds = 0
    this.phaseStartedAt = null
    this.pausedAccumulatedMs = 0
    this.pausedAt = null
    this.pomodoroCount = 0
    this.sleepBlocker.release()
  }

  tick(now: number): void {
    if (this.status !== 'running') return
    if (this.remainingSeconds(now) > 0) {
      // Emit once a second so the tray countdown and progress ring stay live.
      this.notifyChanged()
      return
    }
    this.completePhase(now)
  }

  private completePhase(now: number): void {
    const duration = Math.min(this.phaseTotalSeconds, this.elapsedSeconds(now))

    if (this.phase === 'focus') {
      this.todayRecordedFocusSeconds += duration
      void this.activity.record({ type: 'focus_completed', kind: 'focus', at: now, durationSeconds: duration })
      if (this.mode === 'pomodoro') {
        this.pomodoroCount++
        void this.activity.record({ type: 'pomodoro_completed', kind: 'focus', at: now })
      }
    }

    this.advance(now, { creditPhase: true, completedDuration: duration })
  }

  /**
   * Move to whatever comes next: the following pomodoro phase, or idle.
   * Centralised so `skipPhase` and natural completion cannot diverge.
   */
  private advance(now: number, options: { creditPhase: boolean; completedDuration?: number }): void {
    const finishedPhase = this.phase
    const pomodoro = this.settings.get().focus.pomodoro

    if (this.mode !== 'pomodoro') {
      this.notifier.announcePhaseComplete({
        phase: finishedPhase,
        durationSeconds: options.completedDuration ?? 0,
        next: null
      })
      this.status = 'finished'
      // Hold `finished` briefly so the UI can show a completion state; the
      // coordinator clears it when the user acknowledges or starts again.
      this.phaseStartedAt = null
      this.phaseTotalSeconds = 0
      this.sleepBlocker.release()
      this.notifyChanged()
      return
    }

    const nextPhase: FocusPhase =
      finishedPhase === 'focus'
        ? this.pomodoroCount > 0 && this.pomodoroCount % pomodoro.longBreakEvery === 0
          ? 'longBreak'
          : 'shortBreak'
        : 'focus'

    const nextSeconds =
      nextPhase === 'focus'
        ? pomodoro.focusMinutes * 60
        : nextPhase === 'longBreak'
          ? pomodoro.longBreakMinutes * 60
          : pomodoro.shortBreakMinutes * 60

    this.notifier.announcePhaseComplete({
      phase: finishedPhase,
      durationSeconds: options.completedDuration ?? 0,
      next: nextPhase
    })

    this.phase = nextPhase
    this.phaseTotalSeconds = nextSeconds
    this.pausedAccumulatedMs = 0
    this.pausedAt = null

    if (pomodoro.autoStartNext) {
      this.phaseStartedAt = now
      this.status = 'running'
      if (nextPhase === 'focus' && this.settings.get().focus.preventSleep) this.sleepBlocker.block()
      else this.sleepBlocker.release()
    } else {
      // Wait for a click. `paused` with a full remaining time reads as "ready".
      this.phaseStartedAt = now
      this.pausedAt = now
      this.status = 'paused'
      this.sleepBlocker.release()
    }

    log.info('pomodoro advanced', { from: finishedPhase, to: nextPhase, cycle: this.pomodoroCount })
    this.notifyChanged()
  }

  /** Clear the transient `finished` state once the user has seen it. */
  acknowledgeFinished(): void {
    if (this.status !== 'finished') return
    this.reset()
    this.notifyChanged()
  }

  /** Called after midnight rollover so "today" reflects the new day. */
  async refreshTodayBaseline(): Promise<void> {
    const today = await this.activity.ensureToday()
    // Subtract the in-flight phase: it is added back by getRuntime().
    this.todayRecordedFocusSeconds = today.focusSeconds
    this.notifyChanged()
  }

  handleSuspend(now: number = Date.now()): void {
    // Treat sleep as a pause so a laptop lid does not inflate focus totals.
    if (this.status === 'running') this.pause(now)
  }

  dispose(): void {
    this.sleepBlocker.release()
    this.emitter.removeAllListeners()
  }
}
