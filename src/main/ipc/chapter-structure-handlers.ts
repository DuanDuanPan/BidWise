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
  'chapter-structure:update-title': () =>
    createIpcHandler('chapter-structure:update-title', (input) =>
      chapterStructureService.updateTitle(input.projectId, input.sectionId, input.title)
    ),
  'chapter-structure:insert-sibling': () =>
    createIpcHandler('chapter-structure:insert-sibling', (input) =>
      chapterStructureService.insertSibling(input.projectId, input.sectionId, input.title)
    ),
  'chapter-structure:insert-child': () =>
    createIpcHandler('chapter-structure:insert-child', (input) =>
      chapterStructureService.insertChild(input.projectId, input.parentSectionId, input.title)
    ),
  'chapter-structure:indent': () =>
    createIpcHandler('chapter-structure:indent', (input) =>
      chapterStructureService.indent(input.projectId, input.sectionId)
    ),
  'chapter-structure:outdent': () =>
    createIpcHandler('chapter-structure:outdent', (input) =>
      chapterStructureService.outdent(input.projectId, input.sectionId)
    ),
  'chapter-structure:move-subtree': () =>
    createIpcHandler('chapter-structure:move-subtree', (input) =>
      chapterStructureService.moveSubtree(
        input.projectId,
        input.dragSectionId,
        input.dropSectionId,
        input.placement
      )
    ),
}

export type RegisteredChapterStructureChannels = ChapterStructureChannel

export function registerChapterStructureHandlers(): void {
  for (const register of Object.values(handlerMap)) {
    register()
  }
}
