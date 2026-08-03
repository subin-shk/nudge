/**
 * Resolves the four renderer documents in both dev and packaged builds.
 *
 * `electron-vite` exposes its dev server as `ELECTRON_RENDERER_URL` and emits
 * the built HTML next to the compiled main bundle. Centralising the branch here
 * means no window class has to know which mode it is running in.
 */

import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

export type RendererEntry = 'index' | 'overlay' | 'mascot' | 'sound'

const DEV_SERVER = process.env['ELECTRON_RENDERER_URL']

export function isDev(): boolean {
  return Boolean(DEV_SERVER)
}

/**
 * Load `entry` into `window`.
 * `query` is appended as a search string — used to tell overlay windows which
 * display they are on without an extra IPC round trip.
 */
export function loadRendererEntry(
  window: BrowserWindow,
  entry: RendererEntry,
  query?: Record<string, string>
): Promise<void> {
  const search = query && Object.keys(query).length > 0 ? `?${new URLSearchParams(query).toString()}` : ''

  if (DEV_SERVER) {
    return window.loadURL(`${DEV_SERVER}/${entry}.html${search}`)
  }
  return window.loadFile(join(__dirname, `../renderer/${entry}.html`), {
    query: query ?? {}
  })
}

/** Absolute path to the compiled preload bundle. */
export function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

/** Absolute path to a file in `resources/`, in dev and when packaged. */
export function resourcePath(...segments: string[]): string {
  // Packaged: resources sit next to the app bundle (see electron-builder.yml).
  // Dev: they are in the repo root, two levels above out/main.
  const base = process.env.NODE_ENV === 'development' || isDev() ? join(__dirname, '../../resources') : join(process.resourcesPath, 'resources')
  return join(base, ...segments)
}
