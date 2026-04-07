import { createIpcHandler } from './create-handler'
import { writingStyleService } from '@main/services/writing-style-service'
import type { IpcChannel } from '@shared/ipc-types'

type WritingStyleChannel = Extract<IpcChannel, `writing-style:${string}`>

const writingStyleHandlerMap: { [C in WritingStyleChannel]: () => void } = {
  'writing-style:list': () =>
    createIpcHandler('writing-style:list', async () => ({
      styles: await writingStyleService.listStyles(),
    })),
  'writing-style:get': () =>
    createIpcHandler('writing-style:get', async ({ styleId }) => ({
      style: await writingStyleService.getStyle(styleId),
    })),
  'writing-style:update-project': () =>
    createIpcHandler('writing-style:update-project', ({ projectId, writingStyleId }) =>
      writingStyleService.updateProjectWritingStyle(projectId, writingStyleId)
    ),
}

export type RegisteredWritingStyleChannels = WritingStyleChannel

export function registerWritingStyleHandlers(): void {
  for (const register of Object.values(writingStyleHandlerMap)) {
    register()
  }
}
