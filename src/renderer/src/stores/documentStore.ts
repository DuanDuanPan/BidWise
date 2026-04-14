import { create } from 'zustand'
import type { AutoSaveState } from '@shared/models/proposal'
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
}

export interface DocumentActions {
  loadDocument: (projectId: string) => Promise<void>
  updateContent: (content: string, projectId: string, options?: UpdateContentOptions) => void
  saveDocument: (projectId: string) => Promise<void>
  saveDocumentSync: (projectId: string, rootPath: string | null, content?: string) => boolean
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
          set({
            content: res.data.content,
            loadedProjectId: projectId,
            loading: false,
            autoSave: {
              ...defaultAutoSave,
              lastSavedAt: res.data.lastSavedAt,
            },
          })
        } else {
          if (requestVersion !== latestDocumentVersion) {
            return
          }
          set({ error: res.error.message, loading: false, loadedProjectId: null })
        }
      } catch (err) {
        if (requestVersion !== latestDocumentVersion) {
          return
        }
        set({ error: (err as Error).message, loading: false, loadedProjectId: null })
      }
    },

    updateContent: (content: string, projectId: string, options?: UpdateContentOptions) => {
      recordDebugContext(options?.debugContext)
      latestDocumentVersion += 1
      const prevContent = get().content
      const contentChanged = prevContent !== content
      const source = options?.debugContext?.source ?? 'unknown'
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
      })
    },
  }
})
