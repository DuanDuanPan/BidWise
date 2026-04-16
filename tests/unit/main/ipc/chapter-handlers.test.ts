import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

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

const mockGenerateChapter = vi.fn()
const mockRegenerateChapter = vi.fn()
const mockSkeletonGenerate = vi.fn()
const mockSkeletonConfirm = vi.fn()
const mockBatchGenerate = vi.fn()
const mockBatchRetrySection = vi.fn()
const mockBatchSkipSection = vi.fn()

vi.mock('@main/services/chapter-generation-service', () => ({
  chapterGenerationService: {
    generateChapter: (...args: unknown[]) => mockGenerateChapter(...args),
    regenerateChapter: (...args: unknown[]) => mockRegenerateChapter(...args),
    skeletonGenerate: (...args: unknown[]) => mockSkeletonGenerate(...args),
    skeletonConfirm: (...args: unknown[]) => mockSkeletonConfirm(...args),
    batchGenerate: (...args: unknown[]) => mockBatchGenerate(...args),
    batchRetrySection: (...args: unknown[]) => mockBatchRetrySection(...args),
    batchSkipSection: (...args: unknown[]) => mockBatchSkipSection(...args),
  },
}))

import { registerChapterHandlers } from '@main/ipc/chapter-handlers'

describe('@story-3-4 chapter-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('@p0 should register chapter:generate and chapter:regenerate handlers', () => {
    registerChapterHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('chapter:generate')
    expect(registeredChannels).toContain('chapter:regenerate')
  })

  it('@p0 chapter:generate handler should dispatch to chapterGenerationService.generateChapter', async () => {
    registerChapterHandlers()

    const handler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'chapter:generate')?.[1]
    expect(handler).toBeDefined()

    mockGenerateChapter.mockResolvedValue({ taskId: 'task-ch-1' })

    const input = {
      projectId: 'proj-1',
      target: { title: '系统架构', level: 2, occurrenceIndex: 0 },
    }
    const result = await handler({}, input)

    expect(result).toEqual({ success: true, data: { taskId: 'task-ch-1' } })
    expect(mockGenerateChapter).toHaveBeenCalledWith('proj-1', input.target)
  })

  it('@p0 chapter:regenerate handler should dispatch to chapterGenerationService.regenerateChapter', async () => {
    registerChapterHandlers()

    const handler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'chapter:regenerate')?.[1]
    expect(handler).toBeDefined()

    mockRegenerateChapter.mockResolvedValue({ taskId: 'task-ch-2' })

    const input = {
      projectId: 'proj-1',
      target: { title: '技术方案', level: 2, occurrenceIndex: 0 },
      additionalContext: '更多技术细节',
    }
    const result = await handler({}, input)

    expect(result).toEqual({ success: true, data: { taskId: 'task-ch-2' } })
    expect(mockRegenerateChapter).toHaveBeenCalledWith('proj-1', input.target, '更多技术细节')
  })

  it('@p0 @story-3-11 should register chapter:batch-retry-section handler', () => {
    registerChapterHandlers()
    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('chapter:batch-retry-section')
  })

  it('@p0 @story-3-11 should register chapter:batch-skip-section handler', () => {
    registerChapterHandlers()
    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('chapter:batch-skip-section')
  })

  it('@p0 @story-3-11 batch-retry-section handler dispatches to batchRetrySection', async () => {
    registerChapterHandlers()
    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'chapter:batch-retry-section'
    )?.[1]
    expect(handler).toBeDefined()

    mockBatchRetrySection.mockResolvedValue({
      taskId: 'task-retry-1',
      batchId: 'batch-1',
      sectionIndex: 2,
    })

    const input = { projectId: 'proj-1', batchId: 'batch-1', sectionIndex: 2 }
    const result = await handler({}, input)

    expect(result).toEqual({
      success: true,
      data: { taskId: 'task-retry-1', batchId: 'batch-1', sectionIndex: 2 },
    })
    expect(mockBatchRetrySection).toHaveBeenCalledWith('proj-1', 'batch-1', 2)
  })

  it('@p0 @story-3-11 batch-skip-section handler dispatches to batchSkipSection', async () => {
    registerChapterHandlers()
    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'chapter:batch-skip-section'
    )?.[1]
    expect(handler).toBeDefined()

    mockBatchSkipSection.mockResolvedValue({
      batchId: 'batch-1',
      skippedSectionIndex: 1,
      nextTaskId: 'task-next-1',
      nextSectionIndex: 2,
    })

    const input = { projectId: 'proj-1', batchId: 'batch-1', sectionIndex: 1 }
    const result = await handler({}, input)

    expect(result).toEqual({
      success: true,
      data: {
        batchId: 'batch-1',
        skippedSectionIndex: 1,
        nextTaskId: 'task-next-1',
        nextSectionIndex: 2,
      },
    })
    expect(mockBatchSkipSection).toHaveBeenCalledWith('proj-1', 'batch-1', 1)
  })

  it('@p1 should wrap errors as ApiResponse error format', async () => {
    registerChapterHandlers()

    const handler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'chapter:generate')?.[1]

    const { BidWiseError } = await import('@main/utils/errors')
    mockGenerateChapter.mockRejectedValue(new BidWiseError('NOT_FOUND', '章节未找到'))

    const result = await handler(
      {},
      {
        projectId: 'proj-1',
        target: { title: '不存在', level: 2, occurrenceIndex: 0 },
      }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: '章节未找到' },
    })
  })
})
