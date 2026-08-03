/**
 * The theme system.
 *
 * Every theme is a flat map of the *same* CSS custom properties, applied to
 * `:root`. Components only ever reference `var(--token)` — never a literal
 * colour — which is what makes nine themes cost nine data objects instead of
 * nine stylesheets.
 *
 * Token contract (adding a theme means filling in exactly these):
 *
 *   Surfaces   bg, bg-elevated, bg-subtle, bg-inset
 *   Lines      border, border-strong
 *   Text       text, text-muted, text-faint
 *   Accent     accent, accent-hover, accent-fg, accent-soft, accent-ring
 *   Status     success, warning, danger (+ -soft variants)
 *   Reminders  tone-eye, tone-water, tone-focus, tone-move
 *   Chrome     scrim, shadow-color
 *
 * `scheme` drives `color-scheme` (so native scrollbars and form controls match)
 * and tells the accent-override maths which way to shade.
 */

import type { ThemeId } from '@shared/types'

export interface ThemeDefinition {
  id: ThemeId
  labelKey: string
  scheme: 'light' | 'dark'
  /** Three colours for the theme picker swatch: page, card, accent. */
  preview: [string, string, string]
  tokens: Record<string, string>
}

/** Reminder tone colours are grouped so a theme cannot forget one. */
interface Tones {
  eye: string
  water: string
  focus: string
  move: string
}

function tokens(input: {
  bg: string
  bgElevated: string
  bgSubtle: string
  bgInset: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentHover: string
  accentFg: string
  accentSoft: string
  accentRing: string
  success: string
  successSoft: string
  warning: string
  warningSoft: string
  danger: string
  dangerSoft: string
  tones: Tones
  scrim: string
  shadowColor: string
}): Record<string, string> {
  return {
    '--bg': input.bg,
    '--bg-elevated': input.bgElevated,
    '--bg-subtle': input.bgSubtle,
    '--bg-inset': input.bgInset,
    '--border': input.border,
    '--border-strong': input.borderStrong,
    '--text': input.text,
    '--text-muted': input.textMuted,
    '--text-faint': input.textFaint,
    '--accent': input.accent,
    '--accent-hover': input.accentHover,
    '--accent-fg': input.accentFg,
    '--accent-soft': input.accentSoft,
    '--accent-ring': input.accentRing,
    '--success': input.success,
    '--success-soft': input.successSoft,
    '--warning': input.warning,
    '--warning-soft': input.warningSoft,
    '--danger': input.danger,
    '--danger-soft': input.dangerSoft,
    '--tone-eye': input.tones.eye,
    '--tone-water': input.tones.water,
    '--tone-focus': input.tones.focus,
    '--tone-move': input.tones.move,
    '--tone-neutral': input.textMuted,
    '--scrim': input.scrim,
    '--shadow-color': input.shadowColor
  }
}

const light: ThemeDefinition = {
  id: 'light',
  labelKey: 'theme.light',
  scheme: 'light',
  preview: ['#f5f7fb', '#ffffff', '#4f7cff'],
  tokens: tokens({
    bg: '#f5f7fb',
    bgElevated: '#ffffff',
    bgSubtle: '#eef1f7',
    bgInset: '#e4e9f2',
    border: '#e3e8f1',
    borderStrong: '#ccd4e3',
    text: '#16202f',
    textMuted: '#586275',
    textFaint: '#8a94a6',
    accent: '#4f7cff',
    accentHover: '#3f6ae8',
    accentFg: '#ffffff',
    accentSoft: '#e8eefe',
    accentRing: 'rgba(79, 124, 255, 0.35)',
    success: '#15a34a',
    successSoft: '#e4f7ea',
    warning: '#c2760a',
    warningSoft: '#fdf1dc',
    danger: '#dc2626',
    dangerSoft: '#fdeaea',
    tones: { eye: '#6366f1', water: '#0ea5e9', focus: '#4f7cff', move: '#10b981' },
    scrim: 'rgba(12, 18, 32, 0.55)',
    shadowColor: 'rgba(21, 32, 56, 0.10)'
  })
}

const dark: ThemeDefinition = {
  id: 'dark',
  labelKey: 'theme.dark',
  scheme: 'dark',
  preview: ['#14161c', '#1c1f27', '#6d8dff'],
  tokens: tokens({
    bg: '#14161c',
    bgElevated: '#1c1f27',
    bgSubtle: '#23272f',
    bgInset: '#2a2e38',
    border: '#2b303b',
    borderStrong: '#3b4250',
    text: '#eef1f6',
    textMuted: '#a3acbb',
    textFaint: '#737d8f',
    accent: '#6d8dff',
    accentHover: '#869eff',
    accentFg: '#0b0e14',
    accentSoft: '#1e2740',
    accentRing: 'rgba(109, 141, 255, 0.40)',
    success: '#34d399',
    successSoft: '#12291f',
    warning: '#fbbf24',
    warningSoft: '#2b2210',
    danger: '#f87171',
    dangerSoft: '#2e1618',
    tones: { eye: '#8b8cf7', water: '#38bdf8', focus: '#6d8dff', move: '#34d399' },
    scrim: 'rgba(4, 6, 12, 0.68)',
    shadowColor: 'rgba(0, 0, 0, 0.45)'
  })
}

const amoled: ThemeDefinition = {
  id: 'amoled',
  labelKey: 'theme.amoled',
  scheme: 'dark',
  preview: ['#000000', '#0b0b0e', '#7c9cff'],
  tokens: tokens({
    bg: '#000000',
    bgElevated: '#0b0b0e',
    bgSubtle: '#131317',
    bgInset: '#1a1a1f',
    border: '#1e1e24',
    borderStrong: '#2e2e36',
    text: '#f3f5f9',
    textMuted: '#9aa1ad',
    textFaint: '#6b7280',
    accent: '#7c9cff',
    accentHover: '#9db3ff',
    accentFg: '#000000',
    accentSoft: '#0f1320',
    accentRing: 'rgba(124, 156, 255, 0.42)',
    success: '#3ddc97',
    successSoft: '#08170f',
    warning: '#ffc53d',
    warningSoft: '#1c1608',
    danger: '#ff6b6b',
    dangerSoft: '#1d0c0c',
    tones: { eye: '#9b9cff', water: '#4cc9f0', focus: '#7c9cff', move: '#3ddc97' },
    // True black needs a heavier scrim to read as a separate layer.
    scrim: 'rgba(0, 0, 0, 0.80)',
    shadowColor: 'rgba(0, 0, 0, 0.85)'
  })
}

const ocean: ThemeDefinition = {
  id: 'ocean',
  labelKey: 'theme.ocean',
  scheme: 'dark',
  preview: ['#071b2b', '#0d2739', '#22d3ee'],
  tokens: tokens({
    bg: '#071b2b',
    bgElevated: '#0d2739',
    bgSubtle: '#123146',
    bgInset: '#163a52',
    border: '#1b4360',
    borderStrong: '#245a7d',
    text: '#e6f4ff',
    textMuted: '#9dc0d8',
    textFaint: '#6f95ae',
    accent: '#22d3ee',
    accentHover: '#4ae0f5',
    accentFg: '#042430',
    accentSoft: '#0d3a4a',
    accentRing: 'rgba(34, 211, 238, 0.38)',
    success: '#2dd4bf',
    successSoft: '#0a2f31',
    warning: '#fcd34d',
    warningSoft: '#2c2812',
    danger: '#fb7185',
    dangerSoft: '#2f1520',
    tones: { eye: '#60a5fa', water: '#38bdf8', focus: '#22d3ee', move: '#2dd4bf' },
    scrim: 'rgba(2, 12, 22, 0.72)',
    shadowColor: 'rgba(1, 10, 20, 0.55)'
  })
}

const forest: ThemeDefinition = {
  id: 'forest',
  labelKey: 'theme.forest',
  scheme: 'dark',
  preview: ['#0c1a14', '#12241c', '#4ade80'],
  tokens: tokens({
    bg: '#0c1a14',
    bgElevated: '#12241c',
    bgSubtle: '#182e24',
    bgInset: '#1d372b',
    border: '#21402f',
    borderStrong: '#2d5540',
    text: '#e8f5ed',
    textMuted: '#a3c4b0',
    textFaint: '#789887',
    accent: '#4ade80',
    accentHover: '#74e89b',
    accentFg: '#05210f',
    accentSoft: '#14331f',
    accentRing: 'rgba(74, 222, 128, 0.35)',
    success: '#4ade80',
    successSoft: '#122a1a',
    warning: '#fbbf24',
    warningSoft: '#2a2410',
    danger: '#f87171',
    dangerSoft: '#2c1616',
    tones: { eye: '#a3e635', water: '#2dd4bf', focus: '#34d399', move: '#4ade80' },
    scrim: 'rgba(3, 12, 8, 0.70)',
    shadowColor: 'rgba(2, 12, 7, 0.55)'
  })
}

const sakura: ThemeDefinition = {
  id: 'sakura',
  labelKey: 'theme.sakura',
  scheme: 'light',
  preview: ['#fdf2f6', '#ffffff', '#ec4899'],
  tokens: tokens({
    bg: '#fdf2f6',
    bgElevated: '#ffffff',
    bgSubtle: '#fbe7ef',
    bgInset: '#f7dae6',
    border: '#f6dbe6',
    borderStrong: '#eec2d3',
    text: '#3d2230',
    textMuted: '#7c5567',
    textFaint: '#a37e8e',
    accent: '#e0409f',
    accentHover: '#c92c8a',
    accentFg: '#ffffff',
    accentSoft: '#fce7f1',
    accentRing: 'rgba(224, 64, 159, 0.32)',
    success: '#0f9d63',
    successSoft: '#e2f6ed',
    warning: '#c2760a',
    warningSoft: '#fbf0da',
    danger: '#d92d4e',
    dangerSoft: '#fde8ec',
    tones: { eye: '#a855f7', water: '#0ea5e9', focus: '#e0409f', move: '#f472b6' },
    scrim: 'rgba(52, 20, 36, 0.52)',
    shadowColor: 'rgba(97, 40, 68, 0.12)'
  })
}

const sunset: ThemeDefinition = {
  id: 'sunset',
  labelKey: 'theme.sunset',
  scheme: 'dark',
  preview: ['#1c1116', '#26171c', '#fb923c'],
  tokens: tokens({
    bg: '#1c1116',
    bgElevated: '#26171c',
    bgSubtle: '#301d23',
    bgInset: '#3a2329',
    border: '#40272e',
    borderStrong: '#57363e',
    text: '#fdeee6',
    textMuted: '#cfa79b',
    textFaint: '#a3817a',
    accent: '#fb923c',
    accentHover: '#fdb571',
    accentFg: '#2a1206',
    accentSoft: '#3b2117',
    accentRing: 'rgba(251, 146, 60, 0.36)',
    success: '#4ade80',
    successSoft: '#13291a',
    warning: '#fbbf24',
    warningSoft: '#2f2410',
    danger: '#fb7185',
    dangerSoft: '#331519',
    tones: { eye: '#f472b6', water: '#38bdf8', focus: '#fb923c', move: '#fbbf24' },
    scrim: 'rgba(16, 7, 10, 0.72)',
    shadowColor: 'rgba(10, 4, 6, 0.55)'
  })
}

const purpleNight: ThemeDefinition = {
  id: 'purpleNight',
  labelKey: 'theme.purpleNight',
  scheme: 'dark',
  preview: ['#140f24', '#1c1533', '#a78bfa'],
  tokens: tokens({
    bg: '#140f24',
    bgElevated: '#1c1533',
    bgSubtle: '#241b40',
    bgInset: '#2c204d',
    border: '#302456',
    borderStrong: '#453376',
    text: '#eee9ff',
    textMuted: '#b1a5d8',
    textFaint: '#8a7cb5',
    accent: '#a78bfa',
    accentHover: '#c0aefc',
    accentFg: '#150e28',
    accentSoft: '#241a44',
    accentRing: 'rgba(167, 139, 250, 0.38)',
    success: '#34d399',
    successSoft: '#122a25',
    warning: '#fbbf24',
    warningSoft: '#2b2313',
    danger: '#fb7185',
    dangerSoft: '#301521',
    tones: { eye: '#a78bfa', water: '#60a5fa', focus: '#c084fc', move: '#34d399' },
    scrim: 'rgba(8, 5, 18, 0.74)',
    shadowColor: 'rgba(6, 3, 15, 0.6)'
  })
}

const minimalGray: ThemeDefinition = {
  id: 'minimalGray',
  labelKey: 'theme.minimalGray',
  scheme: 'light',
  preview: ['#f2f2f3', '#ffffff', '#4b5563'],
  tokens: tokens({
    bg: '#f2f2f3',
    bgElevated: '#ffffff',
    bgSubtle: '#eaeaec',
    bgInset: '#e0e0e3',
    border: '#e3e3e6',
    borderStrong: '#cbcbd0',
    text: '#1b1b1f',
    textMuted: '#5c5c66',
    textFaint: '#8a8a94',
    accent: '#4b5563',
    accentHover: '#374151',
    accentFg: '#ffffff',
    accentSoft: '#e8e8ec',
    accentRing: 'rgba(75, 85, 99, 0.28)',
    success: '#3f7d5c',
    successSoft: '#e9f1ec',
    warning: '#8a6a2f',
    warningSoft: '#f4efe4',
    danger: '#a94442',
    dangerSoft: '#f6eaea',
    // Kept desaturated to match the theme, but still four distinguishable hues —
    // a truly monochrome palette makes the statistics charts unreadable.
    tones: { eye: '#7c7f9a', water: '#68889b', focus: '#4b5563', move: '#7a9585' },
    scrim: 'rgba(20, 20, 24, 0.5)',
    shadowColor: 'rgba(24, 24, 28, 0.10)'
  })
}

export const THEMES: Record<Exclude<ThemeId, 'system'>, ThemeDefinition> = {
  light,
  dark,
  amoled,
  ocean,
  forest,
  sakura,
  sunset,
  purpleNight,
  minimalGray
}

/** Display order in the theme picker: neutrals first, then the coloured ones. */
export const THEME_ORDER: Array<Exclude<ThemeId, 'system'>> = [
  'light',
  'dark',
  'amoled',
  'minimalGray',
  'ocean',
  'forest',
  'sakura',
  'sunset',
  'purpleNight'
]

/** Resolve 'system' against the OS preference. */
export function resolveTheme(id: ThemeId, prefersDark: boolean): ThemeDefinition {
  if (id === 'system') return prefersDark ? dark : light
  return THEMES[id] ?? dark
}
