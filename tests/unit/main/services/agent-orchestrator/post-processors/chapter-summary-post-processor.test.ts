import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDocumentLoad = vi.fn()
vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: (...args: unknown[]) => mockDocumentLoad(...args),
  },
}))

const mockUpsert = vi.fn()
vi.mock('@main/services/chapter-summary-store', () => ({
  chapterSummaryStore: {
    upsert: (...args: unknown[]) => mockUpsert(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { chapterSummaryPostProcessor } from '@main/services/agent-orchestrator/post-processors/chapter-summary-post-processor'
import { CHAPTER_SUMMARY_MAX_LENGTH } from '@shared/chapter-summary-types'

const SIGNAL = new AbortController().signal
const LOCATOR = { title: '系统架构', level: 2 as const, occurrenceIndex: 0 }
const MD = ['## 系统架构', '承诺 99.9% SLA，工期 180 天。', '### 子章节', '不在直属正文。'].join(
  '\n'
)

beforeEach(() => {
  mockDocumentLoad.mockReset()
  mockUpsert.mockReset()
})

describe('@story-3-12 chapterSummaryPostProcessor', () => {
  it('@p0 parses structured JSON and persists with model/provider', async () => {
    mockDocumentLoad.mockResolvedValue({ content: MD })
    mockUpsert.mockResolvedValue(undefined)

    const raw = JSON.stringify({
      key_commitments: ['99.9% SLA'],
      numbers: [{ label: '工期', value: '180 天' }],
      terms: ['SLA'],
      tone: '正式',
    })

    const result = await chapterSummaryPostProcessor(
      {
        content: raw,
        usage: { promptTokens: 1, completionTokens: 1 },
        latencyMs: 1,
        provider: 'claude',
        model: 'claude-opus-4-7',
      },
      { projectId: 'proj-1', locator: LOCATOR },
      SIGNAL
    )

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [, entry] = mockUpsert.mock.calls[0]
    expect(entry.provider).toBe('claude')
    expect(entry.model).toBe('claude-opus-4-7')
    expect(entry.headingKey).toContain('系统架构')
    expect(entry.summary).toContain('key_commitments')
    expect(entry.summary.length).toBeLessThanOrEqual(CHAPTER_SUMMARY_MAX_LENGTH)
    expect(entry.lineHash).toHaveLength(16)
    expect(result.content).toBe(entry.summary)
  })

  it('@p0 falls back to direct-body truncation when JSON parse fails', async () => {
    mockDocumentLoad.mockResolvedValue({ content: MD })
    mockUpsert.mockResolvedValue(undefined)

    const badContent = '本章对齐总结：无可解析 JSON 输出。'

    await chapterSummaryPostProcessor(
      {
        content: badContent,
        usage: { promptTokens: 1, completionTokens: 1 },
        latencyMs: 1,
        provider: 'openai',
        model: 'gpt-4.1',
      },
      { projectId: 'proj-1', locator: LOCATOR },
      SIGNAL
    )

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [, entry] = mockUpsert.mock.calls[0]
    expect(entry.summary).toContain('99.9% SLA')
    expect(entry.provider).toBe('openai')
    expect(entry.model).toBe('gpt-4.1')
  })

  it('@p0 uses pre-extracted directBody for lineHash when supplied, not disk', async () => {
    // Agent summarises directBody; post-processor must digest the SAME
    // directBody — otherwise lineHash pairs a fresh-disk digest with a
    // stale-disk summary (or vice versa). Also keeps the queue row small
    // by never persisting a whole-document snapshot.
    const directBody = '新承诺：99.99% SLA。'
    mockUpsert.mockResolvedValue(undefined)

    await chapterSummaryPostProcessor(
      {
        content: JSON.stringify({
          key_commitments: ['99.99% SLA'],
          numbers: [],
          terms: [],
          tone: '',
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
        latencyMs: 1,
        provider: 'claude',
        model: 'claude-opus-4-7',
      },
      { projectId: 'proj-1', locator: LOCATOR, directBody },
      SIGNAL
    )

    expect(mockDocumentLoad).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [, entry] = mockUpsert.mock.calls[0]
    expect(entry.lineHash).toHaveLength(16)
  })

  it('@p1 skips persistence when projectId or locator missing', async () => {
    await chapterSummaryPostProcessor(
      {
        content: '{}',
        usage: { promptTokens: 0, completionTokens: 0 },
        latencyMs: 0,
      },
      {},
      SIGNAL
    )
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
