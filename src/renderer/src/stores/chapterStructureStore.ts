import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

/**
 * Renderer-side chapter structure store (Story 11.2).
 *
 * Centralizes the five-state machine for structure-canvas chapter nodes:
 * `idle | focused | editing | locked | pending-delete`. Priority (highest
 * wins, AC6):
 *
 *     pending-delete > locked > editing > focused > idle
 *
 * `nodeKey` is the project-level stable `sectionId` (Story 11.1). This store
 * never mutates persistent structure — writes are owned by main-side services
 * through Story 11.1 / 11.3 / 11.4 IPC. Callers of `focusNode` /
 * `enterEditing` / `markLocked` / `markPendingDelete` are the renderer event
 * handlers in Structure Canvas and the Story 11.3 keyboard bridge / Story
 * 11.4 soft-delete flow / Story 11.8 streaming recommend flow.
 */

export type ChapterNodeState = 'idle' | 'focused' | 'editing' | 'locked' | 'pending-delete'

export interface PendingDeleteEntry {
  expiresAt: string
}

export interface ChapterStructureState {
  focusedNodeKey: string | null
  editingNodeKey: string | null
  lockedNodeKeys: Record<string, true>
  pendingDeleteByNodeKey: Record<string, PendingDeleteEntry>
  /** nodeKey → sectionId bridge. In Story 11.2 both are identical (UUID). */
  sectionIdByNodeKey: Record<string, string>
}

export interface ChapterStructureActions {
  focusNode: (nodeKey: string | null) => void
  enterEditing: (nodeKey: string) => void
  exitEditing: () => void
  markLocked: (nodeKey: string) => void
  unmarkLocked: (nodeKey: string) => void
  markPendingDelete: (nodeKeys: string[], expiresAt: string) => void
  clearPendingDelete: (nodeKeys: string[]) => void
  registerSectionIds: (mapping: Record<string, string>) => void
  reset: () => void
}

export type ChapterStructureStore = ChapterStructureState & ChapterStructureActions

const INITIAL_STATE: ChapterStructureState = {
  focusedNodeKey: null,
  editingNodeKey: null,
  lockedNodeKeys: {},
  pendingDeleteByNodeKey: {},
  sectionIdByNodeKey: {},
}

export const useChapterStructureStore = create<ChapterStructureStore>()(
  subscribeWithSelector((set) => ({
    ...INITIAL_STATE,

    focusNode(nodeKey) {
      set((state) => {
        // Entering focus implicitly exits any in-flight editing on a different node.
        const editingNodeKey =
          state.editingNodeKey && state.editingNodeKey !== nodeKey ? null : state.editingNodeKey
        return { focusedNodeKey: nodeKey, editingNodeKey }
      })
    },

    enterEditing(nodeKey) {
      set((state) => {
        // Locked / pending-delete nodes can't enter editing (priority rule).
        if (state.lockedNodeKeys[nodeKey] || state.pendingDeleteByNodeKey[nodeKey]) {
          return {}
        }
        return { focusedNodeKey: nodeKey, editingNodeKey: nodeKey }
      })
    },

    exitEditing() {
      set({ editingNodeKey: null })
    },

    markLocked(nodeKey) {
      set((state) => ({
        lockedNodeKeys: { ...state.lockedNodeKeys, [nodeKey]: true },
        // Editing on this node is released because locked outranks editing.
        editingNodeKey: state.editingNodeKey === nodeKey ? null : state.editingNodeKey,
      }))
    },

    unmarkLocked(nodeKey) {
      set((state) => {
        if (!state.lockedNodeKeys[nodeKey]) return {}
        const next = { ...state.lockedNodeKeys }
        delete next[nodeKey]
        return { lockedNodeKeys: next }
      })
    },

    markPendingDelete(nodeKeys, expiresAt) {
      set((state) => {
        const next = { ...state.pendingDeleteByNodeKey }
        for (const key of nodeKeys) {
          next[key] = { expiresAt }
        }
        // Pending-delete outranks editing and focused — release them on hit.
        const editingNodeKey =
          state.editingNodeKey && nodeKeys.includes(state.editingNodeKey)
            ? null
            : state.editingNodeKey
        const focusedNodeKey =
          state.focusedNodeKey && nodeKeys.includes(state.focusedNodeKey)
            ? null
            : state.focusedNodeKey
        return { pendingDeleteByNodeKey: next, editingNodeKey, focusedNodeKey }
      })
    },

    clearPendingDelete(nodeKeys) {
      set((state) => {
        if (nodeKeys.length === 0) return {}
        const next = { ...state.pendingDeleteByNodeKey }
        let changed = false
        for (const key of nodeKeys) {
          if (next[key]) {
            delete next[key]
            changed = true
          }
        }
        if (!changed) return {}
        return { pendingDeleteByNodeKey: next }
      })
    },

    registerSectionIds(mapping) {
      set((state) => ({ sectionIdByNodeKey: { ...state.sectionIdByNodeKey, ...mapping } }))
    },

    reset() {
      set({ ...INITIAL_STATE })
    },
  }))
)

/** Pure selector exported for tests — priority: pending-delete > locked > editing > focused > idle. */
export function deriveChapterNodeState(
  state: ChapterStructureState,
  nodeKey: string
): ChapterNodeState {
  if (state.pendingDeleteByNodeKey[nodeKey]) return 'pending-delete'
  if (state.lockedNodeKeys[nodeKey]) return 'locked'
  if (state.editingNodeKey === nodeKey) return 'editing'
  if (state.focusedNodeKey === nodeKey) return 'focused'
  return 'idle'
}
