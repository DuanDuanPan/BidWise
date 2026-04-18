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
 * Renderer-side chapter structure store (Story 11.2 + 11.3 root-cause fix).
 *
 * All persistent state is keyed by `sectionId` (UUID, Story 11.1). Transient
 * DOM anchors like `heading-${lineIndex}` live only at the render boundary —
 * components resolve `nodeKey → sectionId` locally and dispatch actions with
 * sectionId. This eliminates the identity race seen across mutations where
 * line indices shift.
 *
 * Five-state machine, priority (highest wins, AC6):
 *   pending-delete > locked > editing > focused > idle
 */

export type ChapterNodeState = 'idle' | 'focused' | 'editing' | 'locked' | 'pending-delete'

export interface PendingDeleteEntry {
  expiresAt: string
}

export interface ChapterStructureState {
  focusedSectionId: string | null
  editingSectionId: string | null
  lockedSectionIds: Record<string, true>
  pendingDeleteBySectionId: Record<string, PendingDeleteEntry>
  /** Project currently bound to this store. Switching auto-resets state. */
  boundProjectId: string | null
}

export type StructureMutationOutcome =
  | { ok: true; snapshot: StructureMutationSnapshotDto }
  | {
      ok: false
      reason: 'locked' | 'pending-delete' | 'editing' | 'boundary' | 'error'
    }

export type CommitTitleOutcome = { ok: true } | { ok: false; reason: 'locked' | 'error' }

export interface ChapterStructureActions {
  focusSection: (sectionId: string | null) => void
  enterEditing: (sectionId: string) => void
  exitEditing: () => void
  markLocked: (sectionId: string) => void
  unmarkLocked: (sectionId: string) => void
  markPendingDelete: (sectionIds: string[], expiresAt: string) => void
  clearPendingDelete: (sectionIds: string[]) => void
  /** Story 11.3: insert a sibling chapter after the targeted section. */
  insertSibling: (projectId: string, sectionId: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: indent the targeted section + descendants under previous sibling. */
  indentSection: (projectId: string, sectionId: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: outdent the targeted section + descendants to the grandparent. */
  outdentSection: (projectId: string, sectionId: string) => Promise<StructureMutationOutcome>
  /** Story 11.3: commit inline-edited title for a section. */
  commitTitle: (projectId: string, sectionId: string, title: string) => Promise<CommitTitleOutcome>
  /** Story 11.3: hand off cascade-delete payload to Story 11.4. */
  requestSoftDelete: (projectId: string, sectionIds: string[]) => Promise<{ ok: boolean }>
  /**
   * Bind the store to a project. If `projectId` differs from the currently
   * bound one, resets all per-project state so sectionIds from the previous
   * project cannot leak into mutation dispatches on the new project.
   */
  bindProject: (projectId: string | null) => void
  reset: () => void
}

export type ChapterStructureStore = ChapterStructureState & ChapterStructureActions

const INITIAL_STATE: ChapterStructureState = {
  focusedSectionId: null,
  editingSectionId: null,
  lockedSectionIds: {},
  pendingDeleteBySectionId: {},
  boundProjectId: null,
}

export const useChapterStructureStore = create<ChapterStructureStore>()(
  subscribeWithSelector((set) => ({
    ...INITIAL_STATE,

    focusSection(sectionId) {
      set((state) => {
        const editingSectionId =
          state.editingSectionId && state.editingSectionId !== sectionId
            ? null
            : state.editingSectionId
        return { focusedSectionId: sectionId, editingSectionId }
      })
    },

    enterEditing(sectionId) {
      set((state) => {
        if (state.lockedSectionIds[sectionId] || state.pendingDeleteBySectionId[sectionId]) {
          return {}
        }
        return { focusedSectionId: sectionId, editingSectionId: sectionId }
      })
    },

    exitEditing() {
      set({ editingSectionId: null })
    },

    markLocked(sectionId) {
      set((state) => ({
        lockedSectionIds: { ...state.lockedSectionIds, [sectionId]: true },
        editingSectionId: state.editingSectionId === sectionId ? null : state.editingSectionId,
      }))
    },

    unmarkLocked(sectionId) {
      set((state) => {
        if (!state.lockedSectionIds[sectionId]) return {}
        const next = { ...state.lockedSectionIds }
        delete next[sectionId]
        return { lockedSectionIds: next }
      })
    },

    markPendingDelete(sectionIds, expiresAt) {
      set((state) => {
        const next = { ...state.pendingDeleteBySectionId }
        for (const id of sectionIds) {
          next[id] = { expiresAt }
        }
        const editingSectionId =
          state.editingSectionId && sectionIds.includes(state.editingSectionId)
            ? null
            : state.editingSectionId
        const focusedSectionId =
          state.focusedSectionId && sectionIds.includes(state.focusedSectionId)
            ? null
            : state.focusedSectionId
        return { pendingDeleteBySectionId: next, editingSectionId, focusedSectionId }
      })
    },

    clearPendingDelete(sectionIds) {
      set((state) => {
        if (sectionIds.length === 0) return {}
        const next = { ...state.pendingDeleteBySectionId }
        let changed = false
        for (const id of sectionIds) {
          if (next[id]) {
            delete next[id]
            changed = true
          }
        }
        if (!changed) return {}
        return { pendingDeleteBySectionId: next }
      })
    },

    async insertSibling(projectId, sectionId) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      const flushed = await flushPendingContent(projectId)
      if (!flushed) return { ok: false, reason: 'error' }
      try {
        const res = await window.api.chapterStructureInsertSibling({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        const createdId = snapshot.createdSectionId ?? snapshot.affectedSectionId
        const store = useChapterStructureStore.getState()
        store.focusSection(createdId)
        store.enterEditing(createdId)
        warnIfDepthExceeded(snapshot)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async indentSection(projectId, sectionId) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      const flushed = await flushPendingContent(projectId)
      if (!flushed) return { ok: false, reason: 'error' }
      try {
        const res = await window.api.chapterStructureIndent({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        useChapterStructureStore.getState().focusSection(snapshot.affectedSectionId)
        warnIfDepthExceeded(snapshot)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async outdentSection(projectId, sectionId) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      const flushed = await flushPendingContent(projectId)
      if (!flushed) return { ok: false, reason: 'error' }
      try {
        const res = await window.api.chapterStructureOutdent({ projectId, sectionId })
        if (!res.success) return handleMutationError(res.error)
        const snapshot = res.data
        commitSnapshot(projectId, snapshot)
        useChapterStructureStore.getState().focusSection(snapshot.affectedSectionId)
        return { ok: true, snapshot }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async commitTitle(projectId, sectionId, title) {
      const state = useChapterStructureStore.getState()
      if (state.lockedSectionIds[sectionId]) {
        notifyLockedRejection()
        return { ok: false, reason: 'locked' }
      }
      const trimmed = title.trim()
      if (!trimmed) {
        useChapterStructureStore.getState().exitEditing()
        return { ok: true }
      }
      const flushed = await flushPendingContent(projectId)
      if (!flushed) return { ok: false, reason: 'error' }
      try {
        const res = await window.api.chapterStructureUpdateTitle({
          projectId,
          sectionId,
          title: trimmed,
        })
        if (!res.success) {
          notifyStructureError(new Error(res.error.message))
          return { ok: false, reason: 'error' }
        }
        // Rename writes new markdown + sectionIndex to disk; reload so
        // documentStore mirrors persisted state before autosave can push
        // the stale in-memory copy back.
        await useDocumentStore.getState().loadDocument(projectId)
        useChapterStructureStore.getState().exitEditing()
        return { ok: true }
      } catch (err) {
        notifyStructureError(err)
        return { ok: false, reason: 'error' }
      }
    },

    async requestSoftDelete(projectId, sectionIds) {
      const state = useChapterStructureStore.getState()
      for (const id of sectionIds) {
        if (state.lockedSectionIds[id]) {
          notifyLockedRejection()
          return { ok: false }
        }
        if (state.pendingDeleteBySectionId[id]) {
          return { ok: false }
        }
      }
      const expiresAt = new Date(Date.now() + 5000).toISOString()
      state.markPendingDelete(sectionIds, expiresAt)
      setTimeout(() => {
        useChapterStructureStore.getState().clearPendingDelete(sectionIds)
      }, 5000)
      pendingSoftDeletes.push({ projectId, sectionIds, expiresAt })
      return { ok: true }
    },

    bindProject(projectId) {
      set((state) => {
        if (state.boundProjectId === projectId) return {}
        // Project switch — clear all per-project state so sectionIds from
        // the prior project cannot reach chapter-structure:* IPC under the
        // new projectId.
        pendingSoftDeletes.length = 0
        return { ...INITIAL_STATE, boundProjectId: projectId }
      })
    },

    reset() {
      set({ ...INITIAL_STATE })
      pendingSoftDeletes.length = 0
    },
  }))
)

interface StructureSoftDeleteTarget {
  projectId: string
  sectionIds: string[]
  expiresAt: string
}

/** Exposed for Story 11.4 to drain queued cascade-delete targets. */
export const pendingSoftDeletes: StructureSoftDeleteTarget[] = []

/**
 * Main-side chapter-structure mutations read markdown from disk before
 * computing the next snapshot. If the renderer has unsaved body edits still
 * sitting in the autosave debounce queue, the mutation would silently drop
 * them. Flush first; if the flush fails, abort the mutation rather than
 * risk overwriting the user's in-memory edits with a stale disk snapshot.
 */
async function flushPendingContent(projectId: string): Promise<boolean> {
  const docStore = useDocumentStore.getState()
  if (docStore.loadedProjectId !== projectId) return true
  if (!docStore.autoSave.dirty) return true
  await docStore.saveDocument(projectId)
  const after = useDocumentStore.getState()
  if (after.autoSave.error) {
    notifyStructureError(new Error(after.autoSave.error))
    return false
  }
  return true
}

function guardMutation(sectionId: string): StructureMutationOutcome | null {
  const state = useChapterStructureStore.getState()
  if (state.lockedSectionIds[sectionId]) {
    notifyLockedRejection()
    return { ok: false, reason: 'locked' }
  }
  if (state.pendingDeleteBySectionId[sectionId]) {
    return { ok: false, reason: 'pending-delete' }
  }
  if (state.editingSectionId === sectionId) {
    return { ok: false, reason: 'editing' }
  }
  return null
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
  sectionId: string
): ChapterNodeState {
  if (state.pendingDeleteBySectionId[sectionId]) return 'pending-delete'
  if (state.lockedSectionIds[sectionId]) return 'locked'
  if (state.editingSectionId === sectionId) return 'editing'
  if (state.focusedSectionId === sectionId) return 'focused'
  return 'idle'
}
