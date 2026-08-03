import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * Nudge build configuration.
 *
 * The app is composed of THREE processes and FOUR renderer entry points:
 *
 *   main      — Node/Electron "kernel": scheduling, storage, tray, windows, OS integration.
 *   preload   — the only bridge between main and renderer (contextIsolation is ON).
 *   renderer  — four separate HTML documents, each its own BrowserWindow:
 *                 index.html   → the dashboard / settings shell
 *                 overlay.html → full-screen break overlay (one per display)
 *                 mascot.html  → transparent, click-through desktop mascot strip
 *                 sound.html   → invisible 0×0 audio host (Web Audio lives here)
 *
 * Keeping them as separate documents means a heavy dashboard re-render can never
 * stutter the mascot's walk cycle, and the mascot window stays a few KB of DOM.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') }
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') }
      }
    }
  },

  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          mascot: resolve('src/renderer/mascot.html'),
          sound: resolve('src/renderer/sound.html')
        }
      }
    }
  }
})
