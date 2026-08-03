/**
 * The audio host renderer.
 *
 * Runs in a hidden 1×1 window whose only job is to own an `AudioContext`. See
 * SoundHostWindow.ts for why the audio engine cannot live in the dashboard.
 *
 * Built-in sounds are synthesised from the parameter sets in shared/sounds.ts:
 * an oscillator per partial, each with its own gain envelope, optionally a
 * low-pass filter, a pitch glide, or a tremolo LFO. Nodes are created per play
 * and left to be collected when they stop — that is the intended Web Audio
 * lifecycle for one-shot sounds, and it keeps latency at a single frame.
 *
 * Custom user files take the simpler `<audio>` path: no decoding, no buffer
 * cache, and the OS handles every codec it already knows.
 */

import type { SoundRequest } from '@shared/ipc'
import type { ToneSpec } from '@shared/sounds'
import { getSoundPreset } from '@shared/sounds'

let context: AudioContext | null = null
/** Master gain for the whole host; per-request volume rides on top. */
let masterGain: GainNode | null = null

function ensureContext(): { context: AudioContext; master: GainNode } {
  if (!context || !masterGain) {
    context = new AudioContext({ latencyHint: 'interactive' })
    masterGain = context.createGain()
    masterGain.gain.value = 1
    masterGain.connect(context.destination)
  }
  // Chromium may park the context after a period of silence.
  if (context.state === 'suspended') void context.resume()
  return { context, master: masterGain }
}

/** Schedule one partial of a synthesised sound. */
function playTone(audio: AudioContext, destination: AudioNode, tone: ToneSpec, startAt: number, volume: number): void {
  const oscillator = audio.createOscillator()
  oscillator.type = tone.shape

  const begin = startAt + tone.at
  const end = begin + tone.duration

  oscillator.frequency.setValueAtTime(tone.freq, begin)
  if (tone.sweepTo !== undefined) {
    // Exponential ramps cannot pass through zero, hence the floor.
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, tone.sweepTo), end)
  }

  const gain = audio.createGain()
  const peak = Math.max(0.0001, tone.gain * volume)
  gain.gain.setValueAtTime(0.0001, begin)
  gain.gain.exponentialRampToValueAtTime(peak, begin + tone.attack)
  // Exponential decay to near-silence is what makes a synthesised tone read as
  // a struck object rather than a beep.
  gain.gain.exponentialRampToValueAtTime(0.0001, end)

  let node: AudioNode = oscillator

  if (tone.lowpass !== undefined) {
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(tone.lowpass, begin)
    node.connect(filter)
    node = filter
  }

  node.connect(gain)
  gain.connect(destination)

  if (tone.tremolo !== undefined) {
    const lfo = audio.createOscillator()
    const lfoGain = audio.createGain()
    lfo.frequency.value = tone.tremolo
    lfoGain.gain.value = peak * 0.22
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    lfo.start(begin)
    lfo.stop(end)
  }

  oscillator.start(begin)
  oscillator.stop(end + 0.02)
}

function playPreset(request: SoundRequest): void {
  const preset = getSoundPreset(request.soundId)
  if (!preset) return

  const { context: audio, master } = ensureContext()
  // A few milliseconds of lead time so the first partial is not clipped by the
  // scheduler running slightly behind `currentTime`.
  const startAt = audio.currentTime + 0.02

  for (const tone of preset.tones) {
    playTone(audio, master, tone, startAt, request.volume)
  }
}

/** Convert an absolute OS path into a `file://` URL an <audio> element accepts. */
function toFileUrl(path: string): string {
  const normalised = path.replace(/\\/g, '/')
  const withSlash = normalised.startsWith('/') ? normalised : `/${normalised}`
  return `file://${encodeURI(withSlash)}`
}

function playCustom(request: SoundRequest): void {
  if (!request.customPath) return

  const element = new Audio(toFileUrl(request.customPath))
  element.volume = Math.max(0, Math.min(1, request.volume))
  void element.play().catch((error: unknown) => {
    // A missing or unsupported file must never break the reminder itself; the
    // toast and the mascot have already been delivered by this point.
    console.warn('[nudge:sound] custom sound failed to play', request.customPath, error)
  })
}

window.nudge.on.soundPlay((request: SoundRequest) => {
  try {
    if (request.soundId === 'none') return
    if (request.soundId === 'custom') playCustom(request)
    else playPreset(request)
  } catch (error) {
    console.warn('[nudge:sound] playback failed', error)
  }
})

// Signals to anyone watching the window that the host is alive.
document.title = 'Nudge Audio Host'
