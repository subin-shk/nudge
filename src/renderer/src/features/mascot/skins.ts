/**
 * Mascot skins.
 *
 * A skin is six colours. The character geometry never changes, which means a
 * new skin is a data entry — and, importantly, that every skin animates
 * identically and is guaranteed to stay legible at 64px.
 */

import type { MascotSkinId } from '@shared/types'

export interface MascotSkin {
  id: MascotSkinId
  labelKey: string
  /** Main body fill. */
  body: string
  /** Lower-body shading; should be a touch darker than `body`. */
  bodyShade: string
  /** Eyes, mouth and outline. Must contrast strongly with `body`. */
  ink: string
  blush: string
  /** Accessories: the water glass, sparkles, the Zzz. */
  accent: string
  /** Soft glow behind the character on the desktop. */
  glow: string
}

export const MASCOT_SKINS_MAP: Record<MascotSkinId, MascotSkin> = {
  mint: {
    id: 'mint',
    labelKey: 'skin.mint',
    body: '#ffffff',
    bodyShade: '#dff3ee',
    ink: '#1e2a44',
    blush: '#ffa8bd',
    accent: '#3dd6c0',
    glow: 'rgba(61, 214, 192, 0.35)'
  },
  blueberry: {
    id: 'blueberry',
    labelKey: 'skin.blueberry',
    body: '#dbe6ff',
    bodyShade: '#b9cdfb',
    ink: '#1b2547',
    blush: '#9fb6ff',
    accent: '#4f7cff',
    glow: 'rgba(79, 124, 255, 0.35)'
  },
  peach: {
    id: 'peach',
    labelKey: 'skin.peach',
    body: '#ffe6d5',
    bodyShade: '#fbcbaa',
    ink: '#4a2417',
    blush: '#ff9f87',
    accent: '#fb923c',
    glow: 'rgba(251, 146, 60, 0.35)'
  },
  matcha: {
    id: 'matcha',
    labelKey: 'skin.matcha',
    body: '#e6f5d8',
    bodyShade: '#c6e3ab',
    ink: '#1f3418',
    blush: '#a8d97f',
    accent: '#4ade80',
    glow: 'rgba(74, 222, 128, 0.35)'
  },
  grape: {
    id: 'grape',
    labelKey: 'skin.grape',
    body: '#e9e0ff',
    bodyShade: '#cbb8fb',
    ink: '#251a45',
    blush: '#c8a6ff',
    accent: '#a78bfa',
    glow: 'rgba(167, 139, 250, 0.35)'
  },
  ghost: {
    id: 'ghost',
    labelKey: 'skin.ghost',
    // Near-transparent white: for people who want a companion that is barely
    // there. The ink stays fully opaque so the face is still readable.
    body: 'rgba(255, 255, 255, 0.82)',
    bodyShade: 'rgba(214, 224, 240, 0.85)',
    ink: '#2c3550',
    blush: 'rgba(255, 168, 189, 0.7)',
    accent: '#9aa8c7',
    glow: 'rgba(200, 214, 240, 0.28)'
  }
}

export const MASCOT_SKIN_LIST: MascotSkin[] = Object.values(MASCOT_SKINS_MAP)

export function getSkin(id: string): MascotSkin {
  return MASCOT_SKINS_MAP[id as MascotSkinId] ?? MASCOT_SKINS_MAP.mint
}
