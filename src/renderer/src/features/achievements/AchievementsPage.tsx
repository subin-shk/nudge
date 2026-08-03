/**
 * Badges.
 *
 * Locked badges show real progress rather than a question mark: knowing you are
 * 7 of 10 eye breaks away from "Fresh Eyes" is motivating; a grey box is not.
 * Badges are grouped by tier so the achievable ones are read first.
 */

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { AchievementProgress, AchievementTier } from '@shared/types'
import { ACHIEVEMENTS } from '@shared/achievements'
import { Card, EmptyState, ProgressBar } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { useTranslator } from '../../i18n/useTranslator'
import { useRuntime } from '../../store/useAppStore'
import shell from '../../components/shell.module.css'
import styles from './achievements.module.css'

const TIER_ORDER: AchievementTier[] = ['bronze', 'silver', 'gold']

export function AchievementsPage(): JSX.Element {
  const t = useTranslator()
  const runtime = useRuntime()
  const [progress, setProgress] = useState<AchievementProgress[]>([])

  // Re-fetch whenever activity changes — `today` is the cheapest proxy for
  // "something happened" that the store already pushes.
  useEffect(() => {
    void window.nudge.stats.achievements().then(setProgress)
  }, [runtime.today, runtime.streak.current])

  const byId = new Map(progress.map((entry) => [entry.id, entry]))
  const unlocked = progress.filter((entry) => entry.unlockedAt !== null).length

  return (
    <>
      <header className={shell.pageHeader}>
        <div>
          <h1 className={shell.pageTitle}>{t('achievements.title')}</h1>
          <p className={shell.pageSubtitle}>
            {t('achievements.unlocked', { count: unlocked, total: ACHIEVEMENTS.length })}
          </p>
        </div>
      </header>

      {progress.length === 0 ? (
        <Card>
          <EmptyState icon="trophy" title={t('achievements.title')} body={t('stats.empty')} />
        </Card>
      ) : (
        TIER_ORDER.map((tier) => {
          const definitions = ACHIEVEMENTS.filter((definition) => definition.tier === tier)
          if (definitions.length === 0) return null

          return (
            <section key={tier} className={styles.tierSection}>
              <h2 className={styles.tierTitle}>
                <span className={clsx(styles.tierDot, styles[tier])} />
                {t(`achievements.tier.${tier}`)}
              </h2>

              <div className={styles.grid}>
                {definitions.map((definition) => {
                  const entry = byId.get(definition.id)
                  const isUnlocked = entry?.unlockedAt != null
                  const value = entry?.value ?? 0

                  return (
                    <Card
                      key={definition.id}
                      className={clsx(styles.badge, isUnlocked && styles.badgeUnlocked)}
                      hoverable
                    >
                      <div className={clsx(styles.medal, styles[tier], !isUnlocked && styles.medalLocked)}>
                        <Icon name={definition.icon} size={22} />
                      </div>

                      <div className={styles.badgeText}>
                        <div className={styles.badgeTitle}>{t(definition.titleKey)}</div>
                        <div className={styles.badgeDesc}>{t(definition.descriptionKey)}</div>
                      </div>

                      {isUnlocked ? (
                        <div className={styles.badgeEarned}>
                          <Icon name="check" size={13} />
                          {t('achievements.unlockedOn', {
                            date: new Date(entry!.unlockedAt!).toLocaleDateString()
                          })}
                        </div>
                      ) : (
                        <div className={styles.badgeProgress}>
                          <ProgressBar value={value} max={definition.threshold} />
                          <span className={styles.badgeProgressLabel}>
                            {value} / {definition.threshold}
                          </span>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </>
  )
}
