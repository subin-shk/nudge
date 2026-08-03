/**
 * The icon set.
 *
 * Hand-rolled inline SVG rather than an icon package, for three reasons that
 * matter in a small desktop app:
 *
 *   • Nothing to tree-shake and no runtime lookup — icons are compiled into the
 *     bundle as plain JSX and cost nothing at load.
 *   • Every glyph inherits `currentColor`, so icons re-theme with everything
 *     else and never need a colour prop.
 *   • Plugins can reference an icon by name (`icon: 'bell'`), which needs a
 *     stable string→glyph registry regardless of the source.
 *
 * House style: 24×24 grid, 1.75px stroke, round caps and joins.
 */

import type { SVGProps } from 'react'

export type IconName =
  | 'eye'
  | 'droplet'
  | 'timer'
  | 'stretch'
  | 'stand'
  | 'blink'
  | 'bell'
  | 'bellOff'
  | 'home'
  | 'chart'
  | 'trophy'
  | 'settings'
  | 'sparkle'
  | 'flame'
  | 'target'
  | 'calendar'
  | 'play'
  | 'pause'
  | 'stop'
  | 'skip'
  | 'snooze'
  | 'plus'
  | 'minus'
  | 'check'
  | 'close'
  | 'chevronDown'
  | 'chevronRight'
  | 'palette'
  | 'keyboard'
  | 'download'
  | 'upload'
  | 'folder'
  | 'volume'
  | 'volumeOff'
  | 'moon'
  | 'sun'
  | 'monitor'
  | 'mascot'
  | 'refresh'
  | 'external'
  | 'info'
  | 'alert'
  | 'trash'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'power'

/** Path data only — the wrapper below supplies every shared attribute. */
const PATHS: Record<IconName, JSX.Element> = {
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  droplet: <path d="M12 3.2s6 6.2 6 10.1a6 6 0 0 1-12 0c0-3.9 6-10.1 6-10.1Z" />,
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 9.8v3.7l2.4 1.6M9.5 2.5h5" />
    </>
  ),
  stretch: (
    <>
      <circle cx="12" cy="4.8" r="2" />
      <path d="M4 10.5c2.6-1.6 5.2-2.4 8-2.4s5.4.8 8 2.4M12 8.1v6.2M12 14.3 8.7 21M12 14.3 15.3 21" />
    </>
  ),
  stand: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 6.8v7.4M9 9.5h6M12 14.2 9.5 21M12 14.2 14.5 21" />
    </>
  ),
  blink: (
    <>
      <path d="M2.5 12.5S6 7 12 7s9.5 5.5 9.5 5.5" />
      <path d="M4.5 15.5 3 17.8M12 16v2.8M19.5 15.5 21 17.8" />
    </>
  ),
  bell: <path d="M18 8.8a6 6 0 1 0-12 0c0 6.2-2.2 7.6-2.2 7.6h16.4S18 15 18 8.8ZM13.8 19.6a2 2 0 0 1-3.6 0" />,
  bellOff: (
    <>
      <path d="M8.6 4.9A6 6 0 0 1 18 8.8c0 2.4.3 4.1.7 5.3M17.6 17.6H3.8S6 15 6 8.8c0-.5 0-1 .1-1.5M13.8 19.6a2 2 0 0 1-3.6 0" />
      <path d="m3 2.6 18 18" />
    </>
  ),
  home: <path d="M3.5 10.4 12 3.6l8.5 6.8V20a1 1 0 0 1-1 1h-4.3v-6H9.8v6H5.5a1 1 0 0 1-1-1Z" />,
  chart: <path d="M4 20V9.5M10 20V4.5M16 20v-7M22 20H2" />,
  trophy: (
    <>
      <path d="M7 4.5h10v5a5 5 0 0 1-10 0Z" />
      <path d="M7 6H4.5v1.5A3 3 0 0 0 7 10.4M17 6h2.5v1.5a3 3 0 0 1-2.5 2.9M12 14.5V18M8.5 20.5h7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.4a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  sparkle: <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9ZM19 3.5v3M20.5 5h-3" />,
  flame: <path d="M12 21c3.6 0 6-2.4 6-5.6 0-4.3-4.6-6.1-4-12.4-3 1.5-6.4 5-6.4 9.3 0 1.3.4 2.4 1 3.2.2-1.6 1.2-2.9 2.4-3.5-.6 3 1 3.6 1 5.4 0 1.1-.7 2-1.7 2.4.5.2 1.1.2 1.7.2Z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.8h17M8.2 3v4M15.8 3v4" />
    </>
  ),
  play: <path d="M8 5.2 19 12 8 18.8Z" />,
  pause: <path d="M9.2 5v14M14.8 5v14" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.2" />,
  skip: <path d="M6 5.2 15 12 6 18.8ZM18.5 5v14" />,
  snooze: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5h5l-5 5h5" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  check: <path d="m5 12.6 4.6 4.6L19 6.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  palette: (
    <>
      <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6c1.1 0 1.9-.9 1.9-1.9 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .9-1.9 1.9-1.9h2.1a4 4 0 0 0 3.9-4c0-4.1-3.9-7.4-8.8-7.4Z" />
      <circle cx="7.6" cy="11.4" r="1.05" />
      <circle cx="10.6" cy="7.4" r="1.05" />
      <circle cx="15.4" cy="8.2" r="1.05" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 14h11" />
    </>
  ),
  download: <path d="M12 3.5v11M7.5 10.2 12 14.7l4.5-4.5M4.5 19.5h15" />,
  upload: <path d="M12 15V4M7.5 8.3 12 3.8l4.5 4.5M4.5 19.5h15" />,
  folder: <path d="M3.5 6.5a2 2 0 0 1 2-2h3.4l2 2.6h7.6a2 2 0 0 1 2 2v8.4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  volume: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4Z" />
      <path d="M15.6 9.4a3.6 3.6 0 0 1 0 5.2M18.2 6.8a7.2 7.2 0 0 1 0 10.4" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9.5h3.2L12 5.5v13L7.2 14.5H4Z" />
      <path d="m16 10 5 4M21 10l-5 4" />
    </>
  ),
  moon: <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2.2" />
      <path d="M8.5 21h7M12 17v4" />
    </>
  ),
  mascot: (
    <>
      <path d="M12 20.5c4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7 3.6 7 8 7Z" />
      <path d="M9.5 12.2v1.4M14.5 12.2v1.4M10.3 16.4a3 3 0 0 0 3.4 0M12 6.5V3.2" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 3.5V9h-5.5" />,
  external: <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17.5 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V8a1.5 1.5 0 0 1 1.5-1.5H10" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.9h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.6 3.9 2.4 18a1.6 1.6 0 0 0 1.4 2.4h16.4a1.6 1.6 0 0 0 1.4-2.4L13.4 3.9a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.4v4M12 16.9h.01" />
    </>
  ),
  trash: <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7M6.6 6.5l.9 12.3a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5l.9-12.3M10.2 10.4v6M13.8 10.4v6" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5.5" y="5.5" width="13" height="13" rx="1.6" />,
  restore: (
    <>
      <rect x="4.5" y="7.5" width="11" height="11" rx="1.6" />
      <path d="M8 7.5V6a1.5 1.5 0 0 1 1.5-1.5H18A1.5 1.5 0 0 1 19.5 6v8.5A1.5 1.5 0 0 1 18 16h-1.5" />
    </>
  ),
  power: <path d="M12 3.5v8M17.7 6.8a8 8 0 1 1-11.4 0" />
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName | string
  /** Pixel size for both axes. */
  size?: number
  /** Filled glyphs (flame, play) read better without a stroke. */
  filled?: boolean
  strokeWidth?: number
}

/** Glyphs that are designed as solid shapes rather than outlines. */
const FILLED_BY_DEFAULT = new Set<IconName>(['play', 'skip', 'flame', 'droplet', 'home'])

export function Icon({ name, size = 20, filled, strokeWidth = 1.75, ...rest }: IconProps): JSX.Element | null {
  const path = PATHS[name as IconName]
  if (!path) {
    // An unknown name (a plugin referencing an icon we do not ship) renders
    // nothing rather than a broken box.
    return null
  }

  const isFilled = filled ?? FILLED_BY_DEFAULT.has(name as IconName)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFilled ? 'currentColor' : 'none'}
      stroke={isFilled ? 'none' : 'currentColor'}
      strokeWidth={isFilled ? 0 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  )
}
