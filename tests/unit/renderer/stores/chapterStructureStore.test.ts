import { describe, it, expect, beforeEach } from 'vitest'
import {
  useChapterStructureStore,
  deriveChapterNodeState,
} from '@renderer/stores/chapterStructureStore'

const nodeA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const nodeB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const nodeC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('chapterStructureStore', () => {
  beforeEach(() => {
    useChapterStructureStore.getState().reset()
  })

  describe('priority: pending-delete > locked > editing > focused > idle (AC6)', () => {
    it('returns idle by default', () => {
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('idle')
    })

    it('returns focused after focusNode', () => {
      useChapterStructureStore.getState().focusNode(nodeA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('focused')
    })

    it('returns editing when enterEditing is called on focused node', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeA)
      store.enterEditing(nodeA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('editing')
    })

    it('editing outranks focused (priority rule)', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeA)
      store.enterEditing(nodeA)
      // Focus another node while A is still in editing mode
      store.focusNode(nodeB)
      // editingNodeKey cleared because focus moved to B
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('idle')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeB)).toBe('focused')
    })

    it('locked outranks editing', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeA)
      store.enterEditing(nodeA)
      store.markLocked(nodeA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('locked')
      // Editing released on lock
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(null)
    })

    it('pending-delete outranks locked', () => {
      const store = useChapterStructureStore.getState()
      store.markLocked(nodeA)
      store.markPendingDelete([nodeA], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe(
        'pending-delete'
      )
    })

    it('pending-delete outranks focused and clears focus on hit', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeA)
      store.markPendingDelete([nodeA], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe(
        'pending-delete'
      )
      expect(useChapterStructureStore.getState().focusedNodeKey).toBe(null)
    })
  })

  describe('action guards', () => {
    it('enterEditing on a locked node is a no-op', () => {
      const store = useChapterStructureStore.getState()
      store.markLocked(nodeA)
      store.enterEditing(nodeA)
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(null)
    })

    it('enterEditing on a pending-delete node is a no-op', () => {
      const store = useChapterStructureStore.getState()
      store.markPendingDelete([nodeA], '2026-04-18T00:00:10.000Z')
      store.enterEditing(nodeA)
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(null)
    })

    it('unmarkLocked removes lock and returns to prior derived state', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeA)
      store.markLocked(nodeA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('locked')
      store.unmarkLocked(nodeA)
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('focused')
    })

    it('clearPendingDelete removes entry atomically', () => {
      const store = useChapterStructureStore.getState()
      store.markPendingDelete([nodeA, nodeB], '2026-04-18T00:00:10.000Z')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe(
        'pending-delete'
      )
      store.clearPendingDelete([nodeA])
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeA)).toBe('idle')
      expect(deriveChapterNodeState(useChapterStructureStore.getState(), nodeB)).toBe(
        'pending-delete'
      )
    })
  })

  describe('multi-node interactions', () => {
    it('markPendingDelete on multiple nodes clears editing if caught in the set', () => {
      const store = useChapterStructureStore.getState()
      store.focusNode(nodeB)
      store.enterEditing(nodeB)
      store.markPendingDelete([nodeA, nodeB, nodeC], '2026-04-18T00:00:10.000Z')
      expect(useChapterStructureStore.getState().editingNodeKey).toBe(null)
      expect(useChapterStructureStore.getState().focusedNodeKey).toBe(null)
      for (const key of [nodeA, nodeB, nodeC]) {
        expect(deriveChapterNodeState(useChapterStructureStore.getState(), key)).toBe(
          'pending-delete'
        )
      }
    })

    it('registerSectionIds merges mappings for Story 11.1 persistence bridge', () => {
      const store = useChapterStructureStore.getState()
      store.registerSectionIds({ [nodeA]: nodeA })
      store.registerSectionIds({ [nodeB]: nodeB })
      expect(useChapterStructureStore.getState().sectionIdByNodeKey).toEqual({
        [nodeA]: nodeA,
        [nodeB]: nodeB,
      })
    })
  })
})
