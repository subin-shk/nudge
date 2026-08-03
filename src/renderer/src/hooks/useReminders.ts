/**
 * Joins the three sources of truth about a reminder into one view model:
 *
 *   catalog definition  →  what it *is*   (name, icon, emoji, capabilities)
 *   settings            →  how it is configured
 *   runtime             →  what it is doing right now
 *
 * Every screen that lists reminders consumes this, which is what keeps the
 * dashboard, the reminders screen and the settings screen automatically in sync
 * when a new reminder kind (or a plugin) appears.
 */

import { useMemo } from 'react'
import type { ReminderRuntime, ReminderSettings } from '@shared/types'
import { listReminderDefinitions, type ReminderDefinition } from '@shared/reminders/catalog'
import { useAppStore } from '../store/useAppStore'
import { useTranslator } from '../i18n/useTranslator'

export interface ReminderView {
  definition: ReminderDefinition
  config: ReminderSettings
  runtime: ReminderRuntime | undefined
  /** Localised display name. */
  title: string
  shortTitle: string
  /** The effective message: custom text if set, else the localised default. */
  message: string
}

export function useReminderViews(options: { onlyEnabled?: boolean } = {}): ReminderView[] {
  const settings = useAppStore((state) => state.settings)
  const reminders = useAppStore((state) => state.runtime.reminders)
  const t = useTranslator()
  const onlyEnabled = options.onlyEnabled ?? false

  return useMemo(() => {
    const views: ReminderView[] = []

    for (const definition of listReminderDefinitions()) {
      const config = settings.reminders[definition.kind]
      // A definition with no settings record means the catalog changed since
      // settings were normalised — skip rather than render a broken card.
      if (!config) continue
      if (onlyEnabled && !config.enabled) continue

      views.push({
        definition,
        config,
        runtime: reminders[definition.kind],
        title: t(definition.titleKey),
        shortTitle: t(definition.shortTitleKey),
        message: config.message.trim().length > 0 ? config.message : t(definition.defaultMessageKey)
      })
    }

    return views
  }, [settings, reminders, t, onlyEnabled])
}

/** A single reminder's view model, or undefined when the kind is unknown. */
export function useReminderView(kind: string): ReminderView | undefined {
  const views = useReminderViews()
  return views.find((view) => view.definition.kind === kind)
}
