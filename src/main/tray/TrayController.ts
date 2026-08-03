/**
 * System tray icon and menu.
 *
 * Nudge lives in the tray, so this is the primary interface for most of the day.
 * Two performance details matter:
 *
 *   • The **tooltip** is refreshed every tick (it is a cheap string set) so the
 *     countdown is live when you hover.
 *   • The **menu** is rebuilt only when its *structure* changes — pause vs.
 *     resume, DND on vs. off. Rebuilding a Menu 60 times a minute leaks native
 *     handles on Windows and makes the menu flicker if it happens to be open.
 *
 * A signature string is compared to decide which of the two is needed.
 */

import { Menu, Tray, nativeImage } from 'electron'
import type { AppRuntime, AppSettings } from '@shared/types'
import { createTranslator } from '@shared/i18n'
import { getReminderDefinition } from '@shared/reminders/catalog'
import { formatClock, formatCountdown } from '@shared/time'
import { createLogger } from '../util/logger'
import { resourcePath } from '../windows/rendererEntry'

const log = createLogger('tray')

/** Durations offered in the "quick start focus" submenu. */
const QUICK_FOCUS_MINUTES = [15, 25, 45, 60]
/** Durations offered in the timed Do Not Disturb submenu. */
const DND_MINUTES = [30, 60, 120]

export interface TrayActions {
  openDashboard(): void
  startFocus(minutes: number): void
  pauseFocus(): void
  resumeFocus(): void
  stopFocus(): void
  triggerReminder(kind: string): void
  setDoNotDisturb(enabled: boolean, forMinutes: number | null): void
  setMascotEnabled(enabled: boolean): void
  quit(): void
}

export class TrayController {
  private tray: Tray | null = null
  private lastMenuSignature = ''
  private lastTooltip = ''

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly actions: TrayActions
  ) {}

  create(): void {
    if (this.tray) return

    const image = nativeImage.createFromPath(resourcePath('tray.png'))
    this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
    this.tray.setToolTip('Nudge')

    // Left-click is "show me the app" on Windows; the menu is the right-click.
    this.tray.on('click', () => this.actions.openDashboard())
    this.tray.on('double-click', () => this.actions.openDashboard())

    log.info('created')
  }

  update(runtime: AppRuntime): void {
    if (!this.tray) return

    const tooltip = this.buildTooltip(runtime)
    if (tooltip !== this.lastTooltip) {
      this.tray.setToolTip(tooltip)
      this.lastTooltip = tooltip
    }

    const signature = this.menuSignature(runtime)
    if (signature !== this.lastMenuSignature) {
      this.tray.setContextMenu(this.buildMenu(runtime))
      this.lastMenuSignature = signature
    }
  }

  private buildTooltip(runtime: AppRuntime): string {
    const t = createTranslator(this.getSettings().general.locale)
    const { focus } = runtime

    if (focus.status === 'running' || focus.status === 'paused') {
      const phase = t(`focus.phase.${focus.phase}`)
      const suffix = focus.status === 'paused' ? ` (${t('common.pause')})` : ''
      return `Nudge — ${t('tray.tooltip.running', { phase, time: formatClock(focus.remainingSeconds) })}${suffix}`
    }

    const soonest = Object.values(runtime.reminders)
      .filter((reminder) => reminder.secondsUntilNext !== null && reminder.phase !== 'disabled')
      .sort((a, b) => (a.secondsUntilNext ?? 0) - (b.secondsUntilNext ?? 0))[0]

    if (soonest) {
      const definition = getReminderDefinition(soonest.kind)
      const name = definition ? t(definition.shortTitleKey) : soonest.kind
      return `Nudge — ${t('tray.tooltip.nextReminder', { name, time: formatCountdown(soonest.secondsUntilNext) })}`
    }

    return `Nudge — ${t('tray.idle')}`
  }

  /**
   * Everything that changes the menu's *shape*.
   * Deliberately excludes remaining seconds — that is the tooltip's job.
   */
  private menuSignature(runtime: AppRuntime): string {
    const settings = this.getSettings()
    const enabledKinds = Object.entries(settings.reminders)
      .filter(([, config]) => config.enabled)
      .map(([kind]) => kind)
      .join(',')

    return [
      runtime.focus.status,
      runtime.focus.mode,
      runtime.doNotDisturbActive,
      settings.mascot.enabled,
      settings.general.locale,
      enabledKinds
    ].join('|')
  }

  private buildMenu(runtime: AppRuntime): Menu {
    const settings = this.getSettings()
    const t = createTranslator(settings.general.locale)
    const focusRunning = runtime.focus.status === 'running'
    const focusPaused = runtime.focus.status === 'paused'
    const focusActive = focusRunning || focusPaused

    const reminderItems: Electron.MenuItemConstructorOptions[] = Object.entries(settings.reminders)
      .filter(([, config]) => config.enabled)
      .map(([kind]) => {
        const definition = getReminderDefinition(kind)
        // Prefer the action-phrased string ("Drink water now") over the noun
        // ("Water") — a menu item should read as the thing it does.
        const label = t.maybe(`reminder.${kind}.cta`) ?? (definition ? t(definition.titleKey) : kind)
        return {
          label: definition ? `${definition.emoji}  ${label}` : label,
          click: () => this.actions.triggerReminder(kind)
        }
      })

    return Menu.buildFromTemplate([
      {
        label: t('tray.open'),
        click: () => this.actions.openDashboard()
      },
      { type: 'separator' },

      // --- focus -----------------------------------------------------------
      focusActive
        ? {
            label: focusRunning ? t('tray.pauseFocus') : t('tray.resumeFocus'),
            click: () => (focusRunning ? this.actions.pauseFocus() : this.actions.resumeFocus())
          }
        : {
            label: t('tray.startFocus'),
            submenu: QUICK_FOCUS_MINUTES.map((minutes) => ({
              label: t('tray.startFocusFor', { minutes }),
              click: () => this.actions.startFocus(minutes)
            }))
          },
      ...(focusActive
        ? [{ label: t('tray.stopFocus'), click: () => this.actions.stopFocus() } as Electron.MenuItemConstructorOptions]
        : []),
      { type: 'separator' },

      // --- reminders -------------------------------------------------------
      ...reminderItems,
      { type: 'separator' },

      // --- modes -----------------------------------------------------------
      {
        label: t('tray.dnd'),
        type: 'checkbox',
        checked: runtime.doNotDisturbActive,
        click: () => this.actions.setDoNotDisturb(!runtime.doNotDisturbActive, null)
      },
      ...(runtime.doNotDisturbActive
        ? []
        : [
            {
              label: t('settings.dnd.for'),
              submenu: DND_MINUTES.map((minutes) => ({
                label: t('tray.dndFor', { minutes }),
                click: () => this.actions.setDoNotDisturb(true, minutes)
              }))
            } as Electron.MenuItemConstructorOptions
          ]),
      {
        label: t('tray.mascot'),
        type: 'checkbox',
        checked: settings.mascot.enabled,
        click: () => this.actions.setMascotEnabled(!settings.mascot.enabled)
      },
      { type: 'separator' },
      { label: t('tray.quit'), click: () => this.actions.quit() }
    ])
  }

  /** Force the next `update` to rebuild, e.g. after a language change. */
  invalidate(): void {
    this.lastMenuSignature = ''
    this.lastTooltip = ''
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
