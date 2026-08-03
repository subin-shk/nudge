/**
 * Applies the active theme to the document.
 *
 * Tokens are written onto `:root` as inline custom properties. Switching a theme
 * therefore mutates ~28 CSS variables and the browser re-resolves every
 * `var(--token)` in one composited pass — no stylesheet swap, no flash of the
 * wrong colours, and it eases smoothly because the global stylesheet declares
 * transitions on `background-color` and `color`.
 *
 * It also mirrors the reduced-motion preference (the app setting OR the OS
 * setting) onto `data-reduced-motion`, which the stylesheet keys off — so motion
 * is disabled in exactly one place rather than per component.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeId } from '@shared/types'
import { deriveAccentTokens } from './color'
import { resolveTheme, type ThemeDefinition } from './themes'

/** Subscribe to a CSS media query. */
function useMediaQuery(query: string, fallback = false): boolean {
  const mediaQuery = useMemo(
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null),
    [query]
  )
  const [matches, setMatches] = useState(() => mediaQuery?.matches ?? fallback)

  useEffect(() => {
    if (!mediaQuery) return
    setMatches(mediaQuery.matches)
    const listener = (event: MediaQueryListEvent): void => setMatches(event.matches)
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [mediaQuery])

  return matches
}

/**
 * Write a theme's tokens (plus any accent override) to the document root.
 * Exported so the break overlay, the mascot and the onboarding flow can theme
 * themselves without mounting the whole provider tree.
 */
export function applyTheme(theme: ThemeDefinition, accentOverride: string | null): void {
  const root = document.documentElement

  for (const [token, value] of Object.entries(theme.tokens)) {
    root.style.setProperty(token, value)
  }

  if (accentOverride) {
    const derived = deriveAccentTokens(accentOverride, theme.scheme)
    if (derived) {
      root.style.setProperty('--accent', derived.accent)
      root.style.setProperty('--accent-hover', derived.accentHover)
      root.style.setProperty('--accent-fg', derived.accentFg)
      root.style.setProperty('--accent-soft', derived.accentSoft)
      root.style.setProperty('--accent-ring', derived.accentRing)
      // The focus tone follows the accent, so the timer ring and the focus
      // series in the charts stay visually the same thing.
      root.style.setProperty('--tone-focus', derived.accent)
    }
  }

  root.dataset.theme = theme.id
  root.style.colorScheme = theme.scheme
}

export interface ThemeProviderProps {
  themeId: ThemeId
  accentOverride: string | null
  reducedMotion: boolean
  children: ReactNode
}

export function ThemeProvider({ themeId, accentOverride, reducedMotion, children }: ThemeProviderProps): JSX.Element {
  // Default to dark when the OS cannot be queried: Nudge's default theme is
  // 'system', and a dark launch flash is far less jarring than a white one.
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', true)
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', false)

  const theme = useMemo(() => resolveTheme(themeId, prefersDark), [themeId, prefersDark])

  useEffect(() => {
    applyTheme(theme, accentOverride)
  }, [theme, accentOverride])

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion || prefersReducedMotion)
  }, [reducedMotion, prefersReducedMotion])

  return <>{children}</>
}
