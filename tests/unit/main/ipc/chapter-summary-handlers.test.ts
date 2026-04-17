import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockHandle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
    }
  },
}))

const mockEnqueueExtraction = vi.fn()
vi.mock('@main/services/chapter-summary-service', () => ({
  chapterSummaryService: {
    enqueueExtraction: (...args: unknown[]) => mockEnqueueExtraction(...args),
  },
}))

import { registerChapterSummaryHandlers } from '@main/ipc/chapter-summary-handlers'

describe('@story-3-12 chapter-summary-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('@p0 registers chapter-summary:extract', () => {
    registerChapterSummaryHandlers()
    const channels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('chapter-summary:extract')
  })

  it('@p0 dispatches to chapterSummaryService.enqueueExtraction', async () => {
    registerChapterSummaryHandlers()
    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'chapter-summary:extract'
    )?.[1]
    expect(handler).toBeDefined()

    mockEnqueueExtraction.mockResolvedValue({ taskId: 'task-sum-1' })

    const input = {
      projectId: 'proj-1',
      locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
    }
    const result = await handler({}, input)
    expect(result).toEqual({ success: true, data: { taskId: 'task-sum-1' } })
    expect(mockEnqueueExtraction).toHaveBeenCalledWith(input)
  })
})
