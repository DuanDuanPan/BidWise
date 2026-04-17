import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()
vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { chapterSummaryService } from '@main/services/chapter-summary-service'

beforeEach(() => {
  mockExecute.mockReset()
})

describe('@story-3-12 chapterSummaryService.enqueueExtraction', () => {
  it('@p0 enqueues a chapter-summary agent task with low priority and correct options', async () => {
    mockExecute.mockResolvedValue({ taskId: 'task-1' })

    const out = await chapterSummaryService.enqueueExtraction({
      projectId: 'proj-1',
      locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
    })

    expect(out).toEqual({ taskId: 'task-1' })
    expect(mockExecute).toHaveBeenCalledTimes(1)
    const [request] = mockExecute.mock.calls[0]
    expect(request.agentType).toBe('chapter-summary')
    expect(request.context.projectId).toBe('proj-1')
    expect(request.context.locator.title).toBe('系统架构')
    expect(request.options.priority).toBe('low')
    expect(request.options.maxRetries).toBe(2)
    expect(request.options.timeoutMs).toBe(60_000)
    expect(request.context.directBody).toBeUndefined()
  })

  it('@p0 threads directBody into agent context when supplied', async () => {
    mockExecute.mockResolvedValue({ taskId: 'task-direct' })

    await chapterSummaryService.enqueueExtraction({
      projectId: 'proj-1',
      locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
      directBody: '本章承诺 99.99% SLA。',
    })

    const [request] = mockExecute.mock.calls[0]
    expect(request.context.directBody).toBe('本章承诺 99.99% SLA。')
  })

  it('@p1 does NOT carry a whole-document payload in the persisted context', async () => {
    // Guard against the SQLite bloat regression — passing markdownSnapshot
    // (full document) would end up serialised into tasks.input on every
    // summary refresh.
    mockExecute.mockResolvedValue({ taskId: 'task-size' })
    await chapterSummaryService.enqueueExtraction({
      projectId: 'proj-1',
      locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
      directBody: '短章节正文',
    } as unknown as Parameters<typeof chapterSummaryService.enqueueExtraction>[0])

    const [request] = mockExecute.mock.calls[0]
    expect(request.context).not.toHaveProperty('markdownSnapshot')
  })
})
