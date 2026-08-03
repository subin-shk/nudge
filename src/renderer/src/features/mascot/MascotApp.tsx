/**
 * The mascot window's root component.
 *
 * Two responsibilities beyond rendering the character:
 *
 *  1. **Hit testing for click-through.** The window is transparent to clicks so
 *     it never blocks the desktop, but the character itself must stay clickable.
 *     A `mousemove` listener (delivered because the window forwards them) checks
 *     whether the pointer is inside the character's box and asks the main
 *     process to flip `setIgnoreMouseEvents` accordingly. This is the standard —
 *     and only reliable — way to have a click-through window with live regions.
 *
 *  2. **Command translation.** Main sends intent (`announce`, `dismiss`,
 *     `perform`, `setIdle`, `config`); the brain owns how that intent looks.
 */

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { MascotCommand } from '@shared/types'
import { getSkin } from './skins'
import { MascotCharacter } from './MascotCharacter'
import { useMascotBrain } from './useMascotBrain'
import styles from './mascot.module.css'

interface MascotConfig {
  size: number
  speed: number
  skin: string
  speechBubbles: boolean
  reducedMotion: boolean
  visibility: 'always' | 'onAlert'
  homeX: number
}

const DEFAULT_CONFIG: MascotConfig = {
  size: 120,
  speed: 1,
  skin: 'mint',
  speechBubbles: true,
  reducedMotion: false,
  visibility: 'always',
  homeX: 0.18
}

export function MascotApp(): JSX.Element {
  const [config, setConfig] = useState<MascotConfig>(DEFAULT_CONFIG)
  const [stageWidth, setStageWidth] = useState(() => window.innerWidth)
  const characterRef = useRef<HTMLDivElement>(null)
  const interactiveRef = useRef(false)

  const brain = useMascotBrain({
    stageWidth,
    size: config.size,
    speed: config.speed,
    homeX: config.homeX,
    sleepAfterIdleMinutes: 5,
    reducedMotion: config.reducedMotion,
    visibility: config.visibility
  })

  useEffect(() => {
    const onResize = (): void => setStageWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(config.reducedMotion)
  }, [config.reducedMotion])

  useEffect(() => {
    return window.nudge.on.mascotCommand((command: MascotCommand) => {
      switch (command.type) {
        case 'config':
          setConfig({
            size: command.size,
            speed: command.speed,
            skin: command.skin,
            speechBubbles: command.speechBubbles,
            reducedMotion: command.reducedMotion,
            visibility: command.visibility,
            homeX: command.homeX
          })
          break
        case 'announce':
          brain.announce({
            message: command.message,
            emoji: command.emoji,
            animation: command.animation,
            entrance: command.entrance
          })
          break
        case 'dismiss':
          brain.dismiss(command.celebrate)
          break
        case 'perform':
          brain.perform(command.animation, command.entrance)
          break
        case 'setIdle':
          brain.setIdleSeconds(command.idleSeconds)
          break
      }
    })
  }, [brain])

  useEffect(() => {
    return window.nudge.on.breakUpdate((active) => {
      brain.setBubbleCountdown(active ? active.remainingSeconds : null)
    })
  }, [brain])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      const node = characterRef.current
      if (!node) return

      const rect = node.getBoundingClientRect()
      const inside =
        event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom

      // Only cross the IPC boundary when the answer actually changes.
      if (inside !== interactiveRef.current) {
        interactiveRef.current = inside
        void window.nudge.mascot.setInteractive(inside)
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      if (interactiveRef.current) void window.nudge.mascot.setInteractive(false)
    }
  }, [])

  const skin = getSkin(config.skin)

  return (
    <div className={clsx(styles.root, styles[brain.animation], brain.blinking && styles.blinking)}>
      <div ref={brain.stageRef} className={styles.stage} style={{ width: config.size }}>
        {config.speechBubbles && brain.bubble && (
          <div
            className={styles.bubble}
            style={
              {
                '--bubble-bg': '#ffffff',
                '--bubble-fg': '#1e2a44',
                '--bubble-accent': skin.accent
              } as React.CSSProperties
            }
          >
            <span className={styles.bubbleEmoji}>{brain.bubble.emoji}</span>
            {brain.bubble.message}
            {brain.bubble.secondsRemaining !== null && (
              <span className={styles.bubbleCountdown}>{brain.bubble.secondsRemaining}s</span>
            )}
            <span className={styles.bubbleTail} />
          </div>
        )}

        <div ref={characterRef} onClick={brain.poke} role="presentation">
          <MascotCharacter
            skin={skin}
            size={config.size}
            animation={brain.animation}
            blinking={brain.blinking}
            facing={brain.facing}
          />
        </div>
      </div>
    </div>
  )
}
