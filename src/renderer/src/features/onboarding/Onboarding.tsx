/**
 * First-run setup.
 *
 * Three screens, all skippable, and every choice has a sane default already
 * applied — so "Skip setup" leaves the user with a working app rather than an
 * unconfigured one. The only goal here is to make the two decisions that are
 * genuinely personal (which reminders, which look) before the first nudge fires.
 */

import { useState } from 'react'
import clsx from 'clsx'
import { Button, Card } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { MascotCharacter } from '../mascot/MascotCharacter'
import { getSkin } from '../mascot/skins'
import { THEME_ORDER, THEMES } from '../../theme/themes'
import { swatchVars } from '../settings/SettingsPage'
import { useReminderViews } from '../../hooks/useReminders'
import { usePatchSettings, useSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import settingsStyles from '../settings/settings.module.css'
import styles from './onboarding.module.css'

type Step = 'welcome' | 'reminders' | 'appearance' | 'mascot'

const ORDER: Step[] = ['welcome', 'reminders', 'appearance', 'mascot']

export function Onboarding(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()
  const views = useReminderViews()
  const [step, setStep] = useState<Step>('welcome')

  const index = ORDER.indexOf(step)
  const finish = (): void => void patch({ general: { onboardingCompleted: true } })

  return (
    <div className={styles.scrim}>
      <Card className={styles.panel}>
        <div className={styles.progress} aria-hidden="true">
          {ORDER.map((entry, position) => (
            <span key={entry} className={clsx(styles.progressDot, position <= index && styles.progressDotActive)} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className={styles.centered}>
            <div className={styles.hero}>
              <MascotCharacter skin={getSkin(settings.mascot.skin)} size={128} animation="wave" blinking={false} facing={1} />
            </div>
            <h1 className={styles.title}>{t('onboarding.welcome.title')}</h1>
            <p className={styles.body}>{t('onboarding.welcome.body')}</p>
          </div>
        )}

        {step === 'reminders' && (
          <div>
            <h2 className={styles.title}>{t('onboarding.step.reminders')}</h2>
            <div className={styles.choiceList}>
              {views.map((view) => (
                <button
                  key={view.definition.kind}
                  type="button"
                  className={clsx(styles.choice, view.config.enabled && styles.choiceActive)}
                  onClick={() => void window.nudge.reminders.setEnabled(view.definition.kind, !view.config.enabled)}
                >
                  <span className={styles.choiceEmoji}>{view.definition.emoji}</span>
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{view.title}</span>
                    <span className={styles.choiceHint}>{view.message}</span>
                  </span>
                  <span className={styles.choiceCheck}>{view.config.enabled && <Icon name="check" size={15} />}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'appearance' && (
          <div>
            <h2 className={styles.title}>{t('onboarding.step.appearance')}</h2>
            <div className={settingsStyles.themeGrid}>
              {(['system', ...THEME_ORDER] as const).map((id) => {
                const theme = id === 'system' ? null : THEMES[id]
                const active = settings.general.theme === id
                return (
                  <button
                    key={id}
                    type="button"
                    className={clsx(settingsStyles.themeCard, active && settingsStyles.themeCardActive)}
                    onClick={() => void patch({ general: { theme: id } })}
                    style={swatchVars(
                      theme ? theme.preview[0] : 'linear-gradient(90deg, #f5f7fb 0 50%, #14161c 50% 100%)',
                      theme ? theme.preview[1] : 'rgba(128,128,128,0.35)',
                      theme ? theme.preview[2] : '#6d8dff'
                    )}
                  >
                    <span className={settingsStyles.themeSwatch}>
                      <span className={settingsStyles.themeSwatchCard} />
                      <span className={settingsStyles.themeSwatchAccent} />
                    </span>
                    <span className={settingsStyles.themeName}>
                      {t(theme ? theme.labelKey : 'theme.system')}
                      {active && <Icon name="check" size={14} />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 'mascot' && (
          <div className={styles.centered}>
            <div className={styles.hero}>
              <MascotCharacter skin={getSkin(settings.mascot.skin)} size={128} animation="jump" blinking={false} facing={1} />
            </div>
            <h2 className={styles.title}>{t('onboarding.step.mascot')}</h2>
            <p className={styles.body}>{t('onboarding.step.mascotBody')}</p>
            {/* Three-way rather than on/off: "only when it has something to say"
                is the option most people actually want, and burying it in
                Settings means they never find it. */}
            <div className={styles.mascotChoice}>
              <Button
                variant={settings.mascot.enabled && settings.mascot.visibility === 'always' ? 'primary' : 'secondary'}
                icon="mascot"
                onClick={() => void patch({ mascot: { enabled: true, visibility: 'always' } })}
              >
                {t('settings.mascot.visibility.always')}
              </Button>
              <Button
                variant={settings.mascot.enabled && settings.mascot.visibility === 'onAlert' ? 'primary' : 'secondary'}
                icon="bell"
                onClick={() => void patch({ mascot: { enabled: true, visibility: 'onAlert' } })}
              >
                {t('settings.mascot.visibility.onAlert')}
              </Button>
              <Button
                variant={!settings.mascot.enabled ? 'primary' : 'secondary'}
                icon="close"
                onClick={() => void patch({ mascot: { enabled: false } })}
              >
                {t('common.off')}
              </Button>
            </div>
          </div>
        )}

        <footer className={styles.actions}>
          <Button variant="ghost" onClick={finish}>
            {t('onboarding.skip')}
          </Button>
          <span className={styles.actionsSpacer} />
          {index > 0 && (
            <Button onClick={() => setStep(ORDER[index - 1]!)}>
              {t('common.back')}
            </Button>
          )}
          {index < ORDER.length - 1 ? (
            <Button variant="primary" trailingIcon="chevronRight" onClick={() => setStep(ORDER[index + 1]!)}>
              {index === 0 ? t('onboarding.start') : t('common.next')}
            </Button>
          ) : (
            <Button variant="primary" icon="check" onClick={finish}>
              {t('common.finish')}
            </Button>
          )}
        </footer>
      </Card>
    </div>
  )
}
