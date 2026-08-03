/**
 * The mascot's behaviour brain.
 *
 * A small autonomous agent with two modes:
 *
 *   auto        — wanders, idles, looks around, waves, sleeps when you are away.
 *   announcing  — a reminder is pending: walk to centre screen, knock, hold the
 *                 speech bubble until the user or the app dismisses it.
 *
 * Movement is integrated in a `requestAnimationFrame` loop and written straight
 * to a transform, so walking is frame-rate independent and never triggers a
 * React re-render per frame — position lives in a ref, not in state.
 *
 * Personality tuning is all in `WEIGHTS` and the delay ranges below. The intent
 * is a companion you notice a few times an hour, not a pet demanding attention.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MascotAnimation } from '@shared/types'

/** Chance of each idle-time action. Walking dominates; the rest are seasoning. */
const WEIGHTS: Array<{ animation: MascotAnimation; weight: number; durationMs: number }> = [
  { animation: 'walk', weight: 52, durationMs: 0 }, // ends on arrival, not on a timer
  { animation: 'lookAround', weight: 16, durationMs: 2400 },
  { animation: 'wave', weight: 10, durationMs: 2000 },
  { animation: 'stretch', weight: 10, durationMs: 1300 },
  { animation: 'jump', weight: 7, durationMs: 700 },
  { animation: 'idle', weight: 5, durationMs: 3000 }
]

/** Pause between autonomous actions. */
const IDLE_DELAY_MS = { min: 3200, max: 9000 }
/** Blink cadence — irregular on purpose. */
const BLINK_DELAY_MS = { min: 1800, max: 7000 }
const BLINK_DURATION_MS = 130

/** Reference walk speed in CSS px/second at the default 120px mascot size. */
const BASE_SPEED = 46
const REFERENCE_SIZE = 120

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min)

function pickWeighted(): (typeof WEIGHTS)[number] {
  const total = WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * total
  for (const entry of WEIGHTS) {
    roll -= entry.weight
    if (roll <= 0) return entry
  }
  return WEIGHTS[0]!
}

export interface MascotBrainConfig {
  /** Strip width in px — the mascot's world. */
  stageWidth: number
  size: number
  speed: number
  /** Resting position as a 0..1 fraction of the stage. */
  homeX: number
  sleepAfterIdleMinutes: number
  reducedMotion: boolean
  /**
   * 'always'  — wander, idle and sleep on the desktop between errands.
   * 'onAlert' — stay off stage; walk on only to deliver, then walk off and tell
   *             the main process to hide the window.
   */
  visibility: 'always' | 'onAlert'
}

export interface MascotBubble {
  message: string
  emoji: string
  /** Present while a timed break is counting down inside the bubble. */
  secondsRemaining: number | null
}

export interface MascotBrain {
  animation: MascotAnimation
  blinking: boolean
  facing: 1 | -1
  bubble: MascotBubble | null
  /** Attach to the moving container. */
  stageRef: React.RefObject<HTMLDivElement>
  /** Commands from the main process. */
  announce: (input: { message: string; emoji: string; animation: MascotAnimation; entrance?: boolean }) => void
  dismiss: (celebrate: boolean) => void
  perform: (animation: MascotAnimation, entrance?: boolean) => void
  setIdleSeconds: (seconds: number) => void
  setBubbleCountdown: (seconds: number | null) => void
  /** Called when the user clicks the character. */
  poke: () => void
}

export function useMascotBrain(config: MascotBrainConfig): MascotBrain {
  const [animation, setAnimation] = useState<MascotAnimation>('idle')
  const [blinking, setBlinking] = useState(false)
  const [facing, setFacing] = useState<1 | -1>(1)
  const [bubble, setBubble] = useState<MascotBubble | null>(null)

  const stageRef = useRef<HTMLDivElement>(null)
  const positionRef = useRef<number>(config.stageWidth * config.homeX)
  const targetRef = useRef<number | null>(null)
  const onArriveRef = useRef<(() => void) | null>(null)
  const modeRef = useRef<'auto' | 'announcing'>('auto')
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const asleepRef = useRef(false)

  // Config is read inside the rAF loop; a ref keeps the loop from restarting on
  // every settings change.
  const configRef = useRef(config)
  configRef.current = config

  const clearActionTimer = useCallback((): void => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current)
    actionTimerRef.current = null
  }, [])

  /** Move the DOM node. Called from the animation loop, never from render. */
  const applyPosition = useCallback((): void => {
    const node = stageRef.current
    if (!node) return
    node.style.transform = `translate3d(${positionRef.current}px, 0, 0)`
  }, [])

  const walkTo = useCallback(
    (x: number, onArrive?: () => void): void => {
      const { stageWidth, size } = configRef.current
      const half = size / 2
      const clamped = Math.max(half, Math.min(x, stageWidth - half))
      targetRef.current = clamped
      onArriveRef.current = onArrive ?? null
      setFacing(clamped >= positionRef.current ? 1 : -1)
      setAnimation('walk')
    },
    []
  )

  /**
   * Walk out of frame and tell the main process it is safe to hide the window.
   * On-alert mode only — in always-on mode the mascot has nowhere to go.
   */
  const exitStage = useCallback((): void => {
    const { stageWidth, size } = configRef.current
    // Leave by the nearer edge so the walk-out is never longer than it needs to be.
    const leavingLeft = positionRef.current < stageWidth / 2
    const target = leavingLeft ? -size : stageWidth + size

    targetRef.current = target
    onArriveRef.current = () => {
      setAnimation('idle')
      void window.nudge.mascot.reportRetired()
    }
    setFacing(leavingLeft ? -1 : 1)
    setAnimation('walk')
  }, [])

  const scheduleNextAction = useCallback(
    (delayMs?: number): void => {
      clearActionTimer()
      // On-alert mode has no idle life: the mascot is off stage between errands.
      if (configRef.current.visibility === 'onAlert') return

      actionTimerRef.current = setTimeout(
        () => {
          if (modeRef.current !== 'auto' || asleepRef.current) return

          const { stageWidth, size, reducedMotion } = configRef.current

          // Reduced motion: stand still, just blink. Still present, not moving.
          if (reducedMotion) {
            setAnimation('idle')
            scheduleNextAction(6000)
            return
          }

          const choice = pickWeighted()

          if (choice.animation === 'walk') {
            const half = size / 2
            const destination = randomBetween(half, Math.max(half, stageWidth - half))
            walkTo(destination, () => {
              setAnimation('idle')
              scheduleNextAction()
            })
            return
          }

          setAnimation(choice.animation)
          actionTimerRef.current = setTimeout(() => {
            setAnimation('idle')
            scheduleNextAction()
          }, choice.durationMs)
        },
        delayMs ?? randomBetween(IDLE_DELAY_MS.min, IDLE_DELAY_MS.max)
      )
    },
    [clearActionTimer, walkTo]
  )

  useEffect(() => {
    let frame = 0
    let last = performance.now()

    const step = (now: number): void => {
      const deltaSeconds = Math.min(0.05, (now - last) / 1000)
      last = now

      const target = targetRef.current
      if (target !== null) {
        const { speed, size } = configRef.current
        // Scale with mascot size so a large mascot does not appear to crawl.
        const pixelsPerSecond = BASE_SPEED * speed * (size / REFERENCE_SIZE)
        const delta = target - positionRef.current
        const stepDistance = pixelsPerSecond * deltaSeconds

        if (Math.abs(delta) <= stepDistance) {
          positionRef.current = target
          targetRef.current = null
          applyPosition()
          const onArrive = onArriveRef.current
          onArriveRef.current = null
          onArrive?.()
        } else {
          positionRef.current += Math.sign(delta) * stepDistance
          applyPosition()
        }
      }

      frame = requestAnimationFrame(step)
    }

    applyPosition()
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [applyPosition])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const scheduleBlink = (): void => {
      timer = setTimeout(
        () => {
          // Sleeping eyes are already closed; blinking would fight the pose.
          if (!asleepRef.current) {
            setBlinking(true)
            setTimeout(() => setBlinking(false), BLINK_DURATION_MS)
          }
          scheduleBlink()
        },
        randomBetween(BLINK_DELAY_MS.min, BLINK_DELAY_MS.max)
      )
    }

    scheduleBlink()
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    scheduleNextAction(1500)
    return clearActionTimer
  }, [scheduleNextAction, clearActionTimer])

  /** Park just off the nearer edge so the next walk reads as an entrance. */
  const placeOffStage = useCallback((): void => {
    const { size } = configRef.current
    positionRef.current = -size
    targetRef.current = null
    applyPosition()
    setFacing(1)
  }, [applyPosition])

  const announce = useCallback<MascotBrain['announce']>(
    (input) => {
      clearActionTimer()
      modeRef.current = 'announcing'
      asleepRef.current = false
      setBubble({ message: input.message, emoji: input.emoji, secondsRemaining: null })

      const { stageWidth, reducedMotion } = configRef.current

      if (reducedMotion) {
        // No walk-over; the bubble alone carries the message. In on-alert mode
        // the character still needs to be somewhere visible.
        if (input.entrance) {
          positionRef.current = stageWidth / 2
          applyPosition()
        }
        setAnimation(input.animation === 'knock' ? 'idle' : input.animation)
        return
      }

      if (input.entrance) placeOffStage()

      walkTo(stageWidth / 2, () => {
        setAnimation(input.animation)
      })
    },
    [applyPosition, clearActionTimer, placeOffStage, walkTo]
  )

  const dismiss = useCallback<MascotBrain['dismiss']>(
    (celebrate) => {
      clearActionTimer()
      setBubble(null)
      modeRef.current = 'auto'

      const finish = (): void => {
        // The one behavioural difference between the two visibility modes.
        if (configRef.current.visibility === 'onAlert') {
          exitStage()
          return
        }
        const { stageWidth, homeX } = configRef.current
        walkTo(stageWidth * homeX, () => {
          setAnimation('idle')
          scheduleNextAction()
        })
      }

      if (celebrate && !configRef.current.reducedMotion) {
        setAnimation('celebrate')
        actionTimerRef.current = setTimeout(finish, 1600)
      } else {
        finish()
      }
    },
    [clearActionTimer, exitStage, scheduleNextAction, walkTo]
  )

  const perform = useCallback<MascotBrain['perform']>(
    (next, entrance) => {
      if (modeRef.current === 'announcing') return
      clearActionTimer()
      asleepRef.current = false

      const runAnimation = (): void => {
        setAnimation(next)
        actionTimerRef.current = setTimeout(() => {
          if (configRef.current.visibility === 'onAlert') {
            exitStage()
            return
          }
          setAnimation('idle')
          scheduleNextAction()
        }, 1800)
      }

      if (entrance) {
        placeOffStage()
        walkTo(configRef.current.stageWidth / 2, runAnimation)
        return
      }
      runAnimation()
    },
    [clearActionTimer, exitStage, placeOffStage, scheduleNextAction, walkTo]
  )

  const setIdleSeconds = useCallback<MascotBrain['setIdleSeconds']>(
    (seconds) => {
      // Sleeping is an always-on-desktop behaviour; in on-alert mode the mascot
      // is simply not there to fall asleep.
      if (configRef.current.visibility === 'onAlert') return

      const threshold = configRef.current.sleepAfterIdleMinutes * 60
      const shouldSleep = seconds >= threshold

      if (shouldSleep && !asleepRef.current && modeRef.current === 'auto') {
        asleepRef.current = true
        clearActionTimer()
        targetRef.current = null
        setAnimation('sleep')
        return
      }

      if (!shouldSleep && asleepRef.current) {
        asleepRef.current = false
        setAnimation('wake')
        clearActionTimer()
        actionTimerRef.current = setTimeout(() => {
          setAnimation('idle')
          scheduleNextAction()
        }, 900)
      }
    },
    [clearActionTimer, scheduleNextAction]
  )

  const setBubbleCountdown = useCallback<MascotBrain['setBubbleCountdown']>((seconds) => {
    setBubble((current) => (current ? { ...current, secondsRemaining: seconds } : current))
  }, [])

  const poke = useCallback<MascotBrain['poke']>(() => {
    void window.nudge.mascot.poke()
    if (modeRef.current === 'auto') perform('jump')
  }, [perform])

  /** Start off stage in on-alert mode so the first entrance is a walk-on. */
  useEffect(() => {
    if (configRef.current.visibility === 'onAlert') placeOffStage()
  }, [placeOffStage])

  return {
    animation,
    blinking,
    facing,
    bubble,
    stageRef,
    announce,
    dismiss,
    perform,
    setIdleSeconds,
    setBubbleCountdown,
    poke
  }
}
