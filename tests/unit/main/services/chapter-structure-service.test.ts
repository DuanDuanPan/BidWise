import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalMetadata } from '@shared/models/proposal'

const { mockLoad, mockGetMetadata, mockSave, mockUpdateMetadata } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockGetMetadata: vi.fn(),
  mockSave: vi.fn(),
  mockUpdateMetadata: vi.fn(),
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: mockLoad,
    getMetadata: mockGetMetadata,
    save: mockSave,
    updateMetadata: mockUpdateMetadata,
  },
}))

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function entry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    sectionId: 'x',
    title: 't',
    level: 1,
    order: 0,
    occurrenceIndex: 0,
    headingLocator: { title: 't', level: 1, occurrenceIndex: 0 },
    ...overrides,
  }
}

function buildMeta(
  sectionIndex: unknown[],
  overrides: Partial<ProposalMetadata> = {}
): ProposalMetadata {
  return {
    annotations: [],
    sourceAttributions: [],
    baselineValidations: [],
    // @ts-expect-error test fixture uses loose entries
    sectionIndex,
    ...overrides,
  }
}

describe('@story-11-2 chapterStructureService.updateTitle', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLoad.mockReset()
    mockGetMetadata.mockReset()
    mockSave.mockReset()
    mockUpdateMetadata.mockReset()
  })

  it('@p0 rejects empty title with ValidationError', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({ projectId: 'p', content: '', lastSavedAt: '', version: 1 })
    mockGetMetadata.mockResolvedValue(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
    await expect(chapterStructureService.updateTitle('p', UUID_A, '   ')).rejects.toThrow(
      /不能为空/
    )
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdateMetadata).not.toHaveBeenCalled()
  })

  it('@p0 rejects unknown sectionId with NotFoundError', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({ projectId: 'p', content: '', lastSavedAt: '', version: 1 })
    mockGetMetadata.mockResolvedValue(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
    await expect(chapterStructureService.updateTitle('p', UUID_B, '新')).rejects.toThrow(/不存在/)
  })

  it('@p0 rewrites markdown heading line and sectionIndex entry', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    const markdown = '# 旧标题\n\n正文内容\n\n## 子章节\n'
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: markdown,
      lastSavedAt: '',
      version: 1,
    })
    mockGetMetadata.mockResolvedValue(
      buildMeta([
        entry({
          sectionId: UUID_A,
          title: '旧标题',
          level: 1,
          headingLocator: { title: '旧标题', level: 1, occurrenceIndex: 0 },
        }),
      ])
    )
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) => {
        return updater(
          buildMeta([
            entry({
              sectionId: UUID_A,
              title: '旧标题',
              level: 1,
              headingLocator: { title: '旧标题', level: 1, occurrenceIndex: 0 },
            }),
          ])
        )
      }
    )

    const result = await chapterStructureService.updateTitle('p', UUID_A, '新标题')

    expect(mockSave).toHaveBeenCalledTimes(1)
    const [, writtenContent] = mockSave.mock.calls[0]
    expect(writtenContent).toBe('# 新标题\n\n正文内容\n\n## 子章节\n')
    expect(result.markdown).toBe('# 新标题\n\n正文内容\n\n## 子章节\n')
    expect(result.affectedSectionId).toBe(UUID_A)
    expect(result.focusLocator.title).toBe('新标题')
    expect(result.sectionIndex[0].title).toBe('新标题')
    expect(result.sectionIndex[0].headingLocator.title).toBe('新标题')
  })

  it('@p0 recomputes occurrenceIndex for duplicate titles after rename', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    const markdown = '## A\n## B\n## A\n'
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: markdown,
      lastSavedAt: '',
      version: 1,
    })
    const index = [
      entry({
        sectionId: UUID_A,
        title: 'A',
        level: 2,
        order: 0,
        occurrenceIndex: 0,
        headingLocator: { title: 'A', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_B,
        title: 'B',
        level: 2,
        order: 1,
        occurrenceIndex: 0,
        headingLocator: { title: 'B', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_C,
        title: 'A',
        level: 2,
        order: 2,
        occurrenceIndex: 1,
        headingLocator: { title: 'A', level: 2, occurrenceIndex: 1 },
      }),
    ]
    mockGetMetadata.mockResolvedValue(buildMeta(index))
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) => {
        return updater(buildMeta(index))
      }
    )

    // Rename entry B ("B" → "A") so the sequence becomes A, A, A
    await chapterStructureService.updateTitle('p', UUID_B, 'A')

    const updaterResult = mockUpdateMetadata.mock.results[0].value as Promise<ProposalMetadata>
    const meta = await updaterResult
    const entries = meta.sectionIndex ?? []
    expect(entries.map((e) => e.title)).toEqual(['A', 'A', 'A'])
    expect(entries.map((e) => e.occurrenceIndex)).toEqual([0, 1, 2])
    expect(entries.map((e) => e.headingLocator.occurrenceIndex)).toEqual([0, 1, 2])
  })

  it('@p0 metadata fails → markdown never written (cross-file consistency)', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# 旧\n正文\n',
      lastSavedAt: '',
      version: 1,
    })
    mockGetMetadata.mockResolvedValue(
      buildMeta([
        entry({
          sectionId: UUID_A,
          title: '旧',
          level: 1,
          headingLocator: { title: '旧', level: 1, occurrenceIndex: 0 },
        }),
      ])
    )
    mockUpdateMetadata.mockRejectedValue(new Error('metadata lock error'))

    await expect(chapterStructureService.updateTitle('p', UUID_A, '新')).rejects.toThrow(
      /metadata lock error/
    )
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('@p0 markdown save fails → metadata rolled back to preserve consistency', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# 旧\n正文\n',
      lastSavedAt: '',
      version: 1,
    })
    const originalMeta = buildMeta([
      entry({
        sectionId: UUID_A,
        title: '旧',
        level: 1,
        headingLocator: { title: '旧', level: 1, occurrenceIndex: 0 },
      }),
    ])
    mockGetMetadata.mockResolvedValue(originalMeta)

    const updaterCalls: Array<(m: ProposalMetadata) => ProposalMetadata> = []
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) => {
        updaterCalls.push(updater)
        return updater(originalMeta)
      }
    )
    mockSave.mockRejectedValue(new Error('disk write failed'))

    await expect(chapterStructureService.updateTitle('p', UUID_A, '新')).rejects.toThrow(
      /disk write failed/
    )

    // Two updateMetadata calls: first forward (rename), second rollback to original.
    expect(mockUpdateMetadata).toHaveBeenCalledTimes(2)
    // Rollback updater returns the original meta snapshot (identity of sectionIndex content).
    const rollbackResult = updaterCalls[1](originalMeta)
    expect(rollbackResult.sectionIndex).toEqual(originalMeta.sectionIndex)
  })

  it('@p0 rollback preserves concurrent non-sectionIndex metadata writes', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# 旧\n正文\n',
      lastSavedAt: '',
      version: 1,
    })
    const originalMeta = buildMeta([
      entry({
        sectionId: UUID_A,
        title: '旧',
        level: 1,
        headingLocator: { title: '旧', level: 1, occurrenceIndex: 0 },
      }),
    ])
    mockGetMetadata.mockResolvedValue(originalMeta)

    const updaterCalls: Array<(m: ProposalMetadata) => ProposalMetadata> = []
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) => {
        updaterCalls.push(updater)
        return updater(originalMeta)
      }
    )
    mockSave.mockRejectedValue(new Error('disk write failed'))

    await expect(chapterStructureService.updateTitle('p', UUID_A, '新')).rejects.toThrow(
      /disk write failed/
    )

    const concurrentMeta = buildMeta(originalMeta.sectionIndex ?? [], {
      writingStyleId: 'formal',
      annotations: [
        {
          id: 'ann-1',
          projectId: 'p',
          lineNumber: 1,
          content: '批注',
          author: 'reviewer',
          createdAt: '2026-04-18T00:00:00.000Z',
          updatedAt: '2026-04-18T00:00:00.000Z',
          status: 'open',
        },
      ],
    })

    const rollbackResult = updaterCalls[1](concurrentMeta)
    expect(rollbackResult.writingStyleId).toBe('formal')
    expect(rollbackResult.annotations).toEqual(concurrentMeta.annotations)
    expect(rollbackResult.sectionIndex).toEqual(originalMeta.sectionIndex)
  })

  it('@p1 markdown unchanged → no rollback path even when save would fail', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    // Empty markdown: nothing to rewrite, so save() is never called and rollback is unnecessary.
    mockLoad.mockResolvedValue({ projectId: 'p', content: '', lastSavedAt: '', version: 1 })
    mockGetMetadata.mockResolvedValue(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) =>
        updater(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
    )
    mockSave.mockRejectedValue(new Error('should not be called'))

    await chapterStructureService.updateTitle('p', UUID_A, '新')
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdateMetadata).toHaveBeenCalledTimes(1)
  })

  it('@p1 skips markdown save when proposal.md is empty', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({ projectId: 'p', content: '', lastSavedAt: '', version: 1 })
    mockGetMetadata.mockResolvedValue(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) => {
        return updater(buildMeta([entry({ sectionId: UUID_A, title: '旧' })]))
      }
    )

    await chapterStructureService.updateTitle('p', UUID_A, '新')
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockUpdateMetadata).toHaveBeenCalled()
  })
})

describe('@story-11-3 chapterStructureService structural mutations', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLoad.mockReset()
    mockGetMetadata.mockReset()
    mockSave.mockReset()
    mockUpdateMetadata.mockReset()
  })

  function setupProject(markdown: string, sectionIndex: unknown[]): void {
    mockLoad.mockResolvedValue({ projectId: 'p', content: markdown, lastSavedAt: '', version: 1 })
    mockGetMetadata.mockResolvedValue(buildMeta(sectionIndex))
    mockUpdateMetadata.mockImplementation(
      async (_projectId: string, updater: (m: ProposalMetadata) => ProposalMetadata) =>
        updater(buildMeta(sectionIndex))
    )
    mockSave.mockResolvedValue({ lastSavedAt: '2026-04-19T00:00:00.000Z' })
  }

  it('@p0 insertSibling appends a new sibling with fresh sectionId', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    const markdown = '## A\nbody A\n## B\n'
    setupProject(markdown, [
      entry({
        sectionId: UUID_A,
        title: 'A',
        level: 2,
        order: 0,
        headingLocator: { title: 'A', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_B,
        title: 'B',
        level: 2,
        order: 1,
        headingLocator: { title: 'B', level: 2, occurrenceIndex: 0 },
      }),
    ])
    const result = await chapterStructureService.insertSibling('p', UUID_A)
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(result.markdown).toContain('## 新章节')
    expect(result.createdSectionId).toBeDefined()
    expect(result.createdSectionId).not.toBe(UUID_A)
    expect(result.sectionIndex).toHaveLength(3)
    expect(result.sectionIndex.map((e) => e.title)).toEqual(['A', '新章节', 'B'])
  })

  it('@p0 indent rejects when no previous sibling', async () => {
    const { chapterStructureService, StructureBoundaryError } =
      await import('@main/services/chapter-structure-service')
    setupProject('## A\n### A.1\n', [
      entry({
        sectionId: UUID_A,
        title: 'A',
        level: 2,
        order: 0,
        headingLocator: { title: 'A', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_B,
        title: 'A.1',
        level: 3,
        order: 0,
        parentSectionId: UUID_A,
        headingLocator: { title: 'A.1', level: 3, occurrenceIndex: 0 },
      }),
    ])
    await expect(chapterStructureService.indent('p', UUID_B)).rejects.toBeInstanceOf(
      StructureBoundaryError
    )
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('@p0 indent moves target subtree under previous sibling and recomputes parent', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    setupProject('# A\n## B\n## C\n', [
      entry({
        sectionId: UUID_A,
        title: 'A',
        level: 1,
        order: 0,
        headingLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_B,
        title: 'B',
        level: 2,
        order: 0,
        parentSectionId: UUID_A,
        headingLocator: { title: 'B', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_C,
        title: 'C',
        level: 2,
        order: 1,
        parentSectionId: UUID_A,
        headingLocator: { title: 'C', level: 2, occurrenceIndex: 0 },
      }),
    ])
    const result = await chapterStructureService.indent('p', UUID_C)
    const cEntry = result.sectionIndex.find((e) => e.sectionId === UUID_C)!
    expect(cEntry.level).toBe(3)
    expect(cEntry.parentSectionId).toBe(UUID_B)
    expect(result.affectedSectionId).toBe(UUID_C)
  })

  it('@p0 outdent moves target subtree to grandparent', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    setupProject('## A\n### A.1\n## B\n', [
      entry({
        sectionId: UUID_A,
        title: 'A',
        level: 2,
        order: 0,
        headingLocator: { title: 'A', level: 2, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_B,
        title: 'A.1',
        level: 3,
        order: 0,
        parentSectionId: UUID_A,
        headingLocator: { title: 'A.1', level: 3, occurrenceIndex: 0 },
      }),
      entry({
        sectionId: UUID_C,
        title: 'B',
        level: 2,
        order: 1,
        headingLocator: { title: 'B', level: 2, occurrenceIndex: 0 },
      }),
    ])
    const result = await chapterStructureService.outdent('p', UUID_B)
    const a1 = result.sectionIndex.find((e) => e.sectionId === UUID_B)!
    expect(a1.level).toBe(2)
    expect(a1.parentSectionId).toBeUndefined()
    expect(result.markdown).toContain('## A.1')
  })

  it('@p1 metadata fails before markdown write keeps both files consistent', async () => {
    const { chapterStructureService } = await import('@main/services/chapter-structure-service')
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# A\n',
      lastSavedAt: '',
      version: 1,
    })
    mockGetMetadata.mockResolvedValue(
      buildMeta([
        entry({
          sectionId: UUID_A,
          title: 'A',
          level: 1,
          headingLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
        }),
      ])
    )
    mockUpdateMetadata.mockRejectedValue(new Error('metadata lock error'))

    await expect(chapterStructureService.insertSibling('p', UUID_A)).rejects.toThrow(
      /metadata lock error/
    )
    expect(mockSave).not.toHaveBeenCalled()
  })
})
