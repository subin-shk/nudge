/**
 * Mascot settings, with a live preview.
 *
 * The preview renders the same `MascotCharacter` component the desktop window
 * uses, driven by the settings being edited — so size, skin and motion changes
 * are visible before the user commits to having them on their desktop.
 */

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { MascotAnimation, MascotSkinId, MascotVisibility } from '@shared/types'
import type { DisplayInfo } from '@shared/ipc'
import { LIMITS } from '@shared/defaults'
import { Button, Card, CardHeader, Field, SegmentedControl, Select, Slider, Switch } from '../../components/ui'
import { MascotCharacter } from '../mascot/MascotCharacter'
import { MASCOT_SKIN_LIST, getSkin } from '../mascot/skins'
import { usePatchSettings, useSettings } from '../../store/useAppStore'
import { useTranslator } from '../../i18n/useTranslator'
import styles from './settings.module.css'
import mascotStyles from '../mascot/mascot.module.css'

/** Animations the preview cycles through when the user clicks it. */
const PREVIEW_ANIMATIONS: MascotAnimation[] = ['idle', 'wave', 'jump', 'stretch', 'drink', 'celebrate', 'sleep']

export function MascotSettingsSection(): JSX.Element {
  const t = useTranslator()
  const settings = useSettings()
  const patch = usePatchSettings()
  const mascot = settings.mascot

  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [blinking, setBlinking] = useState(false)

  useEffect(() => {
    void window.nudge.system.displays().then(setDisplays)
  }, [])

  // The preview blinks too — a still mascot in the preview looks broken.
  useEffect(() => {
    const timer = setInterval(() => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), 130)
    }, 3800)
    return () => clearInterval(timer)
  }, [])

  const previewAnimation = PREVIEW_ANIMATIONS[previewIndex % PREVIEW_ANIMATIONS.length]!

  return (
    <>
      <Card>
        <CardHeader
          title={t('settings.mascot.preview')}
          icon="mascot"
          actions={
            <Button size="sm" icon="sparkle" onClick={() => setPreviewIndex((index) => index + 1)}>
              {t('common.preview')}
            </Button>
          }
        />
        <div
          className={clsx(styles.mascotPreview, mascotStyles[previewAnimation], blinking && mascotStyles.blinking)}
          onClick={() => setPreviewIndex((index) => index + 1)}
          role="presentation"
        >
          <MascotCharacter
            skin={getSkin(mascot.skin)}
            size={Math.min(mascot.size, 150)}
            animation={settings.general.reducedMotion ? 'idle' : previewAnimation}
            blinking={blinking}
            facing={1}
          />
        </div>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <CardHeader title={t('settings.section.mascot')} icon="settings" />

        <Field label={t('settings.mascot.enabled')}>
          <Switch
            label={t('settings.mascot.enabled')}
            checked={mascot.enabled}
            onChange={(enabled) => void patch({ mascot: { enabled } })}
          />
        </Field>

        <Field
          label={t('settings.mascot.visibility')}
          hint={t(
            mascot.visibility === 'always' ? 'settings.mascot.visibility.always.desc' : 'settings.mascot.visibility.onAlert.desc'
          )}
          disabled={!mascot.enabled}
        >
          <SegmentedControl<MascotVisibility>
            label={t('settings.mascot.visibility')}
            value={mascot.visibility}
            onChange={(visibility) => void patch({ mascot: { visibility } })}
            options={[
              { value: 'always', label: t('settings.mascot.visibility.always') },
              { value: 'onAlert', label: t('settings.mascot.visibility.onAlert') }
            ]}
          />
        </Field>

        <Field label={t('settings.mascot.skin')} stacked disabled={!mascot.enabled}>
          <div className={styles.skinRow}>
            {MASCOT_SKIN_LIST.map((skin) => (
              <button
                key={skin.id}
                type="button"
                aria-label={t(skin.labelKey)}
                title={t(skin.labelKey)}
                className={clsx(styles.accentDot, mascot.skin === skin.id && styles.accentDotActive)}
                style={{ background: skin.body, boxShadow: `inset 0 0 0 2px ${skin.accent}` }}
                onClick={() => void patch({ mascot: { skin: skin.id as MascotSkinId } })}
              />
            ))}
          </div>
        </Field>

        <Field label={t('settings.mascot.size')} disabled={!mascot.enabled}>
          <Slider
            label={t('settings.mascot.size')}
            value={mascot.size}
            min={LIMITS.mascotSize.min}
            max={LIMITS.mascotSize.max}
            step={LIMITS.mascotSize.step}
            onChange={(size) => void patch({ mascot: { size } })}
            format={(value) => `${value} px`}
          />
        </Field>

        <Field label={t('settings.mascot.speed')} disabled={!mascot.enabled}>
          <Slider
            label={t('settings.mascot.speed')}
            value={mascot.speed}
            min={LIMITS.mascotSpeed.min}
            max={LIMITS.mascotSpeed.max}
            step={LIMITS.mascotSpeed.step}
            onChange={(speed) => void patch({ mascot: { speed } })}
            format={(value) => `${value.toFixed(1)}×`}
          />
        </Field>

        <Field label={t('settings.mascot.display')} disabled={!mascot.enabled}>
          <Select
            label={t('settings.mascot.display')}
            wide
            value={mascot.displayId === null ? 'primary' : String(mascot.displayId)}
            options={[
              { value: 'primary', label: t('settings.mascot.display.primary') },
              ...displays.map((display) => ({
                value: String(display.id),
                label: `${display.label} · ${display.bounds.width}×${display.bounds.height}`
              }))
            ]}
            onChange={(value) => void patch({ mascot: { displayId: value === 'primary' ? null : Number(value) } })}
          />
        </Field>

        <Field label={t('settings.mascot.edge')} disabled={!mascot.enabled}>
          <Select
            label={t('settings.mascot.edge')}
            value={mascot.edge}
            options={[
              { value: 'bottom', label: t('settings.mascot.edge.bottom') },
              { value: 'top', label: t('settings.mascot.edge.top') }
            ]}
            onChange={(edge) => void patch({ mascot: { edge } })}
          />
        </Field>

        <Field label={t('settings.mascot.offset')} disabled={!mascot.enabled}>
          <Slider
            label={t('settings.mascot.offset')}
            value={mascot.offset}
            min={LIMITS.mascotOffset.min}
            max={LIMITS.mascotOffset.max}
            step={LIMITS.mascotOffset.step}
            onChange={(offset) => void patch({ mascot: { offset } })}
            format={(value) => `${value} px`}
          />
        </Field>

        <Field label={t('settings.mascot.homeX')} disabled={!mascot.enabled}>
          <Slider
            label={t('settings.mascot.homeX')}
            value={mascot.homeX}
            min={0}
            max={1}
            step={0.02}
            onChange={(homeX) => void patch({ mascot: { homeX } })}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        </Field>

        <Field label={t('settings.mascot.clickThrough')} hint={t('settings.mascot.clickThrough.desc')} disabled={!mascot.enabled}>
          <Switch
            label={t('settings.mascot.clickThrough')}
            checked={mascot.clickThrough}
            onChange={(clickThrough) => void patch({ mascot: { clickThrough } })}
          />
        </Field>

        <Field label={t('settings.mascot.speechBubbles')} disabled={!mascot.enabled}>
          <Switch
            label={t('settings.mascot.speechBubbles')}
            checked={mascot.speechBubbles}
            onChange={(speechBubbles) => void patch({ mascot: { speechBubbles } })}
          />
        </Field>

        <Field label={t('settings.mascot.sleepAfter')} disabled={!mascot.enabled}>
          <Slider
            label={t('settings.mascot.sleepAfter')}
            value={mascot.sleepAfterIdleMinutes}
            min={LIMITS.sleepAfterIdleMinutes.min}
            max={LIMITS.sleepAfterIdleMinutes.max}
            step={LIMITS.sleepAfterIdleMinutes.step}
            onChange={(sleepAfterIdleMinutes) => void patch({ mascot: { sleepAfterIdleMinutes } })}
            format={(value) => `${value} ${t('common.minutesShort')}`}
          />
        </Field>
      </Card>
    </>
  )
}
