/**
 * Crash-safe file helpers.
 *
 * A wellness app is expected to run for months without being closed, which
 * means it *will* be alive during an OS crash or a forced restart. Every
 * whole-file write therefore goes temp-file → fsync → rename, so a torn write
 * can never leave a user with unparseable settings or a corrupt rollup.
 */

import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export async function ensureDir(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true })
}

/**
 * Write `contents` to `filePath` atomically.
 *
 * `rename` within the same directory is atomic on NTFS and POSIX alike, so a
 * reader either sees the whole old file or the whole new one.
 */
export async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const directory = dirname(filePath)
  await ensureDir(directory)
  const tempPath = join(directory, `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`)

  let handle: import('node:fs').promises.FileHandle | null = null
  try {
    handle = await fs.open(tempPath, 'w')
    await handle.writeFile(contents, 'utf8')
    // Flush to the platter before the rename — otherwise the rename can land
    // while the data is still only in the page cache.
    await handle.sync()
  } finally {
    await handle?.close()
  }

  await fs.rename(tempPath, filePath)
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(value, null, 2))
}

/** Read and parse JSON. Returns `null` for missing OR unparseable files. */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Append a line to an NDJSON file, creating parent directories as needed. */
export async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(dirname(filePath))
  await fs.appendFile(filePath, `${line}\n`, 'utf8')
}

/**
 * Read an NDJSON file into an array, skipping malformed lines.
 *
 * Skipping rather than throwing is the right call for an append-only log: one
 * half-written final line (the classic power-loss signature) must not cost the
 * user their entire month of history.
 */
export async function readNdjson<T>(filePath: string): Promise<T[]> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return []
  }

  const out: T[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      out.push(JSON.parse(trimmed) as T)
    } catch {
      /* tolerate a torn tail */
    }
  }
  return out
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export async function removeIfExists(target: string): Promise<void> {
  await fs.rm(target, { force: true, recursive: true })
}

export async function listFiles(directory: string): Promise<string[]> {
  try {
    return await fs.readdir(directory)
  } catch {
    return []
  }
}
