import { createIpcHandler } from './create-handler'
import { taskQueue } from '@main/services/task-queue'
import { NotFoundError } from '@main/utils/errors'
import type { IpcChannel } from '@shared/ipc-types'

type TaskChannel = Extract<IpcChannel, `task:${string}`>

const taskHandlerMap: { [C in TaskChannel]: () => void } = {
  'task:list': () =>
    createIpcHandler('task:list', (filter) => taskQueue.listTasks(filter ?? undefined)),
  'task:cancel': () => createIpcHandler('task:cancel', (taskId) => taskQueue.cancel(taskId)),
  'task:get-status': () =>
    createIpcHandler('task:get-status', async (input) => {
      try {
        return await taskQueue.getStatus(input.taskId)
      } catch (err) {
        if (err instanceof NotFoundError) return null
        throw err
      }
    }),
}

export type RegisteredTaskChannels = TaskChannel

export function registerTaskHandlers(): void {
  for (const register of Object.values(taskHandlerMap)) {
    register()
  }
}
