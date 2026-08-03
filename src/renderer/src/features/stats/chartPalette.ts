/**
 * The chart palette.
 *
 * **Deliberately independent of the nine UI themes.** Theme tokens tint chrome —
 * cards, buttons, the mascot's glow. Series colour is *data*: it must be stable
 * (so "water is this colour" holds while you switch from Sakura to AMOLED) and it
 * must be validated for colour-vision deficiency. Repainting series per theme
 * would give up both.
 *
 * These hexes come from the documented reference palette, in its documented slot
 * order, and were verified with the palette validator against the light card
 * surface (#ffffff) and a representative dark card surface (#1c1f27):
 *
 *   light  CVD ΔE 9.1 (protan, aqua↔yellow) · normal-vision ΔE 19.6 · PASS
 *   dark   CVD ΔE 8.4 (protan, aqua↔yellow) · normal-vision ΔE 19.3 · PASS
 *
 * Light mode reports three slots below 3:1 contrast (aqua, yellow, magenta), so
 * the **relief rule** applies and is honoured everywhere they appear: every chart
 * ships a legend, direct value labels, and a table view.
 *
 * A semantically nicer order (water = blue as slot 1) was tried and rejected —
 * it put magenta next to orange and failed the normal-vision floor at ΔE 12.9.
 * Slot order is the accessibility mechanism, not a styling choice.
 */

/** Documented categorical slots, in documented order. */
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

/**
 * Sequential blue ramp for the activity calendar.
 * Light: near-zero recedes toward the white surface.
 * Dark: the anchor flips — near-zero sits close to the dark surface instead.
 */
const SEQUENTIAL_LIGHT = ['#cde2fb', '#9ec5f4', '#5598e7', '#2a78d6', '#184f95']
const SEQUENTIAL_DARK = ['#173252', '#184f95', '#256abf', '#3987e5', '#6da7ec']

export type ChartScheme = 'light' | 'dark'

export interface ChartPalette {
  scheme: ChartScheme
  /** Slot colours in fixed order. */
  categorical: string[]
  sequential: string[]
  /** Fold-to-"Other" colour for a 9th and beyond series. */
  other: string
}

export function getChartPalette(scheme: ChartScheme): ChartPalette {
  return {
    scheme,
    categorical: scheme === 'light' ? CATEGORICAL_LIGHT : CATEGORICAL_DARK,
    sequential: scheme === 'light' ? SEQUENTIAL_LIGHT : SEQUENTIAL_DARK,
    other: scheme === 'light' ? '#898781' : '#898781'
  }
}

/**
 * Assign a colour to a reminder kind.
 *
 * Assignment is by the kind's position in the catalog — a *fixed* property of the
 * entity — never by its rank in the current chart. Filtering a series out
 * therefore never repaints the survivors.
 *
 * Past eight kinds the tail folds into the neutral "Other" colour rather than
 * generating a ninth hue, which would be indistinguishable under CVD.
 */
export function seriesColor(palette: ChartPalette, catalogIndex: number): string {
  return palette.categorical[catalogIndex] ?? palette.other
}

/** Bucket a value 0..max onto the sequential ramp. `0` returns null (empty cell). */
export function sequentialStep(palette: ChartPalette, value: number, max: number): string | null {
  if (value <= 0) return null
  if (max <= 0) return palette.sequential[0]!
  const ratio = value / max
  const index = Math.min(palette.sequential.length - 1, Math.floor(ratio * palette.sequential.length))
  return palette.sequential[index]!
}
