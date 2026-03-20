import { createIpcHandler } from './create-handler'
import { taskQueue } from '@main/services/task-queue'
import type { IpcChannel } from '@shared/ipc-types'

type TaskChannel = Extract<IpcChannel, `task:${string}`>

const taskHandlerMap: { [C in TaskChannel]: () => void } = {
  'task:list': () =>
    createIpcHandler('task:list', (filter) => taskQueue.listTasks(filter ?? undefined)),
  'task:cancel': () => createIpcHandler('task:cancel', (taskId) => taskQueue.cancel(taskId)),
}

export type RegisteredTaskChannels = TaskChannel

export function registerTaskHandlers(): void {
  for (const register of Object.values(taskHandlerMap)) {
    register()
  }
}
