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
  'chapter:skeleton-generate': () =>
    createIpcHandler('chapter:skeleton-generate', (input) =>
      chapterGenerationService.skeletonGenerate(input.projectId, input.target)
    ),
  'chapter:skeleton-confirm': () =>
    createIpcHandler('chapter:skeleton-confirm', (input) =>
      chapterGenerationService.skeletonConfirm(input.projectId, input.sectionId, input.plan)
    ),
  'chapter:batch-generate': () =>
    createIpcHandler('chapter:batch-generate', (input) =>
      chapterGenerationService.batchGenerate(input.projectId, input.target, input.sectionId)
    ),
  'chapter:batch-retry-section': () =>
    createIpcHandler('chapter:batch-retry-section', (input) =>
      chapterGenerationService.batchRetrySection(input.projectId, input.batchId, input.sectionIndex)
    ),
  'chapter:batch-skip-section': () =>
    createIpcHandler('chapter:batch-skip-section', (input) =>
      chapterGenerationService.batchSkipSection(input.projectId, input.batchId, input.sectionIndex)
    ),
}

export type RegisteredChapterChannels = ChapterChannel

export function registerChapterHandlers(): void {
  for (const register of Object.values(chapterHandlerMap)) {
    register()
  }
}
