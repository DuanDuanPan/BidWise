import { create } from 'zustand'
import type { ParsedTender, TenderMeta } from '@shared/analysis-types'
import type { TaskStatus } from '@shared/ai-types'

export interface AnalysisProjectState {
  tenderMeta: TenderMeta | null
  parsedTender: ParsedTender | null
  importTaskId: string | null
  parseProgress: number
  parseMessage: string
  loading: boolean
  error: string | null
  taskStatus: TaskStatus | null
}

export interface AnalysisState {
  projects: Record<string, AnalysisProjectState>
}

export interface AnalysisActions {
  importTender: (projectId: string, filePath: string) => Promise<void>
  fetchTenderResult: (projectId: string) => Promise<void>
  updateParseProgress: (projectId: string, progress: number, message: string) => void
  setParseTaskStatus: (projectId: string, status: TaskStatus | null) => void
  setParseCompleted: (projectId: string, result: ParsedTender) => void
  setError: (projectId: string, error: string) => void
  reset: (projectId?: string) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const EMPTY_ANALYSIS_PROJECT_STATE: Readonly<AnalysisProjectState> = Object.freeze({
  tenderMeta: null,
  parsedTender: null,
  importTaskId: null,
  parseProgress: 0,
  parseMessage: '',
  loading: false,
  error: null,
  taskStatus: null,
})

function createProjectState(overrides: Partial<AnalysisProjectState> = {}): AnalysisProjectState {
  return {
    ...EMPTY_ANALYSIS_PROJECT_STATE,
    ...overrides,
  }
}

function updateProjectState(
  projects: Record<string, AnalysisProjectState>,
  projectId: string,
  updater: (projectState: AnalysisProjectState) => AnalysisProjectState
): Record<string, AnalysisProjectState> {
  return {
    ...projects,
    [projectId]: updater(projects[projectId] ?? createProjectState()),
  }
}

export function getAnalysisProjectState(
  state: Pick<AnalysisState, 'projects'>,
  projectId: string | null | undefined
): AnalysisProjectState {
  if (!projectId) {
    return EMPTY_ANALYSIS_PROJECT_STATE
  }

  return state.projects[projectId] ?? EMPTY_ANALYSIS_PROJECT_STATE
}

export function findAnalysisProjectIdByTaskId(
  state: Pick<AnalysisState, 'projects'>,
  taskId: string
): string | null {
  for (const [projectId, projectState] of Object.entries(state.projects)) {
    if (projectState.importTaskId === taskId) {
      return projectId
    }
  }

  return null
}

export const useAnalysisStore = create<AnalysisStore>((set) => ({
  projects: {},

  importTender: async (projectId: string, filePath: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, () =>
        createProjectState({
          loading: true,
          taskStatus: 'running',
        })
      ),
    }))

    try {
      const res = await window.api.analysisImportTender({ projectId, filePath })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (projectState) => ({
            ...projectState,
            importTaskId: res.data.taskId,
            loading: false,
            error: null,
            taskStatus: 'running',
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (projectState) => ({
            ...projectState,
            error: res.error.message,
            loading: false,
            taskStatus: 'failed',
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (projectState) => ({
          ...projectState,
          error: (err as Error).message,
          loading: false,
          taskStatus: 'failed',
        })),
      }))
    }
  },

  fetchTenderResult: async (projectId: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (projectState) => ({
        ...projectState,
        loading: true,
        error: null,
      })),
    }))

    try {
      const res = await window.api.analysisGetTender({ projectId })
      if (res.success && res.data) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, () => ({
            tenderMeta: res.data.meta,
            parsedTender: res.data,
            importTaskId: null,
            parseProgress: 100,
            parseMessage: '解析完成',
            loading: false,
            error: null,
            taskStatus: 'completed',
          })),
        }))
      } else if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (projectState) => ({
            ...projectState,
            loading: false,
            error: null,
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (projectState) => ({
            ...projectState,
            error: res.error.message,
            loading: false,
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (projectState) => ({
          ...projectState,
          error: (err as Error).message,
          loading: false,
        })),
      }))
    }
  },

  updateParseProgress: (projectId: string, progress: number, message: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (projectState) => ({
        ...projectState,
        parseProgress: progress,
        parseMessage: message,
      })),
    }))
  },

  setParseTaskStatus: (projectId: string, status: TaskStatus | null) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (projectState) => ({
        ...projectState,
        taskStatus: status,
      })),
    }))
  },

  setParseCompleted: (projectId: string, result: ParsedTender) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, () => ({
        tenderMeta: result.meta,
        parsedTender: result,
        importTaskId: null,
        parseProgress: 100,
        parseMessage: '解析完成',
        loading: false,
        error: null,
        taskStatus: 'completed',
      })),
    }))
  },

  setError: (projectId: string, error: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (projectState) => ({
        ...projectState,
        error,
        loading: false,
        importTaskId: null,
        taskStatus: 'failed',
      })),
    }))
  },

  reset: (projectId?: string) => {
    if (!projectId) {
      set({ projects: {} })
      return
    }

    set((state) => {
      const nextProjects = { ...state.projects }
      delete nextProjects[projectId]
      return { projects: nextProjects }
    })
  },
}))
