/**
 * Minimal colour maths, used for two things only:
 *
 *   • deriving hover / soft variants when the user overrides the accent colour,
 *   • picking readable foreground text for an arbitrary accent.
 *
 * Everything else in the app uses fixed tokens from `themes.ts`. Runtime colour
 * derivation is kept to this narrow role on purpose — a design system that
 * computes most of its palette tends to drift into muddy, low-contrast colours.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace('#', '')
  if (value.length === 3) {
    const [r, g, b] = value.split('')
    return {
      r: parseInt(`${r}${r}`, 16),
      g: parseInt(`${g}${g}`, 16),
      b: parseInt(`${b}${b}`, 16)
    }
  }
  if (value.length === 6) {
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    }
  }
  return null
}

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp255(n).toString(16).padStart(2, '0')).join('')}`
}

export function rgba({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Math.max(0, Math.min(1, alpha))})`
}

export function mixColors(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  }
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
const BLACK: Rgb = { r: 0, g: 0, b: 0 }

export const lighten = (color: Rgb, amount: number): Rgb => mixColors(color, WHITE, amount)
export const darken = (color: Rgb, amount: number): Rgb => mixColors(color, BLACK, amount)

/** Relative luminance per WCAG 2.1. */
export function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Pick black or white text for a background, whichever has more contrast.
 * Used for `--accent-fg` when the user supplies their own accent — a custom
 * colour must not be allowed to produce unreadable button labels.
 */
export function readableForeground(background: Rgb): string {
  return contrastRatio(background, BLACK) >= contrastRatio(background, WHITE) ? '#000000' : '#ffffff'
}

/**
 * Derive the full accent token set from a single hex value.
 * `scheme` decides which direction "hover" and "soft" move.
 */
export function deriveAccentTokens(
  hex: string,
  scheme: 'light' | 'dark'
): { accent: string; accentHover: string; accentFg: string; accentSoft: string; accentRing: string } | null {
  const base = parseHex(hex)
  if (!base) return null

  return {
    accent: toHex(base),
    // Light themes darken on hover, dark themes lighten — matching how each
    // scheme signals "closer to the surface".
    accentHover: toHex(scheme === 'light' ? darken(base, 0.14) : lighten(base, 0.16)),
    accentFg: readableForeground(base),
    accentSoft: toHex(scheme === 'light' ? lighten(base, 0.86) : darken(base, 0.72)),
    accentRing: rgba(base, 0.4)
  }
}
