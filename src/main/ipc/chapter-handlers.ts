import { createIpcHandler } from './create-handler'
import { chapterGenerationService } from '@main/services/chapter-generation-service'
import type { IpcChannel } from '@shared/ipc-types'

type ChapterChannel = Extract<IpcChannel, `chapter:${string}`>

const chapterHandlerMap: { [C in ChapterChannel]: () => void } = {
  'chapter:generate': () =>
    createIpcHandler('chapter:generate', (input) =>
      chapterGenerationService.generateChapter(input.projectId, input.target)
    ),
  'chapter:regenerate': () =>
    createIpcHandler('chapter:regenerate', (input) =>
      chapterGenerationService.regenerateChapter(
        input.projectId,
        input.target,
        input.additionalContext
      )
    ),
}

export type RegisteredChapterChannels = ChapterChannel

export function registerChapterHandlers(): void {
  for (const register of Object.values(chapterHandlerMap)) {
    register()
  }
}
