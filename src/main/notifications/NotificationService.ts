/**
 * The one place a user-facing alert is produced.
 *
 * Every notification has up to four independent channels, each individually
 * switchable per feature (which is exactly what the settings tree models):
 *
 *   1. OS toast          — `Notification` from Electron, `silent: true`.
 *   2. Sound             — synthesised in the audio-host window.
 *   3. Mascot            — walks over, knocks, shows a speech bubble.
 *   4. In-app toast      — a soft banner inside the dashboard, if it is open.
 *
 * OS toasts are always created silent and paired with our own audio. Letting
 * Windows play its notification sound *and* playing ours produces a double
 * chime, and the user's per-feature volume slider would control only half of it.
 *
 * Gating: this service honours the master switch only. Quiet hours and Do Not
 * Disturb are enforced by the scheduler — that way an explicit user action
 * ("Drink water now" from the tray) is still acknowledged during DND, which is
 * what people expect from a button they just pressed.
 */

import { Notification } from 'electron'
import type { FocusPhase, MascotAnimation, SoundId } from '@shared/types'
import type { ToastMessage } from '@shared/ipc'
import { getReminderDefinition } from '@shared/reminders/catalog'
import { createTranslator } from '@shared/i18n'
import { formatDurationShort } from '@shared/time'
import { clamp, createId } from '@shared/util'
import { getAchievementDefinition } from '@shared/achievements'
import { createLogger } from '../util/logger'
import type { SettingsRepository } from '../storage/SettingsRepository'
import { notificationsMuted } from './quietHours'

const log = createLogger('notify')

export interface SoundPlayerPort {
  play(request: { soundId: SoundId; volume: number; customPath: string | null }): void
}

export interface MascotPort {
  /** Is the mascot window up and able to deliver a message right now? */
  isAvailable(): boolean
  announce(input: { kind: string; message: string; emoji: string; animation: MascotAnimation }): void
  dismiss(celebrate: boolean): void
  perform(animation: MascotAnimation): void
}

export interface ToastPort {
  send(message: ToastMessage): void
}

/** Raise and focus the dashboard — used when an OS toast is clicked. */
export interface AttentionPort {
  focusDashboard(): void
  /** Complete whatever is pending; returns false when nothing was waiting. */
  acknowledgePending(): boolean
}

export class NotificationService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly sound: SoundPlayerPort,
    private readonly mascot: MascotPort,
    private readonly toast: ToastPort,
    private readonly attention: AttentionPort
  ) {}

  private get t(): ReturnType<typeof createTranslator> {
    return createTranslator(this.settings.get().general.locale)
  }

  /** Effective gain for a channel: master volume × per-feature volume. */
  private effectiveVolume(featureVolume: number): number {
    return clamp(this.settings.get().notifications.masterVolume * featureVolume, 0, 1)
  }

  private showOsToast(title: string, body: string, onClick?: () => void): void {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title,
      body,
      // Our own audio engine owns sound; see the note at the top of the file.
      silent: true
    })

    notification.on('click', () => {
      this.attention.focusDashboard()
      onClick?.()
    })

    notification.show()
  }

  announceReminder(input: { kind: string; message: string; emoji: string; hasBreak: boolean }): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return

    const config = settings.reminders[input.kind]
    if (!config) return
    const prefs = config.notifications
    const definition = getReminderDefinition(input.kind)
    const title = `${input.emoji} ${definition ? this.t(definition.shortTitleKey) : input.kind}`

    if (prefs.desktop) {
      this.showOsToast(title, input.message, () => {
        // Clicking the toast is an acknowledgement, not just a window raise.
        this.attention.acknowledgePending()
      })
    }

    if (prefs.sound && prefs.soundId !== 'none') {
      this.sound.play({
        soundId: prefs.soundId,
        volume: this.effectiveVolume(prefs.volume),
        customPath: prefs.customSoundPath
      })
    }

    if (prefs.mascot && settings.mascot.enabled && this.mascot.isAvailable()) {
      this.mascot.announce({
        kind: input.kind,
        message: input.message,
        emoji: input.emoji,
        // Water gets a drink mime; anything else knocks on the screen.
        animation: input.kind === 'water' ? 'drink' : 'knock'
      })
    }

    // In-app banner only for reminders that do not take over the screen —
    // an overlay plus a banner would be saying the same thing twice.
    if (!input.hasBreak) {
      this.toast.send({
        id: createId('toast'),
        tone: 'info',
        title,
        body: input.message,
        timeoutMs: 8000
      })
    }

    log.debug('reminder announced', { kind: input.kind, desktop: prefs.desktop, sound: prefs.sound, mascot: prefs.mascot })
  }

  /** Happy feedback right after the user completes something. */
  celebrate(kind: string): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return
    if (!settings.mascot.enabled || !this.mascot.isAvailable()) return
    if (settings.reminders[kind]?.notifications.mascot === false) return
    this.mascot.dismiss(true)
  }

  announceGoalMet(kind: string): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return

    const definition = getReminderDefinition(kind)
    const name = definition ? this.t(definition.shortTitleKey) : kind

    this.toast.send({
      id: createId('toast'),
      tone: 'success',
      title: this.t('toast.goalReached', { name }),
      timeoutMs: 6000
    })

    if (settings.mascot.enabled && this.mascot.isAvailable()) this.mascot.perform('celebrate')
    log.info('daily goal met', { kind })
  }

  announceQuietHoursSummary(suppressedCount: number): void {
    if (notificationsMuted(this.settings.get())) return
    this.toast.send({
      id: createId('toast'),
      tone: 'info',
      title: this.t('toast.quietHoursSummary', { count: suppressedCount }),
      timeoutMs: 10_000
    })
  }

  announceAchievement(achievementId: string): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return

    const definition = getAchievementDefinition(achievementId)
    if (!definition) return
    const name = this.t(definition.titleKey)

    this.toast.send({
      id: createId('toast'),
      tone: 'success',
      title: this.t('toast.achievementUnlocked', { name }),
      timeoutMs: 8000
    })
    this.showOsToast(`🏅 ${this.t('achievements.title')}`, name)
    if (settings.mascot.enabled && this.mascot.isAvailable()) this.mascot.perform('celebrate')
  }

  announceFocusStarted(): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return
    if (settings.mascot.enabled && settings.focus.notifications.mascot && this.mascot.isAvailable()) {
      // A wave, then the mascot settles down and keeps out of the way.
      this.mascot.perform('wave')
    }
  }

  announcePhaseComplete(input: { phase: FocusPhase; durationSeconds: number; next: FocusPhase | null }): void {
    const settings = this.settings.get()
    if (notificationsMuted(settings)) return

    const prefs = settings.focus.notifications
    const title = this.t('focus.finished')
    const body =
      input.next === null
        ? this.t('focus.finishedBody', { duration: formatDurationShort(input.durationSeconds) })
        : this.t(`focus.phase.${input.next}`)

    if (prefs.desktop) this.showOsToast(`⏱ ${title}`, body)

    if (prefs.sound && prefs.soundId !== 'none') {
      this.sound.play({
        soundId: prefs.soundId,
        volume: this.effectiveVolume(prefs.volume),
        customPath: prefs.customSoundPath
      })
    }

    this.toast.send({ id: createId('toast'), tone: 'success', title, body, timeoutMs: 7000 })

    if (prefs.mascot && settings.mascot.enabled && this.mascot.isAvailable()) this.mascot.perform('celebrate')
    log.info('focus phase complete', { phase: input.phase, next: input.next })
  }

  /** Plain informational banner, used by settings actions (export, reset, …). */
  info(titleKey: string, params?: Record<string, string | number>, tone: ToastMessage['tone'] = 'info'): void {
    this.toast.send({
      id: createId('toast'),
      tone,
      title: this.t(titleKey, params),
      timeoutMs: 5000
    })
  }

  /** Preview a sound from the settings screen, ignoring the master switch. */
  previewSound(request: { soundId: SoundId; volume: number; customPath: string | null }): void {
    if (request.soundId === 'none') return
    this.sound.play({
      soundId: request.soundId,
      volume: this.effectiveVolume(request.volume),
      customPath: request.customPath
    })
  }
}
