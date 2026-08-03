import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * Tests cover the pure logic only — scheduling maths, streak rules, quiet-hours
 * windows, settings normalisation and event folding. Those are where a silent
 * regression would be genuinely expensive (a reminder that never fires, a streak
 * that resets wrongly) and where a test is cheap because the code is a total
 * function of its inputs.
 *
 * Deliberately NOT covered: Electron window plumbing and React rendering. Both
 * would need heavyweight harnesses to assert things a quick manual pass catches
 * faster.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Every date-sensitive test pins its own clock; this just keeps the default
    // deterministic for anything that forgets.
    globals: false
  }
})
