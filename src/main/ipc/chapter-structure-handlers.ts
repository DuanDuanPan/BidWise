import { createIpcHandler } from './create-handler'
import { chapterStructureService } from '@main/services/chapter-structure-service'
import type { IpcChannel } from '@shared/ipc-types'

type ChapterStructureChannel = Extract<IpcChannel, `chapter-structure:${string}`>

const handlerMap: { [C in ChapterStructureChannel]: () => void } = {
  'chapter-structure:list': () =>
    createIpcHandler('chapter-structure:list', (input) =>
      chapterStructureService.list(input.projectId)
    ),
  'chapter-structure:get': () =>
    createIpcHandler('chapter-structure:get', async (input) => {
      const entry = await chapterStructureService.get(input.projectId, input.sectionId)
      return entry ?? null
    }),
  'chapter-structure:tree': () =>
    createIpcHandler('chapter-structure:tree', (input) =>
      chapterStructureService.tree(input.projectId)
    ),
  'chapter-structure:path': () =>
    createIpcHandler('chapter-structure:path', (input) =>
      chapterStructureService.path(input.projectId, input.sectionId)
    ),
}

export type RegisteredChapterStructureChannels = ChapterStructureChannel

export function registerChapterStructureHandlers(): void {
  for (const register of Object.values(handlerMap)) {
    register()
  }
}
