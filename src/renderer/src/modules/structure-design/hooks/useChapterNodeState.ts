import { useShallow } from 'zustand/react/shallow'
import {
  deriveChapterNodeState,
  useChapterStructureStore,
  type ChapterNodeState,
  type PendingDeleteEntry,
} from '@renderer/stores/chapterStructureStore'

export interface ChapterNodeStateSnapshot {
  state: ChapterNodeState
  isFocused: boolean
  isEditing: boolean
  isLocked: boolean
  pendingDelete: PendingDeleteEntry | null
}

/**
 * Single source of truth for a node's visual state. Components must NOT store
 * local copies of `focused / editing / locked / pending-delete` — that would
 * fork the priority rule (AC6) and break cross-story coordination.
 */
export function useChapterNodeState(nodeKey: string): ChapterNodeStateSnapshot {
  return useChapterStructureStore(
    useShallow((store) => {
      const state = deriveChapterNodeState(store, nodeKey)
      return {
        state,
        isFocused: state === 'focused',
        isEditing: state === 'editing',
        isLocked: state === 'locked',
        pendingDelete: store.pendingDeleteByNodeKey[nodeKey] ?? null,
      }
    })
  )
}
