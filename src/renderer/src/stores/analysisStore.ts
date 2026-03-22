import { create } from 'zustand'
import type {
  ParsedTender,
  TenderMeta,
  RequirementItem,
  ScoringModel,
  ScoringCriterion,
} from '@shared/analysis-types'
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
  // Story 2.5: extraction state
  requirements: RequirementItem[] | null
  scoringModel: ScoringModel | null
  extractionTaskId: string | null
  extractionProgress: number
  extractionMessage: string
  extractionLoading: boolean
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
  setError: (projectId: string, error: string, taskKind?: 'import' | 'extraction') => void
  reset: (projectId?: string) => void
  // Story 2.5: extraction actions
  extractRequirements: (projectId: string) => Promise<void>
  fetchRequirements: (projectId: string) => Promise<void>
  fetchScoringModel: (projectId: string) => Promise<void>
  updateRequirement: (
    id: string,
    patch: Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
  ) => Promise<void>
  updateScoringCriterion: (
    projectId: string,
    criterionId: string,
    patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
  ) => Promise<void>
  confirmScoringModel: (projectId: string) => Promise<void>
  updateExtractionProgress: (projectId: string, progress: number, message: string) => void
  setExtractionCompleted: (
    projectId: string,
    result: { requirements: RequirementItem[]; scoringModel: ScoringModel | null }
  ) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请重试'
}

export const EMPTY_ANALYSIS_PROJECT_STATE: Readonly<AnalysisProjectState> = Object.freeze({
  tenderMeta: null,
  parsedTender: null,
  importTaskId: null,
  parseProgress: 0,
  parseMessage: '',
  loading: false,
  error: null,
  taskStatus: null,
  requirements: null,
  scoringModel: null,
  extractionTaskId: null,
  extractionProgress: 0,
  extractionMessage: '',
  extractionLoading: false,
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
    if (projectState.importTaskId === taskId || projectState.extractionTaskId === taskId) {
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
          error: null,
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
        const tender = res.data
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            tenderMeta: tender.meta,
            parsedTender: tender,
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
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
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

  setError: (projectId: string, error: string, taskKind = 'import') => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (projectState) => ({
        ...projectState,
        error,
        loading: false,
        importTaskId: taskKind === 'import' ? null : projectState.importTaskId,
        extractionTaskId: taskKind === 'extraction' ? null : projectState.extractionTaskId,
        extractionLoading: taskKind === 'extraction' ? false : projectState.extractionLoading,
        taskStatus: taskKind === 'import' ? 'failed' : projectState.taskStatus,
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

  // ─── Story 2.5: Extraction Actions ───

  extractRequirements: async (projectId: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        extractionLoading: true,
        extractionProgress: 0,
        extractionMessage: '正在启动抽取...',
        extractionTaskId: null,
        error: null,
      })),
    }))

    try {
      const res = await window.api.analysisExtractRequirements({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            extractionTaskId: res.data.taskId,
            extractionLoading: false,
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            error: res.error.message,
            extractionLoading: false,
            extractionTaskId: null,
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          error: (err as Error).message,
          extractionLoading: false,
          extractionTaskId: null,
        })),
      }))
    }
  },

  fetchRequirements: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetRequirements({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            requirements: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail — data may not exist yet
    }
  },

  fetchScoringModel: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetScoringModel({ projectId })
      if (res.success && res.data) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            scoringModel: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail — data may not exist yet
    }
  },

  updateRequirement: async (id, patch) => {
    try {
      const res = await window.api.analysisUpdateRequirement({ id, patch })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      // Update the item in-place
      set((state) => {
        const newProjects = { ...state.projects }
        for (const [pid, ps] of Object.entries(newProjects)) {
          if (ps.requirements) {
            const idx = ps.requirements.findIndex((r) => r.id === id)
            if (idx !== -1) {
              const updated = [...ps.requirements]
              updated[idx] = res.data
              newProjects[pid] = { ...ps, requirements: updated }
              break
            }
          }
        }
        return { projects: newProjects }
      })
    } catch (error) {
      throw new Error(toErrorMessage(error))
    }
  },

  updateScoringCriterion: async (projectId, criterionId, patch) => {
    try {
      const res = await window.api.analysisUpdateScoringModel({ projectId, criterionId, patch })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          scoringModel: res.data,
        })),
      }))
    } catch (error) {
      throw new Error(toErrorMessage(error))
    }
  },

  confirmScoringModel: async (projectId: string) => {
    try {
      const res = await window.api.analysisConfirmScoringModel({ projectId })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          scoringModel: res.data,
        })),
      }))
    } catch (error) {
      throw new Error(toErrorMessage(error))
    }
  },

  updateExtractionProgress: (projectId: string, progress: number, message: string) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        extractionProgress: progress,
        extractionMessage: message,
      })),
    }))
  },

  setExtractionCompleted: (projectId, result) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        requirements: result.requirements,
        scoringModel: result.scoringModel ?? prev.scoringModel,
        extractionTaskId: null,
        extractionProgress: 100,
        extractionMessage: '抽取完成',
        extractionLoading: false,
      })),
    }))
  },
}))
