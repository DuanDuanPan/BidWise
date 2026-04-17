import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDocumentLoad = vi.fn()
vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: (...args: unknown[]) => mockDocumentLoad(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { chapterSummaryAgentHandler } from '@main/services/agent-orchestrator/agents/chapter-summary-agent'

beforeEach(() => {
  mockDocumentLoad.mockReset()
})

describe('@story-3-12 chapterSummaryAgentHandler', () => {
  const signal = new AbortController().signal
  const updateProgress = vi.fn()

  const sampleMd = [
    '# Proposal',
    '## 系统架构',
    '本章承诺 99.9% SLA，工期 180 天。',
    '### 子章节一',
    '这里是子章节内容，不应该被直属正文覆盖。',
    '## 部署方案',
    '另一章内容',
  ].join('\n')

  it('@p0 loads document and includes direct body in prompt, excluding sub-sections', async () => {
    mockDocumentLoad.mockResolvedValue({ content: sampleMd })

    const result = await chapterSummaryAgentHandler(
      {
        projectId: 'proj-1',
        locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
      },
      { signal, updateProgress }
    )

    expect(mockDocumentLoad).toHaveBeenCalledWith('proj-1')
    const userMsg = result.messages[1].content
    expect(userMsg).toContain('99.9% SLA')
    expect(userMsg).not.toContain('子章节内容')
    expect(userMsg).not.toContain('另一章内容')
    expect(result.maxTokens).toBe(512)
  })

  it('@p0 throws when projectId or locator missing', async () => {
    await expect(chapterSummaryAgentHandler({}, { signal, updateProgress })).rejects.toThrow(
      /projectId 或 locator/
    )
  })

  it('@p0 prefers pre-extracted directBody over disk when the caller supplies one', async () => {
    // Stale disk body vs caller-supplied directBody (computed against the
    // freshly-applied document): agent must summarise the directBody so a
    // just-written edit never gets captured against the pre-edit document
    // (Story 3.12 stale-summary race), and the queue row stays small.
    const freshBody = '修订后：SLA 提升到 99.99%，工期缩短到 150 天。'
    mockDocumentLoad.mockResolvedValue({ content: sampleMd })

    const result = await chapterSummaryAgentHandler(
      {
        projectId: 'proj-1',
        locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
        directBody: freshBody,
      },
      { signal, updateProgress }
    )

    expect(mockDocumentLoad).not.toHaveBeenCalled()
    const userMsg = result.messages[1].content
    expect(userMsg).toContain('99.99%')
    expect(userMsg).not.toContain('99.9% SLA')
  })

  it('@p1 reports progress milestones', async () => {
    mockDocumentLoad.mockResolvedValue({ content: sampleMd })
    const updates: Array<[number, string?]> = []
    const progress = (p: number, m?: string): void => {
      updates.push([p, m])
    }

    await chapterSummaryAgentHandler(
      {
        projectId: 'proj-1',
        locator: { title: '系统架构', level: 2, occurrenceIndex: 0 },
      },
      { signal, updateProgress: progress }
    )

    expect(updates).toEqual(
      expect.arrayContaining([
        [10, 'loading-section'],
        [40, 'summarizing'],
      ])
    )
  })
})
