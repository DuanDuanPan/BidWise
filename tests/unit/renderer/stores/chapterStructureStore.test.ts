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
        chapterStructureUpdateTitle: vi.fn().mockResolvedValue({
          success: true,
          data: {
            sectionId: sidA,
            title: '新标题',
            level: 1,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '新标题', level: 1, occurrenceIndex: 0 },
          },
        }),
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

    it('commitTitle dispatches chapter-structure:update-title and rehydrates documentStore', async () => {
      const store = useChapterStructureStore.getState()
      const outcome = await store.commitTitle('p', sidA, '新标题')
      expect(outcome.ok).toBe(true)
      expect(
        (window.api as unknown as { chapterStructureUpdateTitle: ReturnType<typeof vi.fn> })
          .chapterStructureUpdateTitle
      ).toHaveBeenCalledWith({ projectId: 'p', sectionId: sidA, title: '新标题' })
      expect(useDocumentStore.getState().loadDocument).toHaveBeenCalledWith('p')
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
})
