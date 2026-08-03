/**
 * A dependency-free levelled logger.
 *
 * Writes to stdout (visible during `electron-vite dev`) and appends to a rolling
 * file under the user data folder, because the number one support question for
 * any reminder app is "it didn't fire" — and that is unanswerable without a
 * timeline of what the scheduler actually did.
 *
 * Rotation is deliberately crude: one active file, one previous file, 1 MB cap.
 * Enough to diagnose a session; never enough to fill someone's disk.
 */

import { appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_BYTES = 1_024 * 1_024

let minLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
let logFile: string | null = null

export function configureLogger(options: { directory?: string; level?: LogLevel }): void {
  if (options.level) minLevel = options.level
  if (options.directory) {
    try {
      mkdirSync(options.directory, { recursive: true })
      logFile = join(options.directory, 'nudge.log')
    } catch {
      // A logger that crashes the app it is meant to diagnose is worse than
      // no log file at all — fall back to console-only.
      logFile = null
    }
  }
}

function rotateIfNeeded(): void {
  if (!logFile) return
  try {
    if (existsSync(logFile) && statSync(logFile).size > MAX_BYTES) {
      renameSync(logFile, `${logFile}.1`)
    }
  } catch {
    /* rotation is best-effort */
  }
}

function write(level: LogLevel, scope: string, message: string, extra: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return

  const timestamp = new Date().toISOString()
  const serialisedExtra = extra.length
    ? ' ' +
      extra
        .map((value) => {
          if (value instanceof Error) return `${value.name}: ${value.message}`
          if (typeof value === 'object' && value !== null) {
            try {
              return JSON.stringify(value)
            } catch {
              return '[unserialisable]'
            }
          }
          return String(value)
        })
        .join(' ')
    : ''

  const line = `${timestamp} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${serialisedExtra}`

  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(line)

  if (logFile) {
    rotateIfNeeded()
    try {
      appendFileSync(logFile, `${line}\n`, 'utf8')
    } catch {
      /* ignore */
    }
  }
}

export interface Logger {
  debug(message: string, ...extra: unknown[]): void
  info(message: string, ...extra: unknown[]): void
  warn(message: string, ...extra: unknown[]): void
  error(message: string, ...extra: unknown[]): void
  child(childScope: string): Logger
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, ...extra) => write('debug', scope, message, extra),
    info: (message, ...extra) => write('info', scope, message, extra),
    warn: (message, ...extra) => write('warn', scope, message, extra),
    error: (message, ...extra) => write('error', scope, message, extra),
    child: (childScope) => createLogger(`${scope}:${childScope}`)
  }
}

export function getLogFilePath(): string | null {
  return logFile
}
