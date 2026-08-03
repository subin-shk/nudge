/**
 * A zero-valued `AppRuntime`.
 *
 * The store needs a complete runtime object before the first IPC snapshot lands,
 * so components can render unconditionally instead of guarding every field with
 * `runtime?.focus?.status`. The UI shows this "empty" state for one frame during
 * bootstrap, which is why every number is 0 rather than a placeholder.
 */

import type { AppRuntime } from '@shared/types'
import { toDayKey } from '@shared/time'

export function emptyRuntime(): AppRuntime {
  const now = Date.now()
  return {
    revision: 0,
    now,
    reminders: {},
    focus: {
      status: 'idle',
      mode: 'timer',
      phase: 'focus',
      totalSeconds: 0,
      remainingSeconds: 0,
      startedAt: null,
      pomodoroCount: 0,
      todayFocusSeconds: 0
    },
    activeBreak: null,
    today: { day: toDayKey(now), focusSeconds: 0, completed: {}, skipped: {}, pomodoros: 0, goalsMet: [] },
    streak: { current: 0, best: 0, currentWeeks: 0, todayQualifies: false },
    quietHoursActive: false,
    doNotDisturbActive: false,
    userIdleSeconds: 0,
    mascotVisible: false,
    appVersion: '0.0.0'
  }
}
