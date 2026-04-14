import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-types'
import type { TaskProgressEvent } from '@shared/ai-types'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('progress-emitter')
const THROTTLE_MS = 200

export class ProgressEmitter {
  private lastEmitTimes = new Map<string, number>()

  emit(event: TaskProgressEvent): void {
    const now = Date.now()
    const lastTime = this.lastEmitTimes.get(event.taskId) ?? 0

    // Always send terminal progress (100%) — never throttle the final event
    if (event.payload === undefined && event.progress < 100 && now - lastTime < THROTTLE_MS) {
      return
    }

    const hasPayload = event.payload !== undefined
    logger.debug(
      `emit: taskId=${event.taskId}, progress=${event.progress}, msg=${event.message ?? 'none'}, hasPayload=${hasPayload}`
    )

    this.lastEmitTimes.set(event.taskId, now)

    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send(IPC_CHANNELS.TASK_PROGRESS_EVENT, event)
        } catch {
          // Render frame may be disposed during HMR, reload, or window teardown.
          // Safe to ignore — the renderer will re-fetch state when it reconnects.
        }
      }
    }
  }

  /** Clear throttle state for a task (e.g. when task completes) */
  clear(taskId: string): void {
    this.lastEmitTimes.delete(taskId)
  }
}

export const progressEmitter = new ProgressEmitter()
