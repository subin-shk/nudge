/**
 * Ambient declaration of the preload bridge for renderer code.
 *
 * Referenced by tsconfig.web.json, so every renderer gets `window.nudge` fully
 * typed from the same source as the implementation — no hand-maintained
 * duplicate interface that can silently drift out of date.
 */

import type { NudgeApi } from './index'

declare global {
  interface Window {
    nudge: NudgeApi
  }
}

export {}
