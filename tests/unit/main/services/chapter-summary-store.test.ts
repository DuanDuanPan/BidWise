import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsState = new Map<string, string>()

const mockReadFile = vi.fn(async (path: string, _enc: string) => {
  if (!fsState.has(path)) {
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  }
  return fsState.get(path)!
})
const mockWriteFile = vi.fn(async (path: string, data: string, _enc: string) => {
  fsState.set(path, data)
})
const mockRename = vi.fn(async (from: string, to: string) => {
  const data = fsState.get(from)
  if (data !== undefined) {
    fsState.set(to, data)
    fsState.delete(from)
  }
})
const mockMkdir = vi.fn(async () => undefined)

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [string, string])),
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
  rename: (...args: unknown[]) => mockRename(...(args as [string, string])),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@main/utils/project-paths', () => ({
  resolveProjectDataPath: (projectId: string) => `/data/projects/${projectId}`,
}))

import { CHAPTER_SUMMARY_SIDECAR_VERSION } from '@shared/chapter-summary-types'
import type { ChapterSummaryEntry } from '@shared/chapter-summary-types'
import { chapterSummaryStore } from '@main/services/chapter-summary-store'

const SIDECAR_PATH = '/data/projects/proj-1/chapter-summaries.json'

function makeEntry(overrides: Partial<ChapterSummaryEntry> = {}): ChapterSummaryEntry {
  return {
    headingKey: '2:架构设计:0',
    headingTitle: '架构设计',
    headingLevel: 2,
    occurrenceIndex: 0,
    lineHash: 'hash-a',
    summary: '{"key_commitments":[],"numbers":[],"terms":[],"tone":""}',
    generatedAt: '2026-04-17T10:00:00.000Z',
    provider: 'claude',
    model: 'claude-opus-4-7',
    ...overrides,
  }
}

beforeEach(() => {
  fsState.clear()
  mockReadFile.mockClear()
  mockWriteFile.mockClear()
  mockRename.mockClear()
  mockMkdir.mockClear()
  chapterSummaryStore.resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chapterSummaryStore @story-3-12', () => {
  it('returns an empty sidecar when the file does not exist', async () => {
    const sidecar = await chapterSummaryStore.read('proj-1')
    expect(sidecar.entries).toEqual([])
    expect(sidecar.version).toBe(CHAPTER_SUMMARY_SIDECAR_VERSION)
  })

  it('treats malformed JSON as empty in-memory and does not throw', async () => {
    fsState.set(SIDECAR_PATH, '{not valid json')
    const sidecar = await chapterSummaryStore.read('proj-1')
    expect(sidecar.entries).toEqual([])
  })

  it('upserts a new entry and persists via tmp-rename', async () => {
    const entry = makeEntry()
    await chapterSummaryStore.upsert('proj-1', entry)

    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    expect(mockRename).toHaveBeenCalledTimes(1)
    const stored = JSON.parse(fsState.get(SIDECAR_PATH)!) as { entries: ChapterSummaryEntry[] }
    expect(stored.entries).toHaveLength(1)
    expect(stored.entries[0]).toMatchObject({ headingKey: entry.headingKey, lineHash: 'hash-a' })
  })

  it('overwrites an existing entry by (headingKey + occurrenceIndex)', async () => {
    await chapterSummaryStore.upsert('proj-1', makeEntry({ summary: 'first', lineHash: 'h1' }))
    await chapterSummaryStore.upsert('proj-1', makeEntry({ summary: 'second', lineHash: 'h2' }))

    const list = await chapterSummaryStore.list('proj-1')
    expect(list).toHaveLength(1)
    expect(list[0].summary).toBe('second')
    expect(list[0].lineHash).toBe('h2')
  })

  it('keeps duplicate-title chapters separated by occurrenceIndex', async () => {
    await chapterSummaryStore.upsert('proj-1', makeEntry({ occurrenceIndex: 0, summary: 'first' }))
    await chapterSummaryStore.upsert('proj-1', makeEntry({ occurrenceIndex: 1, summary: 'second' }))

    const list = await chapterSummaryStore.list('proj-1')
    expect(list).toHaveLength(2)
    expect(list.map((e) => e.summary).sort()).toEqual(['first', 'second'])
  })

  it('serialises concurrent upserts so no write is lost', async () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({
        headingKey: `2:section-${i}:0`,
        headingTitle: `section-${i}`,
        occurrenceIndex: 0,
      })
    )
    await Promise.all(entries.map((entry) => chapterSummaryStore.upsert('proj-1', entry)))

    const list = await chapterSummaryStore.list('proj-1')
    expect(list).toHaveLength(6)
    const titles = list.map((e) => e.headingTitle).sort()
    expect(titles).toEqual([
      'section-0',
      'section-1',
      'section-2',
      'section-3',
      'section-4',
      'section-5',
    ])
  })

  it('prunes entries whose (headingKey, occurrenceIndex) is no longer present', async () => {
    await chapterSummaryStore.upsert('proj-1', makeEntry({ headingKey: '2:keep:0' }))
    await chapterSummaryStore.upsert('proj-1', makeEntry({ headingKey: '2:gone:0' }))

    const presentKeys = new Set(['2:keep:0#0'])
    const result = await chapterSummaryStore.pruneMissing('proj-1', presentKeys)

    expect(result.removed).toBe(1)
    const list = await chapterSummaryStore.list('proj-1')
    expect(list).toHaveLength(1)
    expect(list[0].headingKey).toBe('2:keep:0')
  })
})
