/**
 * Notification sound presets.
 *
 * Nudge synthesises its built-in sounds with Web Audio instead of shipping WAV
 * files. Reasons this is the better trade for a wellness app:
 *
 *   • Zero binary assets — the whole sound design is reviewable in a diff.
 *   • Every sound is a couple of hundred bytes of parameters, so the installer
 *     stays small and the audio host has nothing to decode or cache.
 *   • Tuning is a number change, not an art round-trip.
 *
 * A user who wants their own audio sets `soundId: 'custom'` and a file path;
 * the audio host decodes that through the normal `decodeAudioData` route.
 *
 * These are deliberately *soft* sounds. A reminder you resent hearing is a
 * reminder you will switch off within a week.
 */

import type { SoundId } from './types/settings'

export type ToneShape = 'sine' | 'triangle' | 'square' | 'sawtooth'

export interface ToneSpec {
  /** Start frequency in Hz. */
  freq: number
  /** Optional exponential glide target — this is what makes a water droplet. */
  sweepTo?: number
  /** Offset from the start of the sound, in seconds. */
  at: number
  /** Total length including the release tail, in seconds. */
  duration: number
  /** Peak gain for this partial, 0..1, before per-feature volume. */
  gain: number
  shape: ToneShape
  /** Attack time in seconds. Sub-10ms reads as a "click" onset. */
  attack: number
  /** Low-pass cutoff in Hz; omit for an unfiltered tone. */
  lowpass?: number
  /** Amplitude wobble in Hz, for singing-bowl style shimmer. */
  tremolo?: number
}

export interface SoundPreset {
  id: Exclude<SoundId, 'custom' | 'none'>
  labelKey: string
  /** Longest tail across partials — used to schedule teardown. */
  lengthSeconds: number
  tones: ToneSpec[]
}

/** E6 + B6, a soft two-note bell. The default for eye care. */
const chime: SoundPreset = {
  id: 'chime',
  labelKey: 'sound.chime',
  lengthSeconds: 1.4,
  tones: [
    { freq: 1318.51, at: 0, duration: 1.1, gain: 0.5, shape: 'sine', attack: 0.006 },
    { freq: 1975.53, at: 0.09, duration: 1.3, gain: 0.28, shape: 'sine', attack: 0.006 },
    // A quiet octave below adds body without making it feel like an alarm.
    { freq: 659.26, at: 0, duration: 0.9, gain: 0.14, shape: 'sine', attack: 0.01 }
  ]
}

/** Wooden, warm, two-note rise. */
const marimba: SoundPreset = {
  id: 'marimba',
  labelKey: 'sound.marimba',
  lengthSeconds: 0.9,
  tones: [
    { freq: 523.25, at: 0, duration: 0.42, gain: 0.5, shape: 'triangle', attack: 0.004, lowpass: 2600 },
    { freq: 783.99, at: 0.13, duration: 0.55, gain: 0.42, shape: 'triangle', attack: 0.004, lowpass: 3000 },
    { freq: 1046.5, at: 0.13, duration: 0.3, gain: 0.1, shape: 'sine', attack: 0.004 }
  ]
}

/** The classic "plip": a fast downward pitch sweep plus a tiny high tick. */
const droplet: SoundPreset = {
  id: 'droplet',
  labelKey: 'sound.droplet',
  lengthSeconds: 0.6,
  tones: [
    { freq: 1500, sweepTo: 420, at: 0, duration: 0.24, gain: 0.55, shape: 'sine', attack: 0.002 },
    { freq: 2600, at: 0, duration: 0.05, gain: 0.12, shape: 'sine', attack: 0.001 },
    { freq: 900, sweepTo: 300, at: 0.16, duration: 0.3, gain: 0.2, shape: 'sine', attack: 0.004 }
  ]
}

/** Long, resonant, unhurried. */
const bell: SoundPreset = {
  id: 'bell',
  labelKey: 'sound.bell',
  lengthSeconds: 2.6,
  tones: [
    { freq: 880, at: 0, duration: 2.4, gain: 0.42, shape: 'sine', attack: 0.008 },
    { freq: 1320, at: 0, duration: 1.8, gain: 0.16, shape: 'sine', attack: 0.008 },
    { freq: 2640, at: 0, duration: 0.9, gain: 0.07, shape: 'sine', attack: 0.006 },
    { freq: 440, at: 0, duration: 2.2, gain: 0.12, shape: 'sine', attack: 0.02 }
  ]
}

/** Short filtered saw — a guitar-ish pluck for movement reminders. */
const pluck: SoundPreset = {
  id: 'pluck',
  labelKey: 'sound.pluck',
  lengthSeconds: 0.5,
  tones: [
    { freq: 392, at: 0, duration: 0.34, gain: 0.34, shape: 'sawtooth', attack: 0.003, lowpass: 1500 },
    { freq: 587.33, at: 0.06, duration: 0.34, gain: 0.24, shape: 'sawtooth', attack: 0.003, lowpass: 1800 }
  ]
}

/** Meditation bowl: low, shimmering, for the end of a focus session. */
const bowl: SoundPreset = {
  id: 'bowl',
  labelKey: 'sound.bowl',
  lengthSeconds: 3.4,
  tones: [
    { freq: 220, at: 0, duration: 3.2, gain: 0.4, shape: 'sine', attack: 0.05, tremolo: 3.2 },
    { freq: 330, at: 0, duration: 2.8, gain: 0.2, shape: 'sine', attack: 0.08, tremolo: 4.1 },
    { freq: 550, at: 0.1, duration: 2.0, gain: 0.09, shape: 'sine', attack: 0.12 }
  ]
}

/** Almost subliminal — the blink reminder's whole personality. */
const blip: SoundPreset = {
  id: 'blip',
  labelKey: 'sound.blip',
  lengthSeconds: 0.18,
  tones: [{ freq: 1046.5, at: 0, duration: 0.12, gain: 0.22, shape: 'sine', attack: 0.004 }]
}

export const SOUND_PRESETS: Record<SoundPreset['id'], SoundPreset> = {
  chime,
  marimba,
  droplet,
  bell,
  pluck,
  bowl,
  blip
}

export const SOUND_PRESET_LIST: SoundPreset[] = [chime, marimba, droplet, bell, pluck, bowl, blip]

export function getSoundPreset(id: SoundId): SoundPreset | null {
  if (id === 'none' || id === 'custom') return null
  return SOUND_PRESETS[id] ?? null
}

/** Extensions the "custom sound" file picker accepts. */
export const CUSTOM_SOUND_EXTENSIONS = ['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'webm']
