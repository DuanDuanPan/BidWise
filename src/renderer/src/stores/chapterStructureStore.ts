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
  /** Story 11.3: true while a mutation IPC is in flight. Pairs with
   *  `documentStore.editingLocked` to prevent concurrent Plate edits from
   *  being overwritten by the returning snapshot. */
  mutating: boolean
}

export type StructureMutationOutcome =
  | { ok: true; snapshot: StructureMutationSnapshotDto }
  | {
      ok: false
      reason: 'locked' | 'pending-delete' | 'editing' | 'boundary' | 'error' | 'mutating'
    }

export type CommitTitleOutcome =
  | { ok: true }
  | { ok: false; reason: 'locked' | 'error' | 'mutating' }

export interface MutationOptions {
  /** Max time (ms) to wait for pending autosave to drain before aborting. */
  flushTimeoutMs?: number
}

const DEFAULT_FLUSH_TIMEOUT_MS = 5000

export interface ChapterStructureActions {
  focusSection: (sectionId: string | null) => void
  enterEditing: (sectionId: string) => void
  exitEditing: () => void
  markLocked: (sectionId: string) => void
  unmarkLocked: (sectionId: string) => void
  markPendingDelete: (sectionIds: string[], expiresAt: string) => void
  clearPendingDelete: (sectionIds: string[]) => void
  /** Story 11.3: insert a sibling chapter after the targeted section. */
  insertSibling: (
    projectId: string,
    sectionId: string,
    options?: MutationOptions
  ) => Promise<StructureMutationOutcome>
  /** Story 11.9: insert a new last-child under `parentSectionId`. */
  insertChild: (
    projectId: string,
    parentSectionId: string,
    options?: MutationOptions
  ) => Promise<StructureMutationOutcome>
  /** Story 11.9: move drag subtree to a new position around `dropSectionId`. */
  moveSubtree: (
    projectId: string,
    dragSectionId: string,
    dropSectionId: string,
    placement: 'before' | 'after' | 'inside',
    options?: MutationOptions
  ) => Promise<StructureMutationOutcome>
  /** Story 11.3: indent the targeted section + descendants under previous sibling. */
  indentSection: (
    projectId: string,
    sectionId: string,
    options?: MutationOptions
  ) => Promise<StructureMutationOutcome>
  /** Story 11.3: outdent the targeted section + descendants to the grandparent. */
  outdentSection: (
    projectId: string,
    sectionId: string,
    options?: MutationOptions
  ) => Promise<StructureMutationOutcome>
  /** Story 11.3: commit inline-edited title for a section. */
  commitTitle: (
    projectId: string,
    sectionId: string,
    title: string,
    options?: MutationOptions
  ) => Promise<CommitTitleOutcome>
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

const PROJECT_SCOPED_INITIAL_STATE: Omit<ChapterStructureState, 'mutating'> = {
  focusedSectionId: null,
  editingSectionId: null,
  lockedSectionIds: {},
  pendingDeleteBySectionId: {},
  boundProjectId: null,
}

const INITIAL_STATE: ChapterStructureState = {
  ...PROJECT_SCOPED_INITIAL_STATE,
  mutating: false,
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

    async insertSibling(projectId, sectionId, options) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      return runMutation(projectId, options, async () => {
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
      })
    },

    async insertChild(projectId, parentSectionId, options) {
      const guard = guardMutation(parentSectionId)
      if (guard) return guard
      return runMutation(projectId, options, async () => {
        try {
          const res = await window.api.chapterStructureInsertChild({
            projectId,
            parentSectionId,
          })
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
      })
    },

    async moveSubtree(projectId, dragSectionId, dropSectionId, placement, options) {
      const guard = guardMutation(dragSectionId)
      if (guard) return guard
      return runMutation(projectId, options, async () => {
        try {
          const res = await window.api.chapterStructureMoveSubtree({
            projectId,
            dragSectionId,
            dropSectionId,
            placement,
          })
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
      })
    },

    async indentSection(projectId, sectionId, options) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      return runMutation(projectId, options, async () => {
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
      })
    },

    async outdentSection(projectId, sectionId, options) {
      const guard = guardMutation(sectionId)
      if (guard) return guard
      return runMutation(projectId, options, async () => {
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
      })
    },

    async commitTitle(projectId, sectionId, title, options) {
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
      return runCommitTitle(projectId, options, async () => {
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
          commitSnapshot(projectId, res.data)
          useChapterStructureStore.getState().focusSection(res.data.affectedSectionId)
          useChapterStructureStore.getState().exitEditing()
          return { ok: true }
        } catch (err) {
          notifyStructureError(err)
          return { ok: false, reason: 'error' }
        }
      })
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
      let preserveGlobalMutationLock = false
      set((state) => {
        if (state.boundProjectId === projectId) return {}
        // Project switch — clear all per-project state so sectionIds from
        // the prior project cannot reach chapter-structure:* IPC under the
        // new projectId. The mutation lock is global to the renderer and
        // stays owned by the in-flight IPC until releaseMutationLock().
        pendingSoftDeletes.length = 0
        preserveGlobalMutationLock = state.mutating
        return {
          ...PROJECT_SCOPED_INITIAL_STATE,
          boundProjectId: projectId,
          mutating: state.mutating,
        }
      })
      if (preserveGlobalMutationLock) {
        useDocumentStore.getState().setEditingLocked(true)
      }
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
 * Strictly flush pending autosave so that the disk copy of `proposal.md`
 * mirrors the renderer's current in-memory content BEFORE a structure
 * mutation IPC runs on the main side.
 *
 * `saveDocument` has three race windows the naive `await saveDocument()`
 * does not close:
 *   A. It returns immediately if a save is already in flight (queued for
 *      replay via `setTimeout(0)` later).
 *   B. It can finish with `dirty: true` when the user typed mid-save.
 *   C. The replayed save is async — completion is not observable from the
 *      returning promise.
 *
 * This loop subscribes to the document store and drives saves until the
 * observed `autoSave` state reports `!dirty && !saving && !error`, then
 * returns. If `autoSave.error` ever becomes non-null, or the wall-clock
 * timeout expires, return `false` so the mutation aborts without a stale
 * disk read.
 */
async function flushPendingContent(projectId: string, timeoutMs: number): Promise<boolean> {
  const docStore = useDocumentStore.getState()
  if (docStore.loadedProjectId !== projectId) return true
  const deadline = Date.now() + timeoutMs

  while (true) {
    const s = useDocumentStore.getState()
    if (s.loadedProjectId !== projectId) return true
    if (s.autoSave.error) {
      notifyStructureError(new Error(s.autoSave.error))
      return false
    }
    if (!s.autoSave.dirty && !s.autoSave.saving) return true
    if (Date.now() > deadline) {
      notifyStructureError(new Error('保存尚未完成，已中止结构变更（flush 超时）'))
      return false
    }
    if (s.autoSave.saving) {
      await waitForSaveSettled(deadline - Date.now())
      continue
    }
    // dirty + not saving: drive one save and re-check. If the save returns
    // without state progress (e.g. queued-while-saving skip, or a stubbed
    // save in tests) yield so the wall clock can advance toward deadline.
    const prevLastSavedAt = s.autoSave.lastSavedAt
    await s.saveDocument(projectId)
    const after = useDocumentStore.getState()
    const noProgress =
      after.autoSave.dirty === s.autoSave.dirty &&
      after.autoSave.saving === s.autoSave.saving &&
      after.autoSave.lastSavedAt === prevLastSavedAt
    if (noProgress) {
      await sleep(Math.min(10, Math.max(0, deadline - Date.now())))
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForSaveSettled(remainingMs: number): Promise<void> {
  return new Promise((resolve) => {
    const unsub = useDocumentStore.subscribe((state) => {
      if (!state.autoSave.saving) {
        unsub()
        clearTimeout(timer)
        resolve()
      }
    })
    const timer = setTimeout(
      () => {
        unsub()
        resolve()
      },
      Math.max(0, remainingMs)
    )
    // Guard against the no-op state where saving already settled.
    if (!useDocumentStore.getState().autoSave.saving) {
      unsub()
      clearTimeout(timer)
      resolve()
    }
  })
}

/**
 * Atomic test-and-set for the mutation lock. Relies on JS single-threaded
 * execution: the `getState` read and `setState` write below run in one
 * synchronous step with no `await` between them, so two concurrent callers
 * cannot both observe `mutating=false` and both succeed.
 */
function acquireMutationLock(): boolean {
  if (useChapterStructureStore.getState().mutating) return false
  useChapterStructureStore.setState({ mutating: true })
  useDocumentStore.getState().setEditingLocked(true)
  return true
}

function releaseMutationLock(): void {
  useDocumentStore.getState().setEditingLocked(false)
  useChapterStructureStore.setState({ mutating: false })
}

/**
 * Wrap a mutation body with: (a) atomic lock acquire that rejects reentrant
 * calls with reason=mutating, (b) documentStore editing lock so Plate writes
 * cannot race the snapshot apply, (c) durable flush. Ensures flags are
 * cleared even when the mutation throws.
 */
async function runMutation(
  projectId: string,
  options: MutationOptions | undefined,
  body: () => Promise<StructureMutationOutcome>
): Promise<StructureMutationOutcome> {
  if (!acquireMutationLock()) return { ok: false, reason: 'mutating' }
  try {
    const flushed = await flushPendingContent(
      projectId,
      options?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
    )
    if (!flushed) return { ok: false, reason: 'error' }
    return await body()
  } finally {
    releaseMutationLock()
  }
}

async function runCommitTitle(
  projectId: string,
  options: MutationOptions | undefined,
  body: () => Promise<CommitTitleOutcome>
): Promise<CommitTitleOutcome> {
  if (!acquireMutationLock()) return { ok: false, reason: 'mutating' }
  try {
    const flushed = await flushPendingContent(
      projectId,
      options?.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS
    )
    if (!flushed) return { ok: false, reason: 'error' }
    return await body()
  } finally {
    releaseMutationLock()
  }
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
