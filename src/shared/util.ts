/** Small dependency-free helpers shared by every process. */

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

/** Round to `step`, then clamp. Used by sliders so values stay canonical. */
export const snap = (value: number, step: number, min: number, max: number): number =>
  clamp(Math.round(value / step) * step, min, max)

/** RFC4122-ish id. `crypto.randomUUID` exists in Node 18+ and every Chromium we ship. */
export function createId(prefix = ''): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}_${uuid}` : uuid
}

export type Primitive = string | number | boolean | null | undefined

/** Recursive partial that stops descending into arrays. */
export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? Array<U>
    : { [K in keyof T]?: DeepPartial<T[K]> }

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Deep-merge `patch` into `base`, returning a NEW object.
 *
 * Arrays are replaced wholesale rather than merged element-wise: for settings
 * like `snoozeMinutes: [1, 5, 10]`, "the user set it to [5]" must mean exactly
 * [5], never [5, 5, 10].
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined || patch === null) return base
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as unknown as T

  const out: Record<string, unknown> = { ...base }
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue
    const baseValue = out[key]
    out[key] =
      isPlainObject(baseValue) && isPlainObject(patchValue)
        ? deepMerge(baseValue, patchValue as DeepPartial<typeof baseValue>)
        : patchValue
  }
  return out as T
}

/** Structural clone that survives IPC (settings are plain JSON by construction). */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Increment `map[key]`, tolerating a missing key. */
export function bump(map: Record<string, number>, key: string, by = 1): void {
  map[key] = (map[key] ?? 0) + by
}

/** Sum of a record's values. */
export function sumValues(map: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(map)) total += value
  return total
}

/** Coalesce a possibly-blank string to a fallback. */
export const orFallback = (value: string | null | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value : fallback

/** Trailing-edge debounce. Returned function also exposes `cancel`/`flush`. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): ((...args: A) => void) & { cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const run = (): void => {
    timer = null
    if (pending) {
      const args = pending
      pending = null
      fn(...args)
    }
  }

  const debounced = (...args: A): void => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, waitMs)
  }

  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  debounced.flush = (): void => {
    if (timer) clearTimeout(timer)
    run()
  }

  return debounced
}
