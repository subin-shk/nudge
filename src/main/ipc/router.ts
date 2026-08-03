/**
 * A thin, fully-typed wrapper over `ipcMain.handle`.
 *
 * Two jobs:
 *   • Bind handler signatures to `IpcCommandMap`, so a channel's request and
 *     response types are checked at compile time in the main process and again in
 *     the renderer through the preload façade.
 *   • Convert a thrown handler into a logged, serialisable rejection. An
 *     unhandled throw inside `ipcMain.handle` surfaces in the renderer as an
 *     opaque "Error invoking remote method", which is untraceable in production.
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcCommandChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import { createLogger } from '../util/logger'

const log = createLogger('ipc')

export type CommandHandler<K extends IpcCommandChannel> = (
  payload: IpcRequest<K>,
  event: IpcMainInvokeEvent
) => IpcResponse<K> | Promise<IpcResponse<K>>

export class IpcRouter {
  private registered = new Set<string>()

  handle<K extends IpcCommandChannel>(channel: K, handler: CommandHandler<K>): void {
    if (this.registered.has(channel)) {
      // Registering twice silently replaces the first handler in Electron; make
      // that a loud failure instead of a mystery.
      throw new Error(`IPC channel registered twice: ${channel}`)
    }
    this.registered.add(channel)

    ipcMain.handle(channel, async (event, payload: IpcRequest<K>) => {
      try {
        return await handler(payload, event)
      } catch (error) {
        log.error(`handler failed: ${channel}`, error)
        // Re-thrown with a stable message so the renderer can log something useful.
        throw new Error(`nudge-ipc-failed:${channel}: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }

  dispose(): void {
    for (const channel of this.registered) ipcMain.removeHandler(channel)
    this.registered.clear()
  }
}
