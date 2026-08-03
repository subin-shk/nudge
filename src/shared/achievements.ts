/**
 * Achievement badges — definitions plus a pure evaluator.
 *
 * Keeping evaluation pure (metrics in → progress out) means the same function
 * powers the live UI, the unlock notification, and any future backfill of
 * historical data, with no risk of the three disagreeing.
 *
 * Tuning principle: the first badge in every track is reachable on day one.
 * A reward schedule that starts at "50 hours" teaches users the badges are not
 * for them.
 */

import type { AchievementDefinition, AchievementProgress } from './types/activity'

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'focus-first-hour', titleKey: 'ach.focusFirstHour.title', descriptionKey: 'ach.focusFirstHour.desc', icon: 'timer', tier: 'bronze', metric: 'focusHoursTotal', threshold: 1 },
  { id: 'focus-10h', titleKey: 'ach.focus10h.title', descriptionKey: 'ach.focus10h.desc', icon: 'timer', tier: 'silver', metric: 'focusHoursTotal', threshold: 10 },
  { id: 'focus-100h', titleKey: 'ach.focus100h.title', descriptionKey: 'ach.focus100h.desc', icon: 'trophy', tier: 'gold', metric: 'focusHoursTotal', threshold: 100 },

  { id: 'eyes-10', titleKey: 'ach.eyes10.title', descriptionKey: 'ach.eyes10.desc', icon: 'eye', tier: 'bronze', metric: 'completedTotal', kind: 'eyeCare', threshold: 10 },
  { id: 'eyes-250', titleKey: 'ach.eyes250.title', descriptionKey: 'ach.eyes250.desc', icon: 'eye', tier: 'silver', metric: 'completedTotal', kind: 'eyeCare', threshold: 250 },
  { id: 'eyes-1000', titleKey: 'ach.eyes1000.title', descriptionKey: 'ach.eyes1000.desc', icon: 'trophy', tier: 'gold', metric: 'completedTotal', kind: 'eyeCare', threshold: 1000 },

  { id: 'water-10', titleKey: 'ach.water10.title', descriptionKey: 'ach.water10.desc', icon: 'droplet', tier: 'bronze', metric: 'completedTotal', kind: 'water', threshold: 10 },
  { id: 'water-200', titleKey: 'ach.water200.title', descriptionKey: 'ach.water200.desc', icon: 'droplet', tier: 'silver', metric: 'completedTotal', kind: 'water', threshold: 200 },
  { id: 'water-750', titleKey: 'ach.water750.title', descriptionKey: 'ach.water750.desc', icon: 'trophy', tier: 'gold', metric: 'completedTotal', kind: 'water', threshold: 750 },

  { id: 'streak-3', titleKey: 'ach.streak3.title', descriptionKey: 'ach.streak3.desc', icon: 'flame', tier: 'bronze', metric: 'streakDays', threshold: 3 },
  { id: 'streak-14', titleKey: 'ach.streak14.title', descriptionKey: 'ach.streak14.desc', icon: 'flame', tier: 'silver', metric: 'streakDays', threshold: 14 },
  { id: 'streak-60', titleKey: 'ach.streak60.title', descriptionKey: 'ach.streak60.desc', icon: 'flame', tier: 'gold', metric: 'streakDays', threshold: 60 },
  { id: 'weeks-4', titleKey: 'ach.weeks4.title', descriptionKey: 'ach.weeks4.desc', icon: 'calendar', tier: 'silver', metric: 'streakWeeks', threshold: 4 },

  { id: 'perfect-1', titleKey: 'ach.perfect1.title', descriptionKey: 'ach.perfect1.desc', icon: 'target', tier: 'bronze', metric: 'perfectDays', threshold: 1 },
  { id: 'perfect-10', titleKey: 'ach.perfect10.title', descriptionKey: 'ach.perfect10.desc', icon: 'target', tier: 'silver', metric: 'perfectDays', threshold: 10 },
  { id: 'perfect-30', titleKey: 'ach.perfect30.title', descriptionKey: 'ach.perfect30.desc', icon: 'trophy', tier: 'gold', metric: 'perfectDays', threshold: 30 }
]

/** Everything the evaluator needs, computed once by the stats service. */
export interface AchievementMetrics {
  focusSecondsTotal: number
  /** kind → lifetime completed count. */
  completedTotals: Record<string, number>
  streakDays: number
  streakWeeks: number
  /** Days on which every enabled reminder hit its daily goal. */
  perfectDays: number
}

function metricValue(definition: AchievementDefinition, metrics: AchievementMetrics): number {
  switch (definition.metric) {
    case 'focusHoursTotal':
      return metrics.focusSecondsTotal / 3600
    case 'completedTotal':
      return definition.kind
        ? (metrics.completedTotals[definition.kind] ?? 0)
        : Object.values(metrics.completedTotals).reduce((sum, n) => sum + n, 0)
    case 'streakDays':
      return metrics.streakDays
    case 'streakWeeks':
      return metrics.streakWeeks
    case 'perfectDays':
      return metrics.perfectDays
  }
}

/**
 * Merge current metrics with previously-persisted unlock timestamps.
 *
 * `unlockedAt` is sticky: once earned, a badge is never revoked, even if the
 * underlying metric later dips (a broken streak must not delete the trophy).
 */
export function evaluateAchievements(
  metrics: AchievementMetrics,
  alreadyUnlocked: Record<string, number>,
  now: number = Date.now()
): AchievementProgress[] {
  return ACHIEVEMENTS.map((definition) => {
    const value = metricValue(definition, metrics)
    const previous = alreadyUnlocked[definition.id] ?? null
    const unlockedAt = previous ?? (value >= definition.threshold ? now : null)
    return {
      id: definition.id,
      unlockedAt,
      value: Math.floor(value * 10) / 10,
      threshold: definition.threshold
    }
  })
}

export function getAchievementDefinition(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id)
}
