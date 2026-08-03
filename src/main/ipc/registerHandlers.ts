/**
 * Every IPC command, in one table.
 *
 * Handlers stay one-liners on purpose: the logic belongs to the services, and
 * this file's value is being a complete, greppable index of the renderer's
 * capabilities. If a channel is not here, the renderer cannot do it.
 */

import type { AppController } from '../app/AppController'
import { IpcRouter } from './router'

export function registerHandlers(controller: AppController): IpcRouter {
  const router = new IpcRouter()

  router.handle('app:bootstrap', () => controller.bootstrap())
  router.handle('app:quit', () => controller.quit())

  router.handle('settings:get', () => controller.getSettings())
  router.handle('settings:patch', (patch) => controller.patchSettings(patch))
  router.handle('settings:reset', () => controller.resetSettings())
  router.handle('settings:export', () => controller.exportSettings())
  router.handle('settings:import', () => controller.importSettings())

  router.handle('reminder:triggerNow', ({ kind }) => controller.triggerReminder(kind))
  router.handle('reminder:complete', ({ kind }) => controller.completeReminder(kind))
  router.handle('reminder:skip', ({ kind }) => controller.skipReminder(kind))
  router.handle('reminder:snooze', ({ kind, minutes }) => controller.snoozeReminder(kind, minutes))
  router.handle('reminder:restartInterval', ({ kind }) => controller.restartReminderInterval(kind))
  router.handle('reminder:setEnabled', ({ kind, enabled }) => controller.setReminderEnabled(kind, enabled))

  router.handle('focus:start', (request) => controller.startFocus(request))
  router.handle('focus:pause', () => controller.pauseFocus())
  router.handle('focus:resume', () => controller.resumeFocus())
  router.handle('focus:stop', () => controller.stopFocus())
  router.handle('focus:extend', ({ minutes }) => controller.extendFocus(minutes))
  router.handle('focus:skipPhase', () => controller.skipFocusPhase())

  router.handle('stats:range', ({ from, to }) => controller.getRange(from, to))
  router.handle('stats:recentDays', ({ days }) => controller.getRecentDays(days))
  router.handle('stats:achievements', () => controller.getAchievements())
  router.handle('stats:lifetime', () => controller.getLifetime())
  router.handle('stats:clear', () => controller.clearStats())

  router.handle('dnd:set', ({ enabled, forMinutes }) => controller.setDoNotDisturb(enabled, forMinutes))

  router.handle('mascot:setEnabled', ({ enabled }) => controller.setMascotEnabled(enabled))
  router.handle('mascot:setInteractive', ({ interactive }) => controller.setMascotInteractive(interactive))
  router.handle('mascot:poke', () => controller.pokeMascot())
  router.handle('mascot:retired', () => controller.reportMascotRetired())

  router.handle('sound:preview', (request) => controller.previewSound(request))
  router.handle('sound:pickCustomFile', () => controller.pickCustomSound())

  router.handle('window:minimize', () => controller.minimizeWindow())
  router.handle('window:toggleMaximize', () => controller.toggleMaximizeWindow())
  router.handle('window:hide', () => controller.hideWindow())
  router.handle('window:isMaximized', () => controller.isWindowMaximized())
  router.handle('system:displays', () => controller.listDisplays())
  router.handle('system:openExternal', ({ url }) => controller.openExternal(url))
  router.handle('system:openDataFolder', () => controller.openDataFolder())

  router.handle('update:status', () => controller.getUpdateStatus())
  router.handle('update:check', () => controller.checkForUpdates())

  return router
}
