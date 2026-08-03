/**
 * The mascot, drawn as live SVG.
 *
 * Why SVG rather than a sprite sheet:
 *   • Crisp at any size and on any DPI — the user can scale from 64px to 260px.
 *   • Skins are a palette swap, not six more image files.
 *   • Individual parts (arms, eyes, feet) are addressable, so animation is CSS
 *     on real elements instead of stepping through frames.
 *   • Nothing binary in the repo.
 *
 * The geometry is authored on a 100×100 grid and scaled by the viewBox.
 */

import type { MascotAnimation } from '@shared/types'
import type { MascotSkin } from './skins'
import styles from './mascot.module.css'

export interface MascotCharacterProps {
  skin: MascotSkin
  size: number
  animation: MascotAnimation
  /** Toggled by the brain at irregular intervals — see useMascotBrain. */
  blinking: boolean
  /** -1 faces left, 1 faces right. */
  facing: 1 | -1
}

/** Mouth path per mood. A single path swap changes the whole expression. */
function mouthPath(animation: MascotAnimation): string {
  switch (animation) {
    case 'sleep':
      // A small open oval reads as sleeping breath.
      return 'M45 68 q5 5 10 0 q-5 3 -10 0 Z'
    case 'celebrate':
    case 'jump':
      return 'M40 63 q10 13 20 0 q-10 6 -20 0 Z'
    case 'drink':
      return 'M46 66 q4 6 8 0 q-4 3 -8 0 Z'
    case 'stretch':
      return 'M43 65 q7 9 14 0'
    default:
      return 'M42 64 q8 8 16 0'
  }
}

export function MascotCharacter({ skin, size, animation, blinking, facing }: MascotCharacterProps): JSX.Element {
  const asleep = animation === 'sleep'
  const holdingGlass = animation === 'drink'

  return (
    <div
      className={styles.character}
      style={{ width: size, height: size, transform: `scaleX(${facing})` }}
      data-animation={animation}
    >
      <span className={styles.glow} style={{ background: `radial-gradient(circle, ${skin.glow}, transparent 70%)` }} />

      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <clipPath id="mascot-body-clip">
            <ellipse cx="50" cy="58" rx="34" ry="31" />
          </clipPath>
        </defs>

        {/* --- feet: drawn first so the body overlaps them --- */}
        <g>
          <ellipse className={styles.footLeft} cx="38" cy="87" rx="9" ry="5" fill={skin.bodyShade} />
          <ellipse className={styles.footRight} cx="62" cy="87" rx="9" ry="5" fill={skin.bodyShade} />
        </g>

        {/* --- arms --- */}
        <g className={`${styles.arm} ${styles.armLeft}`}>
          <ellipse cx="17" cy="60" rx="6.5" ry="9" fill={skin.bodyShade} transform="rotate(-14 17 60)" />
        </g>
        <g className={`${styles.arm} ${styles.armRight}`}>
          <ellipse cx="83" cy="60" rx="6.5" ry="9" fill={skin.bodyShade} transform="rotate(14 83 60)" />
        </g>

        {/* --- body --- */}
        <ellipse cx="50" cy="58" rx="34" ry="31" fill={skin.body} />
        {/* Lower shading, clipped to the body silhouette. */}
        <g clipPath="url(#mascot-body-clip)">
          <ellipse cx="50" cy="104" rx="42" ry="34" fill={skin.bodyShade} opacity="0.9" />
        </g>

        {/* --- blush --- */}
        <ellipse cx="27" cy="63" rx="6.5" ry="4" fill={skin.blush} opacity="0.75" />
        <ellipse cx="73" cy="63" rx="6.5" ry="4" fill={skin.blush} opacity="0.75" />

        {/* --- eyes --- */}
        <g className={styles.eyes}>
          {asleep ? (
            // Closed eyes: two gentle arcs. Far friendlier than flat lines.
            <>
              <path d="M32 53 q6 6 12 0" stroke={skin.ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
              <path d="M56 53 q6 6 12 0" stroke={skin.ink} strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </>
          ) : (
            <>
              <ellipse cx="38" cy="53" rx="5" ry="6.4" fill={skin.ink} />
              <ellipse cx="62" cy="53" rx="5" ry="6.4" fill={skin.ink} />
              {/* Catchlights: the single detail that makes the face feel alive. */}
              <circle cx="40" cy="50.5" r="1.8" fill="#ffffff" opacity="0.92" />
              <circle cx="64" cy="50.5" r="1.8" fill="#ffffff" opacity="0.92" />
            </>
          )}
        </g>

        {/* --- mouth --- */}
        <path
          className={styles.mouth}
          d={mouthPath(animation)}
          fill={animation === 'celebrate' || animation === 'jump' || animation === 'sleep' ? skin.ink : 'none'}
          stroke={skin.ink}
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* --- glass of water, only while drinking --- */}
        {holdingGlass && (
          <g>
            <rect x="76" y="52" width="13" height="16" rx="2.5" fill={skin.accent} opacity="0.35" />
            <rect x="76" y="58" width="13" height="10" rx="2.5" fill={skin.accent} opacity="0.85" />
            <rect x="76" y="52" width="13" height="16" rx="2.5" fill="none" stroke={skin.ink} strokeWidth="1.6" opacity="0.5" />
          </g>
        )}

        {/* --- droplet crown: the brand mark, always present --- */}
        <path
          d="M50 14 c3.5 4.4 6 7.6 6 10.2 a6 6 0 0 1 -12 0 c0 -2.6 2.5 -5.8 6 -10.2 Z"
          fill={skin.accent}
          opacity={asleep ? 0.55 : 1}
        />
      </svg>

      {/* --- Zzz while asleep --- */}
      {asleep && (
        <div className={styles.zzz} style={{ color: skin.accent }}>
          {['z', 'z', 'z'].map((mark, index) => (
            <svg key={index} className={styles.zzzMark} width={size * 0.16} height={size * 0.16} viewBox="0 0 20 20">
              <path d="M5 5h10L5 15h10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ))}
        </div>
      )}

      {/* --- sparkles while celebrating --- */}
      {animation === 'celebrate' && (
        <div className={styles.sparkles} style={{ color: skin.accent }}>
          {[0, 1, 2, 3].map((index) => (
            <svg key={index} className={styles.sparkle} width={size * 0.16} height={size * 0.16} viewBox="0 0 20 20">
              <path d="M10 1 l2.2 6.1 6.1 2.2 -6.1 2.2 -2.2 6.1 -2.2 -6.1 -6.1 -2.2 6.1 -2.2 Z" fill="currentColor" />
            </svg>
          ))}
        </div>
      )}
    </div>
  )
}
