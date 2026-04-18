import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  useChapterStructureStore,
  deriveChapterNodeState,
  pendingSoftDeletes,
} from '@renderer/stores/chapterStructureStore'
import { useDocumentStore } from '@renderer/stores/documentStore'

const sidA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sidB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const sidC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('chapterStructureStore', () => {
  beforeEach(() => {
    useChapterStructureStore.getState().reset()
  })

  describe('priority: pending-delete > locked > editing > focused > idle (AC6)', () => {
    it('returns idle by default', () => {
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('idle')
    })

    it('returns focused after focusSection', () => {
      useChapterStructureStore.getState().focusSection(sidA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('focused')
    })

    it('returns editing when enterEditing is called on focused node', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidA)
      store.enterEditing(sidA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('editing')
    })

    it('editing outranks focused (priority rule)', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidA)
      store.enterEditing(sidA)
      store.focusSection(sidB)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('idle')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidB)).toBe('focused')
    })

    it('locked outranks editing', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidA)
      store.enterEditing(sidA)
      store.markLocked(sidA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('locked')
      expect(useChapterStructureStore.getState().editingSectionId).toBe(null)
    })

    it('pending-delete outranks locked', () => {
      const store = useChapterStructureStore.getState()
      store.markLocked(sidA)
      store.markPendingDelete([sidA], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe(
        'pending-delete'
      )
    })

    it('pending-delete outranks focused and clears focus on hit', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidA)
      store.markPendingDelete([sidA], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe(
        'pending-delete'
      )
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(null)
    })
  })

  describe('action guards', () => {
    it('enterEditing on a locked node is a no-op', () => {
      const store = useChapterStructureStore.getState()
      store.markLocked(sidA)
      store.enterEditing(sidA)
      expect(useChapterStructureStore.getState().editingSectionId).toBe(null)
    })

    it('enterEditing on a pending-delete node is a no-op', () => {
      const store = useChapterStructureStore.getState()
      store.markPendingDelete([sidA], '2026-04-18T00:00:10.000Z')
      store.enterEditing(sidA)
      expect(useChapterStructureStore.getState().editingSectionId).toBe(null)
    })

    it('unmarkLocked removes lock and returns to prior derived state', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidA)
      store.markLocked(sidA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('locked')
      store.unmarkLocked(sidA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('focused')
    })

    it('clearPendingDelete removes entry atomically', () => {
      const store = useChapterStructureStore.getState()
      store.markPendingDelete([sidA, sidB], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe(
        'pending-delete'
      )
      store.clearPendingDelete([sidA])
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidA)).toBe('idle')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), sidB)).toBe(
        'pending-delete'
      )
    })
  })

  describe('multi-node interactions', () => {
    it('markPendingDelete on multiple nodes clears editing if caught in the set', () => {
      const store = useChapterStructureStore.getState()
      store.focusSection(sidB)
      store.enterEditing(sidB)
      store.markPendingDelete([sidA, sidB, sidC], '2026-04-18T00:00:10.000Z')
      expect(useChapterStructureStore.getState().editingSectionId).toBe(null)
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(null)
      for (const key of [sidA, sidB, sidC]) {
        expect(deriveChapterNodeState(useChapterStructureStore.getState(), key)).toBe(
          'pending-delete'
        )
      }
    })
  })

  describe('mutation helpers (Story 11.3 identity invariance)', () => {
    const makeSnapshot = (affectedSectionId: string, createdSectionId?: string): unknown => ({
      markdown: '# A\n## B\n',
      sectionIndex: [
        {
          sectionId: affectedSectionId,
          title: 'A',
          level: 1,
          order: 0,
          occurrenceIndex: 0,
          headingLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
        },
      ],
      affectedSectionId,
      focusLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
      ...(createdSectionId ? { createdSectionId } : {}),
    })

    beforeEach(() => {
      vi.stubGlobal('api', {
        chapterStructureInsertSibling: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA, sidB) }),
        chapterStructureIndent: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA) }),
        chapterStructureOutdent: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA) }),
        chapterStructureUpdateTitle: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA) }),
      })
      const loadDocument = vi.fn().mockResolvedValue(undefined)
      const applyStructureSnapshot = vi.fn()
      useDocumentStore.setState({
        loadDocument: loadDocument as never,
        applyStructureSnapshot: applyStructureSnapshot as never,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('insertSibling success focuses the createdSectionId (not a stale heading key)', async () => {
      const store = useChapterStructureStore.getState()
      const outcome = await store.insertSibling('p', sidA)
      expect(outcome.ok).toBe(true)
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(sidB)
      expect(useChapterStructureStore.getState().editingSectionId).toBe(sidB)
    })

    it('indentSection success focuses the affectedSectionId', async () => {
      const store = useChapterStructureStore.getState()
      await store.indentSection('p', sidA)
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(sidA)
    })

    it('outdentSection success focuses the affectedSectionId', async () => {
      const store = useChapterStructureStore.getState()
      await store.outdentSection('p', sidA)
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(sidA)
    })

    it('commitTitle dispatches chapter-structure:update-title and applies snapshot in place', async () => {
      const store = useChapterStructureStore.getState()
      const outcome = await store.commitTitle('p', sidA, '新标题')
      expect(outcome.ok).toBe(true)
      expect(
        (window.api as unknown as { chapterStructureUpdateTitle: ReturnType<typeof vi.fn> })
          .chapterStructureUpdateTitle
      ).toHaveBeenCalledWith({ projectId: 'p', sectionId: sidA, title: '新标题' })
      expect(useDocumentStore.getState().applyStructureSnapshot).toHaveBeenCalledWith('p', {
        content: '# A\n## B\n',
        sectionIndex: [
          {
            sectionId: sidA,
            title: 'A',
            level: 1,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
          },
        ],
      })
      expect(useDocumentStore.getState().loadDocument).not.toHaveBeenCalled()
      expect(useChapterStructureStore.getState().editingSectionId).toBe(null)
    })

    it('requestSoftDelete queue preserves projectId for Story 11.4 drain', async () => {
      const store = useChapterStructureStore.getState()
      await store.requestSoftDelete('proj-X', [sidA, sidB])
      expect(pendingSoftDeletes.length).toBeGreaterThan(0)
      const last = pendingSoftDeletes[pendingSoftDeletes.length - 1]
      expect(last.projectId).toBe('proj-X')
      expect(last.sectionIds).toEqual([sidA, sidB])
    })

    it('requestSoftDelete rejects when any target is locked', async () => {
      const store = useChapterStructureStore.getState()
      store.markLocked(sidA)
      const outcome = await store.requestSoftDelete('p', [sidA, sidB])
      expect(outcome.ok).toBe(false)
    })
  })

  describe('flush pending autosave before mutation (prevent content loss)', () => {
    const makeSnapshot = (affectedSectionId: string, createdSectionId?: string): unknown => ({
      markdown: '# A\n## B\n',
      sectionIndex: [
        {
          sectionId: affectedSectionId,
          title: 'A',
          level: 1,
          order: 0,
          occurrenceIndex: 0,
          headingLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
        },
      ],
      affectedSectionId,
      focusLocator: { title: 'A', level: 1, occurrenceIndex: 0 },
      ...(createdSectionId ? { createdSectionId } : {}),
    })

    let saveDocumentSpy: ReturnType<typeof vi.fn>
    let insertSiblingApi: ReturnType<typeof vi.fn>
    let updateTitleApi: ReturnType<typeof vi.fn>

    beforeEach(() => {
      insertSiblingApi = vi
        .fn()
        .mockResolvedValue({ success: true, data: makeSnapshot(sidA, sidB) })
      updateTitleApi = vi.fn().mockResolvedValue({ success: true, data: makeSnapshot(sidA) })
      vi.stubGlobal('api', {
        chapterStructureInsertSibling: insertSiblingApi,
        chapterStructureIndent: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA) }),
        chapterStructureOutdent: vi
          .fn()
          .mockResolvedValue({ success: true, data: makeSnapshot(sidA) }),
        chapterStructureUpdateTitle: updateTitleApi,
      })

      saveDocumentSpy = vi.fn().mockResolvedValue(undefined)
      useDocumentStore.setState({
        loadedProjectId: 'p',
        content: 'hello',
        autoSave: { dirty: true, saving: false, lastSavedAt: null, error: null },
        saveDocument: saveDocumentSpy as never,
        loadDocument: vi.fn().mockResolvedValue(undefined) as never,
        applyStructureSnapshot: vi.fn() as never,
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('commitTitle flushes dirty pending autosave BEFORE update-title IPC', async () => {
      const order: string[] = []
      saveDocumentSpy.mockImplementation(async () => {
        order.push('save')
        useDocumentStore.setState({
          autoSave: { dirty: false, saving: false, lastSavedAt: 'saved', error: null },
        })
      })
      updateTitleApi.mockImplementation(async () => {
        order.push('update-title')
        return {
          success: true,
          data: {
            sectionId: sidA,
            title: '新',
            level: 1,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '新', level: 1, occurrenceIndex: 0 },
          },
        }
      })

      await useChapterStructureStore.getState().commitTitle('p', sidA, '新')
      expect(saveDocumentSpy).toHaveBeenCalledWith('p')
      expect(order).toEqual(['save', 'update-title'])
    })

    it('insertSibling flushes dirty pending autosave BEFORE insert IPC', async () => {
      const order: string[] = []
      saveDocumentSpy.mockImplementation(async () => {
        order.push('save')
        useDocumentStore.setState({
          autoSave: { dirty: false, saving: false, lastSavedAt: 'saved', error: null },
        })
      })
      insertSiblingApi.mockImplementation(async () => {
        order.push('insert')
        return { success: true, data: makeSnapshot(sidA, sidB) }
      })

      await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(saveDocumentSpy).toHaveBeenCalledWith('p')
      expect(order).toEqual(['save', 'insert'])
    })

    it('does NOT flush when autoSave is clean', async () => {
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(saveDocumentSpy).not.toHaveBeenCalled()
    })

    it('does NOT flush when documentStore is bound to a different project', async () => {
      useDocumentStore.setState({ loadedProjectId: 'other' })
      await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(saveDocumentSpy).not.toHaveBeenCalled()
    })

    it('aborts mutation when pending save fails (preserves user delta)', async () => {
      // Simulate a save error surfaced via autoSave.error.
      saveDocumentSpy.mockImplementation(async () => {
        useDocumentStore.setState({
          autoSave: { dirty: true, saving: false, lastSavedAt: null, error: '磁盘只读' },
        })
      })
      const outcome = await useChapterStructureStore.getState().commitTitle('p', sidA, '新')
      expect(outcome.ok).toBe(false)
      expect(updateTitleApi).not.toHaveBeenCalled()
    })

    it('waits for an in-flight save to finish before running the mutation', async () => {
      // Start state: autosave already in flight from a previous scheduleSave.
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: true, lastSavedAt: null, error: null },
      })
      const flushOrder: string[] = []
      insertSiblingApi.mockImplementation(async () => {
        flushOrder.push('insert')
        return { success: true, data: makeSnapshot(sidA, sidB) }
      })

      const mutationPromise = useChapterStructureStore.getState().insertSibling('p', sidA)
      // Let the flush subscribe before we settle saving=false.
      await new Promise((r) => setTimeout(r, 0))
      expect(flushOrder).toEqual([])
      // Now the in-flight save completes cleanly.
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: 'now', error: null },
      })
      await mutationPromise
      expect(flushOrder).toEqual(['insert'])
    })

    it('loops until durable when content changed during a save', async () => {
      // First save call completes but leaves dirty=true (user typed during save).
      // Second save call cleans the state.
      let saveCalls = 0
      saveDocumentSpy.mockImplementation(async () => {
        saveCalls += 1
        if (saveCalls === 1) {
          useDocumentStore.setState({
            autoSave: { dirty: true, saving: false, lastSavedAt: 'first', error: null },
          })
          return
        }
        useDocumentStore.setState({
          autoSave: { dirty: false, saving: false, lastSavedAt: 'second', error: null },
        })
      })
      await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(saveCalls).toBe(2)
    })

    it('aborts after flush timeout when autosave never drains', async () => {
      // Save never settles state — dirty remains true forever.
      saveDocumentSpy.mockResolvedValue(undefined)
      const outcome = await useChapterStructureStore
        .getState()
        .insertSibling('p', sidA, { flushTimeoutMs: 50 })
      expect(outcome.ok).toBe(false)
      expect(insertSiblingApi).not.toHaveBeenCalled()
    })

    it('sets mutating=true during IPC window and clears it on completion', async () => {
      let inFlightMutating: boolean | null = null
      insertSiblingApi.mockImplementation(async () => {
        inFlightMutating = useChapterStructureStore.getState().mutating
        return { success: true, data: makeSnapshot(sidA, sidB) }
      })
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(inFlightMutating).toBe(true)
      expect(useChapterStructureStore.getState().mutating).toBe(false)
    })

    it('clears mutating even when IPC throws', async () => {
      insertSiblingApi.mockRejectedValue(new Error('boom'))
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      const outcome = await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(outcome.ok).toBe(false)
      expect(useChapterStructureStore.getState().mutating).toBe(false)
    })

    it('rejects a concurrent mutation with reason=mutating (atomic lock)', async () => {
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      // Hold the first IPC in flight so we can race a second dispatch.
      let resolveFirst: (() => void) | null = null
      insertSiblingApi.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = () => resolve({ success: true, data: makeSnapshot(sidA, sidB) })
          })
      )

      const store = useChapterStructureStore.getState()
      const first = store.insertSibling('p', sidA)
      // Second call happens while first is pending.
      const second = await store.insertSibling('p', sidC)
      expect(second.ok).toBe(false)
      if (!second.ok) expect(second.reason).toBe('mutating')
      // Complete the first.
      resolveFirst?.()
      const firstOutcome = await first
      expect(firstOutcome.ok).toBe(true)
      // Lock released — a subsequent mutation succeeds.
      expect(useChapterStructureStore.getState().mutating).toBe(false)
    })

    it('releases the lock so a follow-up mutation can proceed', async () => {
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      const first = await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(first.ok).toBe(true)
      const second = await useChapterStructureStore.getState().insertSibling('p', sidA)
      expect(second.ok).toBe(true)
    })

    it('commitTitle rejects a concurrent call with reason=mutating', async () => {
      useDocumentStore.setState({
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })
      let resolveFirst: (() => void) | null = null
      updateTitleApi.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({
                success: true,
                data: {
                  sectionId: sidA,
                  title: '一',
                  level: 1,
                  order: 0,
                  occurrenceIndex: 0,
                  headingLocator: { title: '一', level: 1, occurrenceIndex: 0 },
                },
              })
          })
      )
      const store = useChapterStructureStore.getState()
      const first = store.commitTitle('p', sidA, '一')
      const second = await store.commitTitle('p', sidA, '二')
      expect(second.ok).toBe(false)
      if (!second.ok) expect(second.reason).toBe('mutating')
      resolveFirst?.()
      await first
    })

    it('preserves the global mutation lock across project switches', async () => {
      useDocumentStore.setState({
        loadedProjectId: 'proj-A',
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })

      let releaseFirst: (() => void) | null = null
      let callCount = 0
      insertSiblingApi.mockImplementation(async () => {
        callCount += 1
        if (callCount === 1) {
          return await new Promise((resolve) => {
            releaseFirst = () => resolve({ success: true, data: makeSnapshot(sidA, sidB) })
          })
        }
        return { success: true, data: makeSnapshot(sidC, sidA) }
      })

      const store = useChapterStructureStore.getState()
      const first = store.insertSibling('proj-A', sidA)
      await Promise.resolve()

      try {
        expect(releaseFirst).toBeTypeOf('function')
        expect(useChapterStructureStore.getState().mutating).toBe(true)
        expect(useDocumentStore.getState().editingLocked).toBe(true)

        store.bindProject('proj-B')

        expect(useChapterStructureStore.getState().boundProjectId).toBe('proj-B')
        expect(useChapterStructureStore.getState().mutating).toBe(true)
        expect(useDocumentStore.getState().editingLocked).toBe(true)

        const second = await store.insertSibling('proj-B', sidC)
        expect(second.ok).toBe(false)
        if (!second.ok) expect(second.reason).toBe('mutating')
        expect(insertSiblingApi).toHaveBeenCalledTimes(1)
      } finally {
        if (releaseFirst) {
          releaseFirst()
          await first
        }
      }

      expect(useChapterStructureStore.getState().mutating).toBe(false)
      expect(useDocumentStore.getState().editingLocked).toBe(false)
    })
  })

  describe('bindProject: project-scoped reset (prevent cross-project identity leakage)', () => {
    it('bindProject on fresh store binds without resetting', () => {
      useChapterStructureStore.getState().bindProject('proj-A')
      expect(useChapterStructureStore.getState().boundProjectId).toBe('proj-A')
    })

    it('switching projectId resets focus / editing / locked / pending-delete state', () => {
      const store = useChapterStructureStore.getState()
      store.bindProject('proj-A')
      store.focusSection(sidA)
      store.enterEditing(sidA)
      store.markLocked(sidB)
      store.markPendingDelete([sidC], '2026-04-18T00:00:10.000Z')

      store.bindProject('proj-B')

      const next = useChapterStructureStore.getState()
      expect(next.boundProjectId).toBe('proj-B')
      expect(next.focusedSectionId).toBe(null)
      expect(next.editingSectionId).toBe(null)
      expect(next.lockedSectionIds).toEqual({})
      expect(next.pendingDeleteBySectionId).toEqual({})
    })

    it('re-binding the same projectId is idempotent', () => {
      const store = useChapterStructureStore.getState()
      store.bindProject('proj-A')
      store.focusSection(sidA)
      store.bindProject('proj-A')
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(sidA)
    })

    it('bindProject(null) clears state (e.g. leaving workspace)', () => {
      const store = useChapterStructureStore.getState()
      store.bindProject('proj-A')
      store.focusSection(sidA)
      store.bindProject(null)
      expect(useChapterStructureStore.getState().focusedSectionId).toBe(null)
      expect(useChapterStructureStore.getState().boundProjectId).toBe(null)
    })
  })
})
