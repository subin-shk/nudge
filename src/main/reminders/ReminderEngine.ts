/**
 * Drives every reminder kind through one shared state machine:
 *
 *      disabled
 *         │ enable
 *         ▼
 *      waiting ──(clock reaches nextFireAt)──▶  due  ──ack──▶ active ──▶ waiting
 *         ▲                                     │  │                       ▲
 *         │                                     │  └──skip/grace──────────▶│
 *         └──────────snooze expires──── snoozed ◀┘
 *         ▲
 *         └── paused (quiet hours / DND / focus / user away)
 *
 * Pausing freezes an interval countdown rather than skipping the fire, so time
 * spent in Do Not Disturb is not deducted from the user's remaining interval.
 * Time-of-day schedules cannot be shifted, so a missed slot is recomputed
 * forward instead. Only one break runs at a time; the rest queue.
 */

import { EventEmitter } from 'node:events'
import type { ActiveBreak, AppSettings, ReminderPauseReason, ReminderPhase, ReminderRuntime, ReminderSettings } from '@shared/types'
import { getReminderDefinition, listReminderDefinitions } from '@shared/reminders/catalog'
import { createTranslator } from '@shared/i18n'
import { nextTimeOccurrence } from '@shared/time'
import { orFallback } from '@shared/util'
import { createLogger } from '../util/logger'
import type { ActivityRepository } from '../storage/ActivityRepository'
import type { SettingsChange, SettingsRepository } from '../storage/SettingsRepository'

const log = createLogger('reminders')

/** Treat the user as away after this much input idleness. */
export const IDLE_PAUSE_SECONDS = 300

/**
 * How long a "due" reminder waits for acknowledgement before being counted as
 * missed. Capped so a 4-hour interval does not leave a toast pending all day.
 */
const GRACE_MS = { min: 60_000, max: 10 * 60_000 } as const

/**
 * A tick gap larger than this means the machine slept: reschedule cleanly
 * instead of firing once for every interval that elapsed.
 */
const RESUME_BURST_GUARD_MS = 90_000

export interface ReminderNotifier {
  announceReminder(input: { kind: string; message: string; emoji: string; hasBreak: boolean }): void
  announceGoalMet(kind: string): void
  celebrate(kind: string): void
  announceQuietHoursSummary(suppressedCount: number): void
}

export interface BreakPresenter {
  showBreak(active: ActiveBreak, useOverlay: boolean): void
  updateBreak(active: ActiveBreak): void
  hideBreak(celebrate: boolean): void
}

export interface TickContext {
  userIdleSeconds: number
  /** Only pauses reminders when `pauseRemindersDuringFocus` is set. */
  focusActive: boolean
}

interface ReminderState {
  kind: string
  phase: ReminderPhase
  nextFireAt: number | null
  snoozedUntil: number | null
  /** When the reminder entered `due`, for grace-period expiry. */
  dueSince: number | null
  firedThisSession: number
  pauseReasons: ReminderPauseReason[]
}

export class ReminderEngine {
  private readonly emitter = new EventEmitter()
  private states = new Map<string, ReminderState>()
  private activeBreak: (ActiveBreak & { autoResume: boolean }) | null = null
  /** Kinds that fired while a break was in progress, in arrival order. */
  private breakQueue: string[] = []
  private lastTickAt: number | null = null
  /** Reminders suppressed during quiet hours, for the end-of-window summary. */
  private deferred = new Map<string, number>()
  private wasQuietHours = false

  constructor(
    private readonly settings: SettingsRepository,
    private readonly activity: ActivityRepository,
    private readonly notifier: ReminderNotifier,
    private readonly presenter: BreakPresenter
  ) {}

  init(now: number = Date.now()): void {
    for (const definition of listReminderDefinitions()) {
      this.states.set(definition.kind, this.freshState(definition.kind))
    }
    this.rescheduleAll(now, 'init')
    this.lastTickAt = now
  }

  private freshState(kind: string): ReminderState {
    return { kind, phase: 'waiting', nextFireAt: null, snoozedUntil: null, dueSince: null, firedThisSession: 0, pauseReasons: [] }
  }

  onChange(listener: () => void): () => void {
    this.emitter.on('changed', listener)
    return () => this.emitter.off('changed', listener)
  }

  private notifyChanged(): void {
    this.emitter.emit('changed')
  }

  private configFor(kind: string): ReminderSettings | null {
    return this.settings.get().reminders[kind] ?? null
  }

  /** The user's custom text, or the localised default for this kind. */
  messageFor(kind: string): string {
    const config = this.configFor(kind)
    const definition = getReminderDefinition(kind)
    const t = createTranslator(this.settings.get().general.locale)
    const fallback = definition ? t(definition.defaultMessageKey) : kind
    return orFallback(config?.message, fallback)
  }

  private emojiFor(kind: string): string {
    return getReminderDefinition(kind)?.emoji ?? '🔔'
  }

  private graceMsFor(config: ReminderSettings): number {
    const halfInterval = (config.schedule.intervalMinutes * 60_000) / 2
    return Math.min(Math.max(halfInterval, GRACE_MS.min), GRACE_MS.max)
  }

  /** `null` means "nothing to schedule" (disabled, or a times list with no times). */
  private computeNextFire(kind: string, from: number): number | null {
    const config = this.configFor(kind)
    if (!config?.enabled) return null

    if (config.schedule.mode === 'times') {
      const next = nextTimeOccurrence(new Date(from), config.schedule.times)
      return next ? next.getTime() : null
    }
    return from + config.schedule.intervalMinutes * 60_000
  }

  private rescheduleAll(now: number, reason: string): void {
    for (const state of this.states.values()) {
      const config = this.configFor(state.kind)
      if (!config?.enabled) {
        state.phase = 'disabled'
        state.nextFireAt = null
        state.snoozedUntil = null
        state.dueSince = null
        continue
      }
      state.phase = 'waiting'
      state.snoozedUntil = null
      state.dueSince = null
      state.nextFireAt = this.computeNextFire(state.kind, now)
    }
    log.info('all reminders rescheduled', { reason })
    this.notifyChanged()
  }

  private computePauseReasons(kind: string, context: TickContext, quietHoursActive: boolean, dndActive: boolean): ReminderPauseReason[] {
    const settings = this.settings.get()
    const reasons: ReminderPauseReason[] = []

    if (quietHoursActive) reasons.push('quietHours')
    if (dndActive) reasons.push('doNotDisturb')
    if (context.focusActive && settings.focus.pauseRemindersDuringFocus) reasons.push('focus')
    if (context.userIdleSeconds >= IDLE_PAUSE_SECONDS) reasons.push('userIdle')

    // A global notification kill-switch pauses delivery for every kind.
    if (!settings.notifications.enabled) reasons.push('doNotDisturb')

    void kind // reserved: per-kind pause rules (e.g. work-hours-only) hook in here
    return [...new Set(reasons)]
  }

  tick(now: number, context: TickContext, flags: { quietHoursActive: boolean; dndActive: boolean }): void {
    const elapsed = this.lastTickAt === null ? 0 : Math.max(0, now - this.lastTickAt)
    this.lastTickAt = now

    // A jump far beyond the tick interval means the machine slept. Rebase every
    // pending reminder instead of firing a backlog at a user who just opened
    // their laptop lid.
    if (elapsed > RESUME_BURST_GUARD_MS) {
      log.info('large clock gap detected — rebasing schedules', { gapMs: elapsed })
      this.handleResume(now)
      return
    }

    this.advanceBreak(now)
    this.emitQuietHoursSummary(flags.quietHoursActive)

    let changed = false

    for (const state of this.states.values()) {
      const config = this.configFor(state.kind)

      if (!config?.enabled) {
        if (state.phase !== 'disabled') {
          Object.assign(state, this.freshState(state.kind), { phase: 'disabled' as ReminderPhase })
          changed = true
        }
        continue
      }

      // The active break's own reminder is driven by advanceBreak().
      if (state.phase === 'active') continue

      const reasons = this.computePauseReasons(state.kind, context, flags.quietHoursActive, flags.dndActive)
      if (reasons.join(',') !== state.pauseReasons.join(',')) {
        state.pauseReasons = reasons
        changed = true
      }

      if (reasons.length > 0) {
        if (state.phase !== 'paused') {
          state.phase = 'paused'
          changed = true
        }
        // Freeze interval countdowns; recompute absolute times.
        if (config.schedule.mode === 'interval') {
          if (state.nextFireAt !== null) state.nextFireAt += elapsed
          if (state.snoozedUntil !== null) state.snoozedUntil += elapsed
        } else if (state.nextFireAt !== null && now >= state.nextFireAt) {
          if (this.settings.get().notifications.quietHoursBehaviour === 'deferToEnd' && flags.quietHoursActive) {
            this.deferred.set(state.kind, (this.deferred.get(state.kind) ?? 0) + 1)
          }
          state.nextFireAt = this.computeNextFire(state.kind, now)
        }
        continue
      }

      // Leaving pause: fall back to snoozed or waiting, whichever applies.
      if (state.phase === 'paused') {
        state.phase = state.snoozedUntil !== null ? 'snoozed' : 'waiting'
        changed = true
      }

      // Grace expiry for an unacknowledged reminder.
      if (state.phase === 'due' && state.dueSince !== null && now - state.dueSince > this.graceMsFor(config)) {
        log.debug('reminder missed', { kind: state.kind })
        void this.activity.record({ type: 'reminder_missed', kind: state.kind, at: now })
        state.phase = 'waiting'
        state.dueSince = null
        state.nextFireAt = this.computeNextFire(state.kind, now)
        changed = true
        continue
      }

      if (state.phase === 'due') continue

      if (state.nextFireAt === null) {
        state.nextFireAt = this.computeNextFire(state.kind, now)
        changed = true
      }

      if (state.nextFireAt !== null && now >= state.nextFireAt) {
        this.fire(state.kind, now)
        changed = true
      }
    }

    if (changed) this.notifyChanged()
  }

  /** Reschedule everything relative to `now` after a suspend/resume cycle. */
  handleResume(now: number): void {
    this.lastTickAt = now
    if (this.activeBreak) {
      // A break that spanned sleep is meaningless — drop it silently.
      this.presenter.hideBreak(false)
      const kind = this.activeBreak.kind
      this.activeBreak = null
      const state = this.states.get(kind)
      if (state) state.phase = 'waiting'
    }
    this.rescheduleAll(now, 'resume')
  }

  private fire(kind: string, now: number): void {
    const config = this.configFor(kind)
    const state = this.states.get(kind)
    if (!config || !state) return

    state.firedThisSession++
    state.snoozedUntil = null
    void this.activity.record({ type: 'reminder_fired', kind, at: now })

    // Serialise breaks: queue rather than stack.
    if (this.activeBreak !== null) {
      if (!this.breakQueue.includes(kind)) this.breakQueue.push(kind)
      state.phase = 'due'
      state.dueSince = now
      log.debug('reminder queued behind active break', { kind })
      return
    }

    const message = this.messageFor(kind)

    if (config.breakSeconds > 0) {
      this.startBreak(kind, config, message, now)
      return
    }

    // Acknowledge-only reminder (water): announce and wait for the user.
    state.phase = 'due'
    state.dueSince = now
    state.nextFireAt = null
    this.notifier.announceReminder({ kind, message, emoji: this.emojiFor(kind), hasBreak: false })
    log.info('reminder due', { kind })
  }

  private startBreak(kind: string, config: ReminderSettings, message: string, now: number): void {
    const state = this.states.get(kind)
    if (!state) return

    state.phase = 'active'
    state.dueSince = null
    state.nextFireAt = null

    this.activeBreak = {
      kind,
      message,
      totalSeconds: config.breakSeconds,
      remainingSeconds: config.breakSeconds,
      allowSkip: config.allowSkip,
      snoozeMinutes: config.snoozeMinutes,
      startedAt: now,
      autoResume: config.autoResume
    }

    this.notifier.announceReminder({ kind, message, emoji: this.emojiFor(kind), hasBreak: true })
    this.presenter.showBreak(this.publicBreak(this.activeBreak), config.useOverlay)
    log.info('break started', { kind, seconds: config.breakSeconds, overlay: config.useOverlay })
  }

  private publicBreak(active: ActiveBreak & { autoResume: boolean }): ActiveBreak {
    const { autoResume: _autoResume, ...rest } = active
    return rest
  }

  /** Drive the countdown of an in-flight break. */
  private advanceBreak(now: number): void {
    const active = this.activeBreak
    if (!active) return

    const elapsedSeconds = Math.floor((now - active.startedAt) / 1000)
    const remaining = Math.max(0, active.totalSeconds - elapsedSeconds)

    if (remaining !== active.remainingSeconds) {
      active.remainingSeconds = remaining
      this.presenter.updateBreak(this.publicBreak(active))
      this.notifyChanged()
    }

    if (remaining > 0) return

    if (active.autoResume) {
      this.complete(active.kind, now)
    }
    // With autoResume off, the overlay sits at 0:00 until the user clicks
    // "I'm done" — some people want to finish their stretch at their own pace.
  }

  /** Fire immediately, out of band ("Drink water now" from the tray). */
  triggerNow(kind: string, now: number = Date.now()): void {
    const state = this.states.get(kind)
    const config = this.configFor(kind)
    if (!state || !config) return

    // A manual trigger bypasses pause reasons: the user asked for it.
    if (this.activeBreak && this.activeBreak.kind !== kind) {
      if (!this.breakQueue.includes(kind)) this.breakQueue.push(kind)
      this.notifyChanged()
      return
    }

    state.snoozedUntil = null
    state.pauseReasons = []
    this.fire(kind, now)
    this.notifyChanged()
  }

  /** Mark the reminder done: record it, celebrate, reschedule. */
  complete(kind: string, now: number = Date.now()): void {
    const state = this.states.get(kind)
    const config = this.configFor(kind)
    if (!state || !config) return

    const wasActiveBreak = this.activeBreak?.kind === kind
    const durationSeconds = wasActiveBreak
      ? Math.min(config.breakSeconds, Math.round((now - this.activeBreak!.startedAt) / 1000))
      : undefined

    void this.activity
      .record({
        type: 'reminder_completed',
        kind,
        at: now,
        ...(durationSeconds !== undefined ? { durationSeconds } : {})
      })
      .then(({ goalJustMet }) => {
        if (goalJustMet) this.notifier.announceGoalMet(goalJustMet)
      })

    if (wasActiveBreak) {
      this.activeBreak = null
      this.presenter.hideBreak(true)
    }
    this.notifier.celebrate(kind)

    state.phase = 'waiting'
    state.dueSince = null
    state.snoozedUntil = null
    state.nextFireAt = this.computeNextFire(kind, now)

    log.info('reminder completed', { kind })
    this.drainQueue(now)
    this.notifyChanged()
  }

  skip(kind: string, now: number = Date.now()): void {
    const state = this.states.get(kind)
    if (!state) return

    void this.activity.record({ type: 'reminder_skipped', kind, at: now })

    if (this.activeBreak?.kind === kind) {
      this.activeBreak = null
      this.presenter.hideBreak(false)
    }

    state.phase = 'waiting'
    state.dueSince = null
    state.snoozedUntil = null
    state.nextFireAt = this.computeNextFire(kind, now)

    log.info('reminder skipped', { kind })
    this.drainQueue(now)
    this.notifyChanged()
  }

  snooze(kind: string, minutes: number, now: number = Date.now()): void {
    const state = this.states.get(kind)
    const config = this.configFor(kind)
    if (!state || !config) return

    const allowed = config.snoozeMinutes.includes(minutes) ? minutes : (config.snoozeMinutes[0] ?? 5)
    const until = now + allowed * 60_000

    void this.activity.record({ type: 'reminder_snoozed', kind, at: now, meta: { minutes: allowed } })

    if (this.activeBreak?.kind === kind) {
      this.activeBreak = null
      this.presenter.hideBreak(false)
    }

    state.phase = 'snoozed'
    state.dueSince = null
    state.snoozedUntil = until
    state.nextFireAt = until

    log.info('reminder snoozed', { kind, minutes: allowed })
    this.drainQueue(now)
    this.notifyChanged()
  }

  /** "I just drank" — restart the interval without recording a completion. */
  restartInterval(kind: string, now: number = Date.now()): void {
    const state = this.states.get(kind)
    if (!state) return
    state.phase = 'waiting'
    state.dueSince = null
    state.snoozedUntil = null
    state.nextFireAt = this.computeNextFire(kind, now)
    this.notifyChanged()
  }

  /**
   * Acknowledge whatever is currently waiting on the user (mascot poke, toast
   * click). Prefers the active break, then the oldest due reminder.
   */
  acknowledgePending(now: number = Date.now()): boolean {
    if (this.activeBreak) {
      this.complete(this.activeBreak.kind, now)
      return true
    }
    const due = [...this.states.values()]
      .filter((state) => state.phase === 'due' && state.dueSince !== null)
      .sort((a, b) => (a.dueSince ?? 0) - (b.dueSince ?? 0))[0]

    if (due) {
      this.complete(due.kind, now)
      return true
    }
    return false
  }

  private drainQueue(now: number): void {
    if (this.activeBreak !== null) return
    const next = this.breakQueue.shift()
    if (!next) return

    const state = this.states.get(next)
    const config = this.configFor(next)
    if (!state || !config?.enabled) {
      this.drainQueue(now)
      return
    }

    if (config.breakSeconds > 0) {
      this.startBreak(next, config, this.messageFor(next), now)
    } else {
      state.phase = 'due'
      state.dueSince = now
      this.notifier.announceReminder({ kind: next, message: this.messageFor(next), emoji: this.emojiFor(next), hasBreak: false })
    }
  }

  handleSettingsChange(change: SettingsChange, now: number = Date.now()): void {
    const touchedReminders = change.changedPaths.filter((path) => path.startsWith('reminders.'))
    if (touchedReminders.length === 0) return

    // Reschedule only the kinds whose *schedule* changed. Editing a sound or a
    // message must not silently restart the user's 20-minute countdown.
    const affected = new Set<string>()
    for (const path of touchedReminders) {
      const [, kind, section] = path.split('.')
      if (!kind) continue
      if (section === 'enabled' || section === 'schedule') affected.add(kind)
    }

    for (const kind of affected) {
      if (!this.states.has(kind)) this.states.set(kind, this.freshState(kind))
      const state = this.states.get(kind)!
      const config = this.configFor(kind)

      if (!config?.enabled) {
        Object.assign(state, this.freshState(kind), { phase: 'disabled' as ReminderPhase })
        if (this.activeBreak?.kind === kind) {
          this.activeBreak = null
          this.presenter.hideBreak(false)
        }
        continue
      }
      if (state.phase === 'active') continue

      state.phase = 'waiting'
      state.snoozedUntil = null
      state.dueSince = null
      state.nextFireAt = this.computeNextFire(kind, now)
      log.debug('reminder rescheduled after settings change', { kind })
    }

    // Register kinds that appeared (a plugin loaded, or an import added one).
    for (const definition of listReminderDefinitions()) {
      if (!this.states.has(definition.kind)) {
        const fresh = this.freshState(definition.kind)
        fresh.nextFireAt = this.computeNextFire(definition.kind, now)
        this.states.set(definition.kind, fresh)
      }
    }

    this.notifyChanged()
  }

  private emitQuietHoursSummary(quietHoursActive: boolean): void {
    if (this.wasQuietHours && !quietHoursActive && this.deferred.size > 0) {
      let total = 0
      for (const count of this.deferred.values()) total += count
      this.deferred.clear()
      if (total > 0) this.notifier.announceQuietHoursSummary(total)
    }
    this.wasQuietHours = quietHoursActive
  }

  getActiveBreak(): ActiveBreak | null {
    return this.activeBreak ? this.publicBreak(this.activeBreak) : null
  }

  /** True when something is waiting on the user — drives the mascot's mood. */
  hasPending(): boolean {
    if (this.activeBreak) return true
    for (const state of this.states.values()) if (state.phase === 'due') return true
    return false
  }

  getRuntime(now: number, todayCompleted: Record<string, number>): Record<string, ReminderRuntime> {
    const out: Record<string, ReminderRuntime> = {}

    for (const state of this.states.values()) {
      const config = this.configFor(state.kind)
      const nextFireAt = state.nextFireAt
      out[state.kind] = {
        kind: state.kind,
        phase: state.phase,
        nextFireAt,
        secondsUntilNext: nextFireAt === null ? null : Math.max(0, Math.round((nextFireAt - now) / 1000)),
        snoozedUntil: state.snoozedUntil,
        pauseReasons: [...state.pauseReasons],
        todayCompleted: todayCompleted[state.kind] ?? 0,
        todayGoal: config?.dailyGoal ?? 0,
        firedThisSession: state.firedThisSession
      }
    }
    return out
  }

  /** Names of kinds currently waiting on the user, for the tray tooltip. */
  duePendingKinds(): string[] {
    return [...this.states.values()].filter((state) => state.phase === 'due').map((state) => state.kind)
  }

  /** The soonest upcoming reminder, for the tray tooltip. */
  soonest(now: number): { kind: string; secondsUntilNext: number } | null {
    let best: { kind: string; secondsUntilNext: number } | null = null
    for (const state of this.states.values()) {
      if (state.phase === 'disabled' || state.nextFireAt === null) continue
      const seconds = Math.max(0, Math.round((state.nextFireAt - now) / 1000))
      if (!best || seconds < best.secondsUntilNext) best = { kind: state.kind, secondsUntilNext: seconds }
    }
    return best
  }

  /** Settings snapshot used by the engine — exposed for the goal provider. */
  goalFor(kind: string): number {
    return this.configFor(kind)?.dailyGoal ?? 0
  }

  dispose(): void {
    this.emitter.removeAllListeners()
    this.states.clear()
    this.breakQueue = []
    this.activeBreak = null
  }

  /** Settings object this engine reads from — used by tests to assert wiring. */
  get settingsSnapshot(): AppSettings {
    return this.settings.get()
  }
}
