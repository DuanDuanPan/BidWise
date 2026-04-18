import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { StructureMutationSnapshotDto } from '@shared/ipc-types'
import { useDocumentStore } from './documentStore'
import {
  notifyDepthExceeded,
  notifyLockedRejection,
  notifyStructureBoundary,
  notifyStructureError,
} from '@modules/editor/lib/structure-feedback'
import { computeMaxDepthBySectionId } from '@shared/chapter-structure-depth'

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

export type StructureMutationOutcome =
  | { ok: true; snapshot: StructureMutationSnapshotDto }
  | {
      ok: false
      reason: 'locked' | 'pending-delete' | 'editing' | 'unknown-section' | 'boundary' | 'error'
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
  /** Story 11.3: insert a sibling chapter after the targeted node. */
  insertSibling: (projectId: string, nodeKey: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: indent the targeted node + descendants under previous sibling. */
  indentNode: (projectId: string, nodeKey: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: outdent the targeted node + descendants to the grandparent. */
  outdentNode: (projectId: string, nodeKey: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: hand off cascade-delete payload to Story 11.4. */
  requestSoftDelete: (
    projectId: string,
    sectionIds: string[],
    nodeKeys: string[]
  ) => Promise<{ ok: boolean }>
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

    async insertSibling(projectId, nodeKey) {
      const guard = guardMutation(nodeKey)
      if (guard) return guard
      const sectionId = resolveSectionId(nodeKey)
      if (!sectionId) return { ok: false, reason: 'unknown-section' }
      try {
        const res = await window.api.chapterStructureInsertSibling({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        // Newly created node: focus + enter editing for inline title input.
        const createdId = snapshot.createdSectionId ?? snapshot.affectedSectionId
        const createdKey = findNodeKeyForSectionId(createdId) ?? createdId
        register({ [createdKey]: createdId })
        ;(useChapterStructureStore.getState() as ChapterStructureStore).focusNode(createdKey)
        ;(useChapterStructureStore.getState() as ChapterStructureStore).enterEditing(createdKey)
        warnIfDepthExceeded(snapshot)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async indentNode(projectId, nodeKey) {
      const guard = guardMutation(nodeKey)
      if (guard) return guard
      const sectionId = resolveSectionId(nodeKey)
      if (!sectionId) return { ok: false, reason: 'unknown-section' }
      try {
        const res = await window.api.chapterStructureIndent({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        const focusKey = findNodeKeyForSectionId(snapshot.affectedSectionId) ?? nodeKey
        ;(useChapterStructureStore.getState() as ChapterStructureStore).focusNode(focusKey)
        warnIfDepthExceeded(snapshot)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async outdentNode(projectId, nodeKey) {
      const guard = guardMutation(nodeKey)
      if (guard) return guard
      const sectionId = resolveSectionId(nodeKey)
      if (!sectionId) return { ok: false, reason: 'unknown-section' }
      try {
        const res = await window.api.chapterStructureOutdent({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        const focusKey = findNodeKeyForSectionId(snapshot.affectedSectionId) ?? nodeKey
        ;(useChapterStructureStore.getState() as ChapterStructureStore).focusNode(focusKey)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async requestSoftDelete(_projectId, sectionIds, nodeKeys) {
      // Story 11.3 owns the cascade-target collection + 11.2 state guard;
      // Story 11.4 will replace this stub with the real soft-delete pipeline.
      const state = useChapterStructureStore.getState()
      // Locked / pending-delete guard at the request entry — same priority rule
      // as guardMutation but applied to the full collected node set.
      for (const key of nodeKeys) {
        if (state.lockedNodeKeys[key]) {
          notifyLockedRejection()
          return { ok: false }
        }
        if (state.pendingDeleteByNodeKey[key]) {
          return { ok: false }
        }
      }
      // Optimistic 5s window — keeps Story 11.2 visual contract live until
      // Story 11.4 lands the real undo flow.
      const expiresAt = new Date(Date.now() + 5000).toISOString()
      state.markPendingDelete(nodeKeys, expiresAt)
      // Auto-clear so the pending-delete UI does not get stuck before 11.4.
      setTimeout(() => {
        useChapterStructureStore.getState().clearPendingDelete(nodeKeys)
      }, 5000)
      // sectionIds are intentionally collected here for the future 11.4 IPC
      // payload — bind them onto window so the upcoming wiring can read them
      // without re-walking the outline.
      const target: StructureSoftDeleteTarget = { sectionIds, nodeKeys, expiresAt }
      pendingSoftDeletes.push(target)
      return { ok: true }
    },

    reset() {
      set({ ...INITIAL_STATE })
      pendingSoftDeletes.length = 0
    },
  }))
)

// ─── Story 11.3 mutation helpers ────────────────────────────────────────────

interface StructureSoftDeleteTarget {
  sectionIds: string[]
  nodeKeys: string[]
  expiresAt: string
}

/** Exposed for Story 11.4 to drain queued cascade-delete targets. */
export const pendingSoftDeletes: StructureSoftDeleteTarget[] = []

function guardMutation(nodeKey: string): StructureMutationOutcome | null {
  const state = useChapterStructureStore.getState()
  if (state.lockedNodeKeys[nodeKey]) {
    notifyLockedRejection()
    return { ok: false, reason: 'locked' }
  }
  if (state.pendingDeleteByNodeKey[nodeKey]) {
    return { ok: false, reason: 'pending-delete' }
  }
  if (state.editingNodeKey === nodeKey) {
    return { ok: false, reason: 'editing' }
  }
  return null
}

function resolveSectionId(nodeKey: string): string | null {
  const map = useChapterStructureStore.getState().sectionIdByNodeKey
  if (map[nodeKey]) return map[nodeKey]
  // Fallback: nodeKey already IS a sectionId (Story 11.2 convention).
  return nodeKey
}

function findNodeKeyForSectionId(sectionId: string): string | null {
  const map = useChapterStructureStore.getState().sectionIdByNodeKey
  for (const [key, id] of Object.entries(map)) {
    if (id === sectionId) return key
  }
  return null
}

function register(mapping: Record<string, string>): void {
  useChapterStructureStore.getState().registerSectionIds(mapping)
}

function commitSnapshot(projectId: string, snapshot: StructureMutationSnapshotDto): void {
  useDocumentStore.getState().applyStructureSnapshot(projectId, {
    content: snapshot.markdown,
    sectionIndex: snapshot.sectionIndex,
  })
}

function warnIfDepthExceeded(snapshot: StructureMutationSnapshotDto): void {
  const depthMap = computeMaxDepthBySectionId(snapshot.sectionIndex)
  const depth = depthMap.get(snapshot.affectedSectionId) ?? 0
  if (depth > 6) {
    notifyDepthExceeded(depth)
  }
}

function handleMutationError(error: { code: string; message: string }): StructureMutationOutcome {
  // AC4 boundary cases (no previous sibling, already top-level) are silent
  // no-ops by spec — surface only when the user might otherwise be confused.
  if (error.code === 'STRUCTURE_BOUNDARY') {
    if (/深度|超过最大限制/.test(error.message)) {
      notifyStructureBoundary(error.message)
    }
    return { ok: false, reason: 'boundary' }
  }
  notifyStructureError(new Error(error.message))
  return { ok: false, reason: 'error' }
}

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
