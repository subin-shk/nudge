/**
 * Shared chart plumbing: responsive width, y-scale ticks and tooltip state.
 *
 * The charts are hand-drawn SVG rather than a charting library. Two reasons:
 * the mark specs this app follows (24px bar cap, 4px rounded data-end square at
 * the baseline, a 2px *surface-coloured* gap between stacked segments) are
 * awkward to express through a library's abstractions, and a charting dependency
 * would be the single largest thing in a bundle that otherwise ships in a few
 * hundred KB.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Track an element's width so the SVG can be laid out in real pixels. */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/**
 * Round a maximum up to a clean axis top and return evenly-spaced ticks.
 * Axis ticks carry every value that is not directly labelled, so they must read
 * as round numbers (0 / 2 / 4), never as 3.7143.
 */
export function niceScale(rawMax: number, tickCount = 4): { max: number; ticks: number[] } {
  if (rawMax <= 0) return { max: 1, ticks: [0, 1] }

  const rough = rawMax / tickCount
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / magnitude
  // Snap the step to 1, 2, 5 or 10 × a power of ten — the steps people read fluently.
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude

  const max = Math.ceil(rawMax / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Number(value.toFixed(6)))
  return { max, ticks }
}

export interface TooltipState {
  x: number
  y: number
  title: string
  rows: Array<{ label: string; value: string; color?: string }>
}

export function useTooltip(): {
  tooltip: TooltipState | null
  show: (state: TooltipState) => void
  hide: () => void
} {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const show = useCallback((state: TooltipState) => setTooltip(state), [])
  const hide = useCallback(() => setTooltip(null), [])
  return { tooltip, show, hide }
}

/**
 * Path for a bar with rounded *data-end* corners and a square baseline.
 * `radius` is clamped so a very short bar degrades to a plain rectangle rather
 * than turning into a lozenge.
 */
export function barPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z'
  ].join(' ')
}

/** Horizontal variant: rounded right end, square at the left baseline. */
export function barPathHorizontal(x: number, y: number, width: number, height: number, radius: number): string {
  if (width <= 0) return ''
  const r = Math.min(radius, height / 2, width)
  return [
    `M ${x} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `Q ${x + width} ${y + height} ${x + width - r} ${y + height}`,
    `L ${x} ${y + height}`,
    'Z'
  ].join(' ')
}

/** Mark specs, fixed across every chart in the app. */
export const MARK = {
  /** Never fill the band — the leftover is deliberate air. */
  maxBarThickness: 24,
  bandFill: 0.62,
  cornerRadius: 4,
  /** Surface-coloured separator between touching fills. */
  surfaceGap: 2,
  /** Minimum pointer target, independent of mark size. */
  minHitSize: 24
} as const
