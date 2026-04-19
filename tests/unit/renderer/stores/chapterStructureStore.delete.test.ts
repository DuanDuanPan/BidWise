import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { useDocumentStore } from '@renderer/stores/documentStore'
import type { PendingStructureDeletionSummary } from '@shared/chapter-types'

const sidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sidB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function summary(
  overrides: Partial<PendingStructureDeletionSummary> = {}
): PendingStructureDeletionSummary {
  return {
    deletionId: 'del-1',
    deletedAt: '2026-04-18T00:00:00.000Z',
    expiresAt: '2026-04-18T00:00:05.000Z',
    rootSectionId: sidA,
    sectionIds: [sidA, sidB],
    firstTitle: '根',
    totalWordCount: 42,
    subtreeSize: 2,
    ...overrides,
  }
}

describe('@story-11-4 chapterStructureStore delete lifecycle', () => {
  beforeEach(() => {
    useChapterStructureStore.getState().reset()
    const applyStructureSnapshot = vi.fn()
    useDocumentStore.setState({
      applyStructureSnapshot: applyStructureSnapshot as never,
      editingLocked: false,
      loadedProjectId: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('soft-delete success hydrates activePendingDeletion + pendingDeleteBySectionId and applies snapshot', async () => {
    const s = summary()
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi.fn().mockResolvedValue({
        success: true,
        data: {
          deletionId: s.deletionId,
          deletedAt: s.deletedAt,
          expiresAt: s.expiresAt,
          lastSavedAt: '2026-04-18T00:00:01.000Z',
          markdown: '# 兄弟',
          sectionIndex: [],
          summary: s,
        },
      }),
      chapterStructureFinalizeDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      chapterStructureUndoDelete: vi.fn(),
    })

    const outcome = await useChapterStructureStore.getState().requestSoftDelete('p', [sidA, sidB])
    expect(outcome.ok).toBe(true)
    const state = useChapterStructureStore.getState()
    expect(state.activePendingDeletion?.deletionId).toBe(s.deletionId)
    expect(state.pendingDeleteBySectionId[sidA]?.expiresAt).toBe(s.expiresAt)
    expect(state.pendingDeleteBySectionId[sidB]?.expiresAt).toBe(s.expiresAt)
    expect(useDocumentStore.getState().applyStructureSnapshot).toHaveBeenCalledWith('p', {
      content: '# 兄弟',
      sectionIndex: [],
      lastSavedAt: '2026-04-18T00:00:01.000Z',
    })
  })

  it('second soft-delete replaces the previous active window via finalize', async () => {
    const first = summary({ deletionId: 'del-1' })
    const second = summary({ deletionId: 'del-2' })
    const finalizeSpy = vi.fn().mockResolvedValue({ success: true, data: undefined })
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: {
            deletionId: first.deletionId,
            deletedAt: first.deletedAt,
            expiresAt: first.expiresAt,
            lastSavedAt: '2026-04-18T00:00:01.000Z',
            markdown: '',
            sectionIndex: [],
            summary: first,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            deletionId: second.deletionId,
            deletedAt: second.deletedAt,
            expiresAt: second.expiresAt,
            lastSavedAt: '2026-04-18T00:00:02.000Z',
            markdown: '',
            sectionIndex: [],
            summary: second,
          },
        }),
      chapterStructureFinalizeDelete: finalizeSpy,
      chapterStructureUndoDelete: vi.fn(),
    })

    await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    expect(finalizeSpy).toHaveBeenCalledWith({ projectId: 'p', deletionId: 'del-1' })
    expect(useChapterStructureStore.getState().activePendingDeletion?.deletionId).toBe('del-2')
  })

  it('undoPendingDelete clears activePendingDeletion and pendingDelete rows', async () => {
    useChapterStructureStore.getState().hydratePendingDeletion(summary())
    vi.stubGlobal('api', {
      chapterStructureUndoDelete: vi.fn().mockResolvedValue({
        success: true,
        data: {
          lastSavedAt: '2026-04-18T00:00:03.000Z',
          markdown: '# 根\n## 子节点\n',
          sectionIndex: [],
        },
      }),
    })
    const res = await useChapterStructureStore.getState().undoPendingDelete('p', 'del-1')
    expect(res.ok).toBe(true)
    const state = useChapterStructureStore.getState()
    expect(state.activePendingDeletion).toBeNull()
    expect(state.pendingDeleteBySectionId[sidA]).toBeUndefined()
  })

  it('undoPendingDelete rejects when deletionId does not match the active window', async () => {
    useChapterStructureStore.getState().hydratePendingDeletion(summary({ deletionId: 'other' }))
    const res = await useChapterStructureStore.getState().undoPendingDelete('p', 'del-1')
    expect(res.ok).toBe(false)
  })

  it('hydratePendingDeletion projects sectionIds into pendingDeleteBySectionId', () => {
    useChapterStructureStore.getState().hydratePendingDeletion(summary())
    const state = useChapterStructureStore.getState()
    expect(state.activePendingDeletion?.deletionId).toBe('del-1')
    expect(Object.keys(state.pendingDeleteBySectionId).sort()).toEqual([sidA, sidB].sort())
    useChapterStructureStore.getState().hydratePendingDeletion(null)
    expect(useChapterStructureStore.getState().activePendingDeletion).toBeNull()
    expect(useChapterStructureStore.getState().pendingDeleteBySectionId).toEqual({})
  })

  it('requestSoftDelete rejects when any target is locked', async () => {
    useChapterStructureStore.getState().markLocked(sidA)
    const res = await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    expect(res.ok).toBe(false)
  })

  it('requestSoftDelete rejects reentrant calls with reason=mutating', async () => {
    useChapterStructureStore.setState({ mutating: true })
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi.fn(),
    })
    const res = await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('mutating')
    expect(window.api.chapterStructureSoftDelete).not.toHaveBeenCalled()
  })

  it('hydrateActivePendingDeletion fetches the active window and seeds activePendingDeletion', async () => {
    const s = summary({
      sectionIndexEntries: [
        {
          sectionId: sidA,
          title: '根',
          level: 1,
          order: 0,
          occurrenceIndex: 0,
          headingLocator: { title: '根', level: 1, occurrenceIndex: 0 },
        },
      ],
    })
    vi.stubGlobal('api', {
      chapterStructureListPendingDeletions: vi.fn().mockResolvedValue({ success: true, data: s }),
    })
    useChapterStructureStore.getState().bindProject('p')
    await useChapterStructureStore.getState().hydrateActivePendingDeletion('p')
    const state = useChapterStructureStore.getState()
    expect(state.activePendingDeletion?.deletionId).toBe(s.deletionId)
    expect(state.pendingDeleteBySectionId[sidA]?.expiresAt).toBe(s.expiresAt)
  })

  it('hydrateActivePendingDeletion drops the response when the project has switched mid-IPC', async () => {
    // Simulate: bind to project A, kick off hydrate, bind to B before the IPC
    // response arrives. A's late payload must not land inside B's store.
    useChapterStructureStore.getState().bindProject('A')
    let resolveA: (value: unknown) => void = () => {}
    const pending = new Promise((resolve) => {
      resolveA = resolve
    })
    vi.stubGlobal('api', {
      chapterStructureListPendingDeletions: vi.fn().mockImplementation(() => pending),
    })
    const hydratePromise = useChapterStructureStore.getState().hydrateActivePendingDeletion('A')
    // User navigates to project B before the response returns.
    useChapterStructureStore.getState().bindProject('B')
    resolveA({ success: true, data: summary({ deletionId: 'del-A' }) })
    await hydratePromise
    const state = useChapterStructureStore.getState()
    expect(state.boundProjectId).toBe('B')
    expect(state.activePendingDeletion).toBeNull()
    expect(state.pendingDeleteBySectionId[sidA]).toBeUndefined()
  })

  it('hydrateActivePendingDeletion clears state when the main side reports no active window', async () => {
    useChapterStructureStore.getState().bindProject('p')
    useChapterStructureStore.getState().hydratePendingDeletion(summary())
    vi.stubGlobal('api', {
      chapterStructureListPendingDeletions: vi
        .fn()
        .mockResolvedValue({ success: true, data: null }),
    })
    await useChapterStructureStore.getState().hydrateActivePendingDeletion('p')
    expect(useChapterStructureStore.getState().activePendingDeletion).toBeNull()
  })

  it('requestSoftDelete holds the document-store editing lock across the IPC round-trip', async () => {
    const s = summary()
    const lockObservations: boolean[] = []
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi.fn().mockImplementation(async () => {
        lockObservations.push(useDocumentStore.getState().editingLocked)
        return {
          success: true,
          data: {
            deletionId: s.deletionId,
            deletedAt: s.deletedAt,
            expiresAt: s.expiresAt,
            lastSavedAt: '2026-04-18T00:00:01.000Z',
            markdown: '',
            sectionIndex: [],
            summary: s,
          },
        }
      }),
      chapterStructureFinalizeDelete: vi.fn(),
      chapterStructureUndoDelete: vi.fn(),
    })
    await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    expect(lockObservations).toEqual([true])
    // Lock released in finally.
    expect(useDocumentStore.getState().editingLocked).toBe(false)
    expect(useChapterStructureStore.getState().mutating).toBe(false)
  })

  it('requestSoftDelete keeps the finalize countdown alive after the store rebinds to another project', async () => {
    vi.useFakeTimers()
    const expiresAt = new Date(Date.now() + 60).toISOString()
    const finalizeSpy = vi.fn().mockResolvedValue({ success: true, data: undefined })
    vi.stubGlobal('api', {
      chapterStructureSoftDelete: vi.fn().mockResolvedValue({
        success: true,
        data: {
          deletionId: 'del-1',
          deletedAt: '2026-04-18T00:00:00.000Z',
          expiresAt,
          lastSavedAt: '2026-04-18T00:00:01.000Z',
          markdown: '',
          sectionIndex: [],
          summary: summary({ expiresAt }),
        },
      }),
      chapterStructureFinalizeDelete: finalizeSpy,
      chapterStructureUndoDelete: vi.fn(),
    })

    useChapterStructureStore.getState().bindProject('p')
    await useChapterStructureStore.getState().requestSoftDelete('p', [sidA])
    useChapterStructureStore.getState().bindProject('other-project')

    await vi.advanceTimersByTimeAsync(100)

    expect(finalizeSpy).toHaveBeenCalledWith({ projectId: 'p', deletionId: 'del-1' })
  })
})
