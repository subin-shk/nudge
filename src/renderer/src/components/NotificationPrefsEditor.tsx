/**
 * The per-feature notification editor.
 *
 * Exists once and is reused by every reminder *and* the focus timer, which is
 * what makes "each reminder has independent controls" true by construction
 * rather than by five copies of the same four rows.
 *
 * The volume slider previews on release rather than on every input event —
 * dragging a slider that fires a chime per pixel is genuinely unpleasant.
 */

import type { NotificationPrefs, SoundId } from '@shared/types'
import { SOUND_PRESET_LIST } from '@shared/sounds'
import { LIMITS } from '@shared/defaults'
import { Field, IconButton, Select, Slider, Switch } from './ui'
import { useTranslator } from '../i18n/useTranslator'

export interface NotificationPrefsEditorProps {
  prefs: NotificationPrefs
  onChange: (patch: Partial<NotificationPrefs>) => void
  /** Hide the mascot row for features the mascot cannot deliver. */
  showMascot?: boolean
  disabled?: boolean
}

export function NotificationPrefsEditor({
  prefs,
  onChange,
  showMascot = true,
  disabled
}: NotificationPrefsEditorProps): JSX.Element {
  const t = useTranslator()

  const soundOptions = [
    ...SOUND_PRESET_LIST.map((preset) => ({ value: preset.id as SoundId, label: t(preset.labelKey) })),
    { value: 'none' as SoundId, label: t('sound.none') },
    { value: 'custom' as SoundId, label: t('sound.custom') }
  ]

  const preview = (): void => {
    void window.nudge.sound.preview(prefs.soundId, prefs.volume, prefs.customSoundPath)
  }

  const chooseCustomFile = async (): Promise<void> => {
    const { path } = await window.nudge.sound.pickCustomFile()
    // Cancelling the dialog must not silently switch the sound to a broken
    // 'custom' with no file behind it.
    if (path) onChange({ soundId: 'custom', customSoundPath: path })
  }

  return (
    <>
      <Field label={t('settings.notifications.desktop')} disabled={disabled}>
        <Switch
          label={t('settings.notifications.desktop')}
          checked={prefs.desktop}
          onChange={(desktop) => onChange({ desktop })}
        />
      </Field>

      <Field label={t('settings.notifications.sound')} disabled={disabled}>
        <Switch label={t('settings.notifications.sound')} checked={prefs.sound} onChange={(sound) => onChange({ sound })} />
      </Field>

      <Field
        label={t('settings.notifications.chooseSound')}
        hint={prefs.soundId === 'custom' ? (prefs.customSoundPath ?? undefined) : undefined}
        disabled={disabled || !prefs.sound}
      >
        <Select
          label={t('settings.notifications.chooseSound')}
          value={prefs.soundId}
          options={soundOptions}
          onChange={(soundId) => {
            if (soundId === 'custom') void chooseCustomFile()
            else onChange({ soundId })
          }}
        />
        {prefs.soundId === 'custom' && (
          <IconButton icon="folder" label={t('sound.pickFile')} onClick={() => void chooseCustomFile()} />
        )}
        <IconButton icon="volume" label={t('common.preview')} onClick={preview} disabled={prefs.soundId === 'none'} />
      </Field>

      <Field label={t('settings.notifications.volume')} disabled={disabled || !prefs.sound}>
        <Slider
          label={t('settings.notifications.volume')}
          value={prefs.volume}
          min={LIMITS.volume.min}
          max={LIMITS.volume.max}
          step={LIMITS.volume.step}
          onChange={(volume) => onChange({ volume })}
          format={(value) => `${Math.round(value * 100)}%`}
        />
        <IconButton icon="play" label={t('common.preview')} onClick={preview} disabled={prefs.soundId === 'none'} />
      </Field>

      {showMascot && (
        <Field label={t('settings.notifications.mascot')} disabled={disabled}>
          <Switch
            label={t('settings.notifications.mascot')}
            checked={prefs.mascot}
            onChange={(mascot) => onChange({ mascot })}
          />
        </Field>
      )}
    </>
  )
}
