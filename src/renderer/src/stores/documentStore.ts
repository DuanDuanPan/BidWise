import { create } from 'zustand'
import type { AutoSaveState } from '@shared/models/proposal'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import type { DocumentSaveDebugContext } from '@shared/ipc-types'

interface UpdateContentOptions {
  scheduleSave?: boolean
  debugContext?: DocumentSaveDebugContext
}

export interface DocumentState {
  content: string
  loadedProjectId: string | null
  loading: boolean
  error: string | null
  autoSave: AutoSaveState
  /**
   * Story 11.1: canonical chapter identity index from
   * `proposal.meta.json.sectionIndex`. Populated during `loadDocument`;
   * consumers derive `sectionId ↔ locator` via
   * `@shared/chapter-identity`. Empty array when metadata is unavailable.
   */
  sectionIndex: ProposalSectionIndexEntry[]
  /**
   * Story 11.3: set by `chapterStructureStore` mutations while an IPC is in
   * flight. `updateContent` drops writes while this is true so Plate edits
   * racing with a mutation cannot overwrite the snapshot that will replace
   * `content` when the mutation returns.
   */
  editingLocked: boolean
}

export interface DocumentActions {
  loadDocument: (projectId: string) => Promise<void>
  updateContent: (content: string, projectId: string, options?: UpdateContentOptions) => void
  saveDocument: (projectId: string) => Promise<void>
  saveDocumentSync: (projectId: string, rootPath: string | null, content?: string) => boolean
  /**
   * Story 11.3: write a server-committed structure mutation snapshot back into
   * the renderer store. Cancels queued autosave / debug trail so a stale tick
   * cannot overwrite the just-committed markdown.
   */
  applyStructureSnapshot: (
    projectId: string,
    snapshot: { content: string; sectionIndex: ProposalSectionIndexEntry[]; lastSavedAt?: string }
  ) => void
  /** Story 11.3: gate for `updateContent` writes during structure mutations. */
  setEditingLocked: (locked: boolean) => void
  resetDocument: () => void
}

export type DocumentStore = DocumentState & DocumentActions

const defaultAutoSave: AutoSaveState = {
  dirty: false,
  saving: false,
  lastSavedAt: null,
  error: null,
}
const AUTO_SAVE_DELAY_MS = 1000

// Shrink guard mirrors main-process check: reject store updates that would
// collapse a non-trivial document into an (effectively) empty one. This is
// the first-line defense against Plate's empty-editor state leaking into
// autosave via a stale handleValueChange tick.
const SHRINK_GUARD_MIN_EXISTING_CHARS = 100
const SHRINK_GUARD_RATIO = 0.1

function meaningfulLength(text: string): number {
  return text.replace(/[\u200B\s]/g, '').length
}

export const useDocumentStore = create<DocumentStore>((set, get) => {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let saveQueuedWhileSaving = false
  let queuedProjectId: string | null = null
  let latestSaveAttemptToken = 0
  let latestDocumentVersion = 0
  let latestDebugContext: DocumentSaveDebugContext | undefined
  let recentDebugTrail: DocumentSaveDebugContext[] = []

  const recordDebugContext = (context?: DocumentSaveDebugContext): void => {
    latestDebugContext = context
    if (!context) return
    recentDebugTrail = [...recentDebugTrail.slice(-5), context]
  }

  const resetDebugTrail = (): void => {
    latestDebugContext = undefined
    recentDebugTrail = []
  }

  const clearDebounceTimer = (): void => {
    if (!debounceTimer) {
      return
    }
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const scheduleSave = (projectId: string, delayMs = AUTO_SAVE_DELAY_MS): void => {
    queuedProjectId = projectId
    clearDebounceTimer()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void get().saveDocument(projectId)
    }, delayMs)
  }

  const resetAutoSaveQueue = (): void => {
    clearDebounceTimer()
    saveQueuedWhileSaving = false
    queuedProjectId = null
  }

  return {
    content: '',
    loadedProjectId: null,
    loading: false,
    error: null,
    autoSave: { ...defaultAutoSave },
    sectionIndex: [],
    editingLocked: false,

    loadDocument: async (projectId: string) => {
      resetAutoSaveQueue()
      resetDebugTrail()
      latestSaveAttemptToken += 1
      const requestVersion = ++latestDocumentVersion

      set({ loading: true, error: null })
      try {
        const res = await window.api.documentLoad({ projectId })
        if (res.success) {
          if (requestVersion !== latestDocumentVersion) {
            return
          }
          // Story 11.1: pull sectionIndex alongside content so renderer-side
          // `sectionId` resolution (useCurrentSection, OutlineHeadingElement)
          // works without an extra IPC round-trip per heading.
          let sectionIndex: ProposalSectionIndexEntry[] = []
          try {
            const metaRes = await window.api.documentGetMetadata({ projectId })
            if (metaRes.success) {
              sectionIndex = metaRes.data.sectionIndex ?? []
            }
          } catch {
            // Metadata fetch is best-effort — empty sectionIndex just means
            // bridging falls back to locator-only mode.
          }
          if (requestVersion !== latestDocumentVersion) {
            return
          }
          set({
            content: res.data.content,
            loadedProjectId: projectId,
            loading: false,
            sectionIndex,
            autoSave: {
              ...defaultAutoSave,
              lastSavedAt: res.data.lastSavedAt,
            },
          })
        } else {
          if (requestVersion !== latestDocumentVersion) {
            return
          }
          set({ error: res.error.message, loading: false, loadedProjectId: null, sectionIndex: [] })
        }
      } catch (err) {
        if (requestVersion !== latestDocumentVersion) {
          return
        }
        set({ error: (err as Error).message, loading: false, loadedProjectId: null })
      }
    },

    updateContent: (content: string, projectId: string, options?: UpdateContentOptions) => {
      // Story 11.3: drop writes while a structure mutation is in flight. The
      // mutation's returning snapshot replaces `content`; allowing concurrent
      // Plate edits to land here would make them disappear on snapshot apply.
      if (get().editingLocked) {
        console.debug(
          '[gen-debug:updateContent] BLOCKED: editingLocked (structure mutation in flight)'
        )
        return
      }
      const prevContent = get().content
      const contentChanged = prevContent !== content
      const source = options?.debugContext?.source ?? 'unknown'

      const prevMeaningful = meaningfulLength(prevContent)
      const newMeaningful = meaningfulLength(content)
      const catastrophicShrink =
        prevMeaningful >= SHRINK_GUARD_MIN_EXISTING_CHARS &&
        newMeaningful < prevMeaningful * SHRINK_GUARD_RATIO

      if (catastrophicShrink) {
        console.warn(
          `[gen-debug:updateContent] BLOCKED catastrophic shrink source=${source}, prev=${prevMeaningful}, new=${newMeaningful}`,
          { debugContext: options?.debugContext }
        )
        return
      }

      recordDebugContext(options?.debugContext)
      latestDocumentVersion += 1
      console.debug(
        `[gen-debug:updateContent] source=${source}, changed=${contentChanged}, lenDelta=${content.length - prevContent.length}, scheduleSave=${options?.scheduleSave !== false}`
      )
      set((state) => ({
        content,
        autoSave: {
          ...state.autoSave,
          dirty: state.autoSave.dirty || state.content !== content,
          error: null,
        },
      }))

      if (options?.scheduleSave === false) {
        return
      }

      scheduleSave(projectId)
    },

    saveDocument: async (projectId: string) => {
      const { content: contentToSave, autoSave } = get()
      if (autoSave.saving) {
        saveQueuedWhileSaving = true
        queuedProjectId = projectId
        return
      }

      clearDebounceTimer()

      const saveAttemptToken = ++latestSaveAttemptToken
      set((state) => ({
        autoSave: { ...state.autoSave, saving: true, error: null },
      }))

      try {
        const res = await window.api.documentSave({
          projectId,
          content: contentToSave,
          debugContext: latestDebugContext,
          debugTrail: recentDebugTrail,
        })
        if (saveAttemptToken !== latestSaveAttemptToken) {
          return
        }

        const contentChangedDuringSave = get().content !== contentToSave

        if (res.success) {
          set(() => ({
            autoSave: {
              dirty: contentChangedDuringSave,
              saving: false,
              lastSavedAt: res.data.lastSavedAt,
              error: null,
            },
          }))
          if (!contentChangedDuringSave) {
            resetDebugTrail()
          }
        } else {
          set((state) => ({
            autoSave: {
              ...state.autoSave,
              saving: false,
              error: res.error.message,
            },
          }))
        }
      } catch (err) {
        if (saveAttemptToken !== latestSaveAttemptToken) {
          return
        }
        set((state) => ({
          autoSave: {
            ...state.autoSave,
            saving: false,
            error: (err as Error).message,
          },
        }))
      } finally {
        if (saveAttemptToken === latestSaveAttemptToken) {
          const shouldReplayQueuedSave = saveQueuedWhileSaving
          const replayProjectId = queuedProjectId ?? projectId
          saveQueuedWhileSaving = false
          queuedProjectId = null

          const latestState = get()
          const contentChangedDuringSave = latestState.content !== contentToSave

          if (shouldReplayQueuedSave && latestState.autoSave.dirty && contentChangedDuringSave) {
            scheduleSave(replayProjectId, 0)
          }
        }
      }
    },

    saveDocumentSync: (projectId: string, rootPath: string | null, content?: string) => {
      if (!rootPath) {
        set((state) => ({
          autoSave: {
            ...state.autoSave,
            error: '项目目录不存在，无法保存文档',
          },
        }))
        return false
      }

      resetAutoSaveQueue()

      const contentToSave = content ?? get().content
      latestSaveAttemptToken += 1

      set((state) => ({
        content: contentToSave,
        autoSave: { ...state.autoSave, dirty: true, saving: true, error: null },
      }))

      const res = window.api.documentSaveSync({
        projectId,
        rootPath,
        content: contentToSave,
        debugContext: latestDebugContext,
        debugTrail: recentDebugTrail,
      })
      if (res.success) {
        resetDebugTrail()
        set({
          content: contentToSave,
          autoSave: {
            dirty: false,
            saving: false,
            lastSavedAt: res.data.lastSavedAt,
            error: null,
          },
        })
        return true
      }

      set((state) => ({
        content: contentToSave,
        autoSave: {
          ...state.autoSave,
          dirty: true,
          saving: false,
          error: res.error.message,
        },
      }))
      return false
    },

    setEditingLocked: (locked) => {
      set({ editingLocked: locked })
    },

    applyStructureSnapshot: (projectId, snapshot) => {
      const state = get()
      if (state.loadedProjectId !== projectId) return
      resetAutoSaveQueue()
      resetDebugTrail()
      latestSaveAttemptToken += 1
      latestDocumentVersion += 1
      set({
        content: snapshot.content,
        sectionIndex: snapshot.sectionIndex,
        autoSave: {
          ...defaultAutoSave,
          // Story 11.4: prefer the main-process committed `lastSavedAt` so
          // a later debounce save compares against the real on-disk clock
          // rather than a renderer-side `new Date()` that can drift ahead.
          lastSavedAt: snapshot.lastSavedAt ?? new Date().toISOString(),
        },
      })
    },

    resetDocument: () => {
      resetAutoSaveQueue()
      resetDebugTrail()
      latestSaveAttemptToken += 1
      latestDocumentVersion += 1
      set({
        content: '',
        loadedProjectId: null,
        loading: false,
        error: null,
        autoSave: { ...defaultAutoSave },
        sectionIndex: [],
        editingLocked: false,
      })
    },
  }
})
