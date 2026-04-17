import { createIpcHandler } from './create-handler'
import { chapterSummaryService } from '@main/services/chapter-summary-service'
import type { IpcChannel } from '@shared/ipc-types'

type ChapterSummaryChannel = Extract<IpcChannel, `chapter-summary:${string}`>

const chapterSummaryHandlerMap: { [C in ChapterSummaryChannel]: () => void } = {
  'chapter-summary:extract': () =>
    createIpcHandler('chapter-summary:extract', (input) =>
      chapterSummaryService.enqueueExtraction(input)
    ),
}

export type RegisteredChapterSummaryChannels = ChapterSummaryChannel

export function registerChapterSummaryHandlers(): void {
  for (const register of Object.values(chapterSummaryHandlerMap)) {
    register()
  }
}
