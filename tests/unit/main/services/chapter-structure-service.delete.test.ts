import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProposalMetadata } from '@shared/models/proposal'
import type { PendingStructureDeletionSnapshot } from '@shared/chapter-types'

const {
  mockLoad,
  mockGetMetadata,
  mockSave,
  mockUpdateMetadata,
  mockAnnFind,
  mockAnnDelete,
  mockAnnInsert,
  mockLinkFind,
  mockLinkDelete,
  mockLinkInsert,
  mockNotifFind,
  mockNotifDelete,
  mockNotifInsert,
  mockSummaryList,
  mockSummaryRemove,
  mockSummaryExtract,
  mockSummaryInsert,
  mockProjectList,
  mockRebuildSnapshot,
} = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockGetMetadata: vi.fn(),
  mockSave: vi.fn(),
  mockUpdateMetadata: vi.fn(),
  mockAnnFind: vi.fn(),
  mockAnnDelete: vi.fn(),
  mockAnnInsert: vi.fn(),
  mockLinkFind: vi.fn(),
  mockLinkDelete: vi.fn(),
  mockLinkInsert: vi.fn(),
  mockNotifFind: vi.fn(),
  mockNotifDelete: vi.fn(),
  mockNotifInsert: vi.fn(),
  mockSummaryList: vi.fn(),
  mockSummaryRemove: vi.fn(),
  mockSummaryExtract: vi.fn(),
  mockSummaryInsert: vi.fn(),
  mockProjectList: vi.fn(),
  mockRebuildSnapshot: vi.fn(),
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: mockLoad,
    getMetadata: mockGetMetadata,
    save: mockSave,
    updateMetadata: mockUpdateMetadata,
  },
}))

vi.mock('@main/services/chapter-summary-store', () => ({
  chapterSummaryStore: {
    listBySectionIds: mockSummaryList,
    removeBySectionIds: mockSummaryRemove,
    extractBySectionIds: mockSummaryExtract,
    insertBatch: mockSummaryInsert,
  },
}))

vi.mock('@main/db/repositories/annotation-repo', () => ({
  AnnotationRepository: class {
    findByProjectAndSectionIds = mockAnnFind
    deleteByProjectAndSectionIds = mockAnnDelete
    insertBatch = mockAnnInsert
  },
}))

vi.mock('@main/db/repositories/traceability-link-repo', () => ({
  TraceabilityLinkRepository: class {
    findByProjectAndSectionIds = mockLinkFind
    deleteByProjectAndSectionIds = mockLinkDelete
    insertBatch = mockLinkInsert
  },
}))

vi.mock('@main/db/repositories/notification-repo', () => ({
  NotificationRepository: class {
    findByProjectAndSectionIds = mockNotifFind
    deleteByProjectAndSectionIds = mockNotifDelete
    insertBatch = mockNotifInsert
  },
}))

vi.mock('@main/services/project-service', () => ({
  projectService: {
    list: mockProjectList,
  },
}))

vi.mock('@main/services/document-parser/traceability-matrix-service-instance', () => ({
  traceabilityMatrixService: {
    rebuildSnapshot: mockRebuildSnapshot,
  },
}))

const UUID_ROOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_CHILD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

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

function buildMeta(overrides: Partial<ProposalMetadata> = {}): ProposalMetadata {
  return {
    version: '1.0',
    projectId: 'p',
    annotations: [],
    scores: [],
    sourceAttributions: [],
    baselineValidations: [],
    sectionIndex: [],
    lastSavedAt: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

const baseMarkdown = ['# 根', '## 子节点', '段落A', '# 兄弟'].join('\n')

const baseIndex = [
  entry({
    sectionId: UUID_ROOT,
    title: '根',
    level: 1,
    order: 0,
    headingLocator: { title: '根', level: 1, occurrenceIndex: 0 },
  }),
  entry({
    sectionId: UUID_CHILD,
    title: '子节点',
    level: 2,
    order: 0,
    parentSectionId: UUID_ROOT,
    headingLocator: { title: '子节点', level: 2, occurrenceIndex: 0 },
  }),
  entry({
    sectionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: '兄弟',
    level: 1,
    order: 1,
    headingLocator: { title: '兄弟', level: 1, occurrenceIndex: 0 },
  }),
]

function buildSnapshot(
  overrides: Partial<PendingStructureDeletionSnapshot> = {}
): PendingStructureDeletionSnapshot {
  return {
    deletionId: 'del-1',
    stage: 'active',
    deletedAt: '2026-04-18T00:00:00.000Z',
    expiresAt: '2026-04-18T00:00:05.000Z',
    rootSectionId: UUID_ROOT,
    sectionIds: [UUID_ROOT, UUID_CHILD],
    firstTitle: '根',
    subtreeMarkdown: '# 根\n## 子节点\n段落A',
    sectionIndexEntries: baseIndex.slice(0, 2) as never,
    restoreAnchor: {
      parentSectionId: null,
      previousSiblingSectionId: null,
      previousHeadingLocator: null,
    },
    totalWordCount: 7,
    cascade: {
      sectionWeights: [],
      confirmedSkeletonsBySectionId: {},
      annotations: [],
      sourceAttributions: [],
      baselineValidations: [],
      chapterSummaries: [],
      traceabilityLinks: [],
      sqliteAnnotations: [],
      sqliteTraceabilityLinks: [],
      sqliteNotifications: [],
    },
    ...overrides,
  }
}

describe('@story-11-4 chapter-structure delete lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    mockLoad.mockReset()
    mockGetMetadata.mockReset()
    mockSave.mockReset()
    mockUpdateMetadata.mockReset()
    mockAnnFind.mockReset().mockResolvedValue([])
    mockAnnDelete.mockReset().mockResolvedValue(0)
    mockAnnInsert.mockReset().mockResolvedValue(undefined)
    mockLinkFind.mockReset().mockResolvedValue([])
    mockLinkDelete.mockReset().mockResolvedValue(0)
    mockLinkInsert.mockReset().mockResolvedValue(undefined)
    mockNotifFind.mockReset().mockResolvedValue([])
    mockNotifDelete.mockReset().mockResolvedValue(0)
    mockNotifInsert.mockReset().mockResolvedValue(undefined)
    mockSummaryList.mockReset().mockResolvedValue([])
    mockSummaryRemove.mockReset().mockResolvedValue(undefined)
    mockSummaryExtract.mockReset().mockResolvedValue([])
    mockSummaryInsert.mockReset().mockResolvedValue(undefined)
    mockProjectList.mockReset().mockResolvedValue([])
    mockRebuildSnapshot.mockReset().mockResolvedValue(undefined)
  })

  async function loadService(): Promise<
    typeof import('@main/services/chapter-structure-delete-service').chapterStructureDeleteService
  > {
    const mod = await import('@main/services/chapter-structure-delete-service')
    return mod.chapterStructureDeleteService
  }

  it('requestSoftDelete stages + commits SQLite + activates journal entry', async () => {
    let current = buildMeta({
      sectionIndex: baseIndex as never,
    })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: baseMarkdown,
      lastSavedAt: '2026-04-18T00:00:00.000Z',
      version: 1,
    })
    mockSave.mockResolvedValue({ lastSavedAt: '2026-04-18T00:00:01.000Z' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })

    const service = await loadService()
    const result = await service.requestSoftDelete('p', [UUID_ROOT])

    expect(result.deletionId).toEqual(expect.any(String))
    expect(result.summary.rootSectionId).toBe(UUID_ROOT)
    expect(result.summary.sectionIds.sort()).toEqual([UUID_ROOT, UUID_CHILD].sort())
    expect(result.summary.totalWordCount).toBeGreaterThan(0)
    expect(result.lastSavedAt).toBe('2026-04-18T00:00:01.000Z')

    expect(mockAnnDelete).toHaveBeenCalledWith('p', expect.arrayContaining([UUID_ROOT, UUID_CHILD]))
    expect(mockLinkDelete).toHaveBeenCalled()
    expect(mockNotifDelete).toHaveBeenCalled()
    expect(mockSave).toHaveBeenCalledWith('p', expect.not.stringContaining('## 子节点'))

    // Journal flipped to active.
    const pending = current.pendingStructureDeletions ?? []
    expect(pending).toHaveLength(1)
    expect(pending[0].stage).toBe('active')
    expect(pending[0].sectionIds.sort()).toEqual([UUID_ROOT, UUID_CHILD].sort())
  })

  it('requestSoftDelete replaces any older active window before activating the new journal entry', async () => {
    const olderActive = buildSnapshot({
      deletionId: 'del-old',
      deletedAt: '2026-04-18T00:00:00.000Z',
      expiresAt: '2026-04-18T00:00:05.000Z',
    })
    let current = buildMeta({
      sectionIndex: baseIndex as never,
      pendingStructureDeletions: [olderActive],
    })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: baseMarkdown,
      lastSavedAt: '2026-04-18T00:00:00.000Z',
      version: 1,
    })
    mockSave.mockResolvedValue({ lastSavedAt: '2026-04-18T00:00:01.000Z' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })

    const service = await loadService()
    const result = await service.requestSoftDelete('p', [UUID_ROOT])

    expect(result.deletionId).not.toBe('del-old')
    expect(current.pendingStructureDeletions ?? []).toHaveLength(1)
    expect(current.pendingStructureDeletions?.[0]?.deletionId).toBe(result.deletionId)
    expect(current.pendingStructureDeletions?.[0]?.stage).toBe('active')
  })

  it('undoDelete restores markdown + sectionIndex and drops the snapshot', async () => {
    const snapshot = buildSnapshot()
    let current = buildMeta({
      sectionIndex: [baseIndex[2]] as never,
      pendingStructureDeletions: [snapshot],
    })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# 兄弟',
      lastSavedAt: '2026-04-18T00:00:02.000Z',
      version: 1,
    })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    mockSave.mockResolvedValue({ lastSavedAt: '2026-04-18T00:00:03.000Z' })

    const service = await loadService()
    const res = await service.undoDelete('p', 'del-1')

    expect(res.markdown).toContain('# 根')
    expect(res.markdown).toContain('## 子节点')
    expect(res.sectionIndex.length).toBe(3)
    expect(res.lastSavedAt).toBe('2026-04-18T00:00:03.000Z')
    expect(current.pendingStructureDeletions).toEqual([])
  })

  it('undoDelete drops older stale active journals when the latest window is undone', async () => {
    const olderActive = buildSnapshot({
      deletionId: 'del-old',
      deletedAt: '2026-04-18T00:00:00.000Z',
      expiresAt: '2026-04-18T00:00:05.000Z',
    })
    const latestActive = buildSnapshot({
      deletionId: 'del-new',
      deletedAt: '2026-04-18T00:00:02.000Z',
      expiresAt: '2026-04-18T00:00:07.000Z',
    })
    let current = buildMeta({
      sectionIndex: [baseIndex[2]] as never,
      pendingStructureDeletions: [olderActive, latestActive],
    })
    mockGetMetadata.mockImplementation(async () => current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '# 兄弟',
      lastSavedAt: '2026-04-18T00:00:02.000Z',
      version: 1,
    })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    mockSave.mockResolvedValue({ lastSavedAt: '2026-04-18T00:00:03.000Z' })

    const service = await loadService()
    await service.undoDelete('p', 'del-new')

    expect(current.pendingStructureDeletions ?? []).toEqual([])
  })

  it('finalizeDelete is idempotent for missing deletionId', async () => {
    let current = buildMeta({ pendingStructureDeletions: [] })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    const service = await loadService()
    await service.finalizeDelete('p', 'del-missing')
    // updater called once — returned current unchanged.
    expect(current.pendingStructureDeletions).toEqual([])
  })

  it('finalizeDelete of an older stale window keeps the newer active window', async () => {
    const stub = (id: string, stage: 'staged' | 'active'): PendingStructureDeletionSnapshot => ({
      deletionId: id,
      stage,
      deletedAt: '',
      expiresAt: '',
      rootSectionId: UUID_ROOT,
      sectionIds: [],
      firstTitle: '',
      subtreeMarkdown: '',
      sectionIndexEntries: [],
      restoreAnchor: {
        parentSectionId: null,
        previousSiblingSectionId: null,
        previousHeadingLocator: null,
      },
      totalWordCount: 0,
      cascade: {
        sectionWeights: [],
        confirmedSkeletonsBySectionId: {},
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        chapterSummaries: [],
        traceabilityLinks: [],
        sqliteAnnotations: [],
        sqliteTraceabilityLinks: [],
        sqliteNotifications: [],
      },
    })
    let current = buildMeta({
      pendingStructureDeletions: [stub('drop', 'active'), stub('keep', 'active')],
    })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })

    const service = await loadService()
    await service.finalizeDelete('p', 'drop')
    expect(current.pendingStructureDeletions?.map((s) => s.deletionId)).toEqual(['keep'])
  })

  it('requestSoftDelete snapshots chapter-summaries non-destructively and removes them only after the journal is durable', async () => {
    const summaryRows = [
      { sectionId: UUID_ROOT, headingKey: 'k', occurrenceIndex: 0, summary: 's', lineHash: 'h' },
    ]
    let current = buildMeta({ sectionIndex: baseIndex as never })
    const callOrder: string[] = []
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: baseMarkdown,
      lastSavedAt: '',
      version: 1,
    })
    mockSave.mockResolvedValue({ lastSavedAt: '' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      callOrder.push('updateMetadata')
      current = updater(current)
      return current
    })
    mockSummaryList.mockImplementation(async () => {
      callOrder.push('summary:list')
      return summaryRows
    })
    mockSummaryRemove.mockImplementation(async () => {
      callOrder.push('summary:remove')
    })

    const service = await loadService()
    const result = await service.requestSoftDelete('p', [UUID_ROOT])

    // Non-destructive read happens before the staged journal write; the
    // destructive remove happens between staged-write and SQLite deletes.
    const listIdx = callOrder.indexOf('summary:list')
    const firstMetaIdx = callOrder.indexOf('updateMetadata')
    const removeIdx = callOrder.indexOf('summary:remove')
    expect(listIdx).toBeLessThan(firstMetaIdx)
    expect(firstMetaIdx).toBeLessThan(removeIdx)

    // Summary carries the cascade's sectionIndex rows so the renderer can
    // render the pending-delete subtree during the 5s Undo window.
    expect(result.summary.sectionIndexEntries.map((e) => e.sectionId).sort()).toEqual(
      [UUID_ROOT, UUID_CHILD].sort()
    )
  })

  it('undoDelete keeps the journal entry until SQLite + sidecar + markdown restores complete', async () => {
    const snapshot: PendingStructureDeletionSnapshot = {
      deletionId: 'del-guard',
      stage: 'active',
      deletedAt: '',
      expiresAt: '',
      rootSectionId: UUID_ROOT,
      sectionIds: [UUID_ROOT, UUID_CHILD],
      firstTitle: '根',
      subtreeMarkdown: '# 根\n## 子节点\n段落A',
      sectionIndexEntries: baseIndex.slice(0, 2) as never,
      restoreAnchor: {
        parentSectionId: null,
        previousSiblingSectionId: null,
        previousHeadingLocator: null,
      },
      totalWordCount: 1,
      cascade: {
        sectionWeights: [],
        confirmedSkeletonsBySectionId: {},
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        chapterSummaries: [],
        traceabilityLinks: [],
        sqliteAnnotations: [],
        sqliteTraceabilityLinks: [],
        sqliteNotifications: [],
      },
    }
    let current = buildMeta({
      sectionIndex: [baseIndex[2]] as never,
      pendingStructureDeletions: [snapshot],
    })
    const journalPresentAtCall: boolean[] = []
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({ projectId: 'p', content: '# 兄弟', lastSavedAt: '', version: 1 })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    mockSave.mockImplementation(async () => {
      journalPresentAtCall.push((current.pendingStructureDeletions ?? []).length > 0)
      return { lastSavedAt: '' }
    })
    mockAnnInsert.mockImplementation(async () => {
      journalPresentAtCall.push((current.pendingStructureDeletions ?? []).length > 0)
    })
    mockSummaryInsert.mockImplementation(async () => {
      journalPresentAtCall.push((current.pendingStructureDeletions ?? []).length > 0)
    })

    const service = await loadService()
    await service.undoDelete('p', 'del-guard')

    // SQLite + sidecar + markdown restores all saw the journal entry still
    // present — it is only dropped in the final metadata write.
    expect(journalPresentAtCall.length).toBeGreaterThan(0)
    for (const present of journalPresentAtCall) {
      expect(present).toBe(true)
    }
    expect(current.pendingStructureDeletions).toEqual([])
  })

  it('getActivePendingDeletion returns the single active window and skips staged entries', async () => {
    const stub = (id: string, stage: 'staged' | 'active'): PendingStructureDeletionSnapshot => ({
      deletionId: id,
      stage,
      deletedAt: '2026-04-18T00:00:00.000Z',
      expiresAt: '2026-04-18T00:00:05.000Z',
      rootSectionId: UUID_ROOT,
      sectionIds: [UUID_ROOT],
      firstTitle: '根',
      subtreeMarkdown: '# 根',
      sectionIndexEntries: [baseIndex[0]] as never,
      restoreAnchor: {
        parentSectionId: null,
        previousSiblingSectionId: null,
        previousHeadingLocator: null,
      },
      totalWordCount: 1,
      cascade: {
        sectionWeights: [],
        confirmedSkeletonsBySectionId: {},
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        chapterSummaries: [],
        traceabilityLinks: [],
        sqliteAnnotations: [],
        sqliteTraceabilityLinks: [],
        sqliteNotifications: [],
      },
    })
    mockGetMetadata.mockResolvedValue(
      buildMeta({
        pendingStructureDeletions: [stub('staged-1', 'staged'), stub('active-1', 'active')],
      })
    )
    const service = await loadService()
    const res = await service.getActivePendingDeletion('p')
    expect(res?.deletionId).toBe('active-1')
    expect(res?.sectionIndexEntries.length).toBeGreaterThan(0)
  })

  it('getActivePendingDeletion returns the latest active window when metadata already contains duplicates', async () => {
    mockGetMetadata.mockResolvedValue(
      buildMeta({
        pendingStructureDeletions: [
          buildSnapshot({ deletionId: 'del-old', firstTitle: '旧窗口' }),
          buildSnapshot({
            deletionId: 'del-new',
            deletedAt: '2026-04-18T00:00:02.000Z',
            expiresAt: '2026-04-18T00:00:07.000Z',
            firstTitle: '新窗口',
          }),
        ],
      })
    )
    const service = await loadService()
    const res = await service.getActivePendingDeletion('p')
    expect(res?.deletionId).toBe('del-new')
    expect(res?.firstTitle).toBe('新窗口')
  })

  it('getActivePendingDeletion returns null when no journal entry exists', async () => {
    mockGetMetadata.mockResolvedValue(buildMeta({ pendingStructureDeletions: [] }))
    const service = await loadService()
    const res = await service.getActivePendingDeletion('p')
    expect(res).toBeNull()
  })

  it('finalizeDelete of the latest window also clears older stale active journals', async () => {
    let current = buildMeta({
      pendingStructureDeletions: [
        buildSnapshot({ deletionId: 'del-old', firstTitle: '旧窗口' }),
        buildSnapshot({
          deletionId: 'del-new',
          deletedAt: '2026-04-18T00:00:02.000Z',
          expiresAt: '2026-04-18T00:00:07.000Z',
          firstTitle: '新窗口',
        }),
      ],
    })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })

    const service = await loadService()
    await service.finalizeDelete('p', 'del-new')

    expect(current.pendingStructureDeletions ?? []).toEqual([])
  })

  it('requestSoftDelete rebuilds the traceability-matrix sidecar after the SQLite cascade', async () => {
    let current = buildMeta({ sectionIndex: baseIndex as never })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: baseMarkdown,
      lastSavedAt: '',
      version: 1,
    })
    mockSave.mockResolvedValue({ lastSavedAt: '' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    const service = await loadService()
    await service.requestSoftDelete('p', [UUID_ROOT])
    expect(mockRebuildSnapshot).toHaveBeenCalledWith('p')
  })

  it('undoDelete rebuilds the traceability-matrix sidecar after SQLite restore', async () => {
    const snapshot: PendingStructureDeletionSnapshot = {
      deletionId: 'del-trace',
      stage: 'active',
      deletedAt: '',
      expiresAt: '',
      rootSectionId: UUID_ROOT,
      sectionIds: [UUID_ROOT],
      firstTitle: '根',
      subtreeMarkdown: '# 根',
      sectionIndexEntries: [baseIndex[0]] as never,
      restoreAnchor: {
        parentSectionId: null,
        previousSiblingSectionId: null,
        previousHeadingLocator: null,
      },
      totalWordCount: 1,
      cascade: {
        sectionWeights: [],
        confirmedSkeletonsBySectionId: {},
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        chapterSummaries: [],
        traceabilityLinks: [],
        sqliteAnnotations: [],
        sqliteTraceabilityLinks: [],
        sqliteNotifications: [],
      },
    }
    let current = buildMeta({ pendingStructureDeletions: [snapshot] })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({ projectId: 'p', content: '', lastSavedAt: '', version: 1 })
    mockSave.mockResolvedValue({ lastSavedAt: '' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      return current
    })
    const service = await loadService()
    await service.undoDelete('p', 'del-trace')
    expect(mockRebuildSnapshot).toHaveBeenCalledWith('p')
  })

  it('cleanupPendingDeletionsOnStartup finalizes active + rolls back staged', async () => {
    const stub = (id: string, stage: 'staged' | 'active'): PendingStructureDeletionSnapshot => ({
      deletionId: id,
      stage,
      deletedAt: '',
      expiresAt: '',
      rootSectionId: UUID_ROOT,
      sectionIds: [UUID_ROOT],
      firstTitle: '根',
      subtreeMarkdown: '# 根',
      sectionIndexEntries: [baseIndex[0]] as never,
      restoreAnchor: {
        parentSectionId: null,
        previousSiblingSectionId: null,
        previousHeadingLocator: null,
      },
      totalWordCount: 1,
      cascade: {
        sectionWeights: [],
        confirmedSkeletonsBySectionId: {},
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        chapterSummaries: [],
        traceabilityLinks: [],
        sqliteAnnotations: [],
        sqliteTraceabilityLinks: [],
        sqliteNotifications: [],
      },
    })

    mockProjectList.mockResolvedValue([{ id: 'p', rootPath: '/tmp/p', name: 'p' }])
    let current = buildMeta({
      pendingStructureDeletions: [stub('active-1', 'active'), stub('staged-1', 'staged')],
    })
    mockGetMetadata.mockResolvedValue(current)
    mockLoad.mockResolvedValue({
      projectId: 'p',
      content: '',
      lastSavedAt: '',
      version: 1,
    })
    mockSave.mockResolvedValue({ lastSavedAt: '' })
    mockUpdateMetadata.mockImplementation(async (_pid, updater) => {
      current = updater(current)
      mockGetMetadata.mockResolvedValue(current)
      return current
    })

    const service = await loadService()
    const processed = await service.cleanupPendingDeletionsOnStartup()

    expect(processed).toBeGreaterThanOrEqual(1)
    expect(current.pendingStructureDeletions ?? []).toEqual([])
  })
})
