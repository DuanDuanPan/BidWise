import { create } from 'zustand'
import type {
  ParsedTender,
  TenderMeta,
  RequirementItem,
  ScoringModel,
  ScoringCriterion,
  MandatoryItem,
  MandatoryItemSummary,
  StrategySeed,
  StrategySeedSummary,
  FogMapItem,
  FogMapSummary,
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
  // Story 2.6: mandatory detection state
  mandatoryItems: MandatoryItem[] | null
  mandatorySummary: MandatoryItemSummary | null
  mandatoryDetectionTaskId: string | null
  mandatoryDetectionProgress: number
  mandatoryDetectionMessage: string
  mandatoryDetectionLoading: boolean
  mandatoryDetectionError: string | null
  // Story 2.7: strategy seed state
  seeds: StrategySeed[] | null
  seedSummary: StrategySeedSummary | null
  seedGenerationTaskId: string | null
  seedGenerationProgress: number
  seedGenerationMessage: string
  seedGenerationLoading: boolean
  seedGenerationError: string | null
  // Story 2.9: fog map state
  fogMap: FogMapItem[] | null
  fogMapSummary: FogMapSummary | null
  fogMapTaskId: string | null
  fogMapProgress: number
  fogMapMessage: string
  fogMapLoading: boolean
  fogMapError: string | null
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
  setError: (
    projectId: string,
    error: string,
    taskKind?: 'import' | 'extraction' | 'mandatory' | 'seed' | 'fog-map'
  ) => void
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
  // Story 2.6: mandatory detection actions
  detectMandatoryItems: (projectId: string) => Promise<void>
  fetchMandatoryItems: (projectId: string) => Promise<void>
  fetchMandatorySummary: (projectId: string) => Promise<void>
  updateMandatoryItem: (
    id: string,
    patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
  ) => Promise<void>
  addMandatoryItem: (
    projectId: string,
    content: string,
    sourceText?: string,
    sourcePages?: number[]
  ) => Promise<void>
  updateMandatoryDetectionProgress: (projectId: string, progress: number, message?: string) => void
  setMandatoryDetectionCompleted: (projectId: string) => Promise<void>
  setMandatoryDetectionError: (projectId: string, error: string) => void
  // Story 2.7: strategy seed actions
  generateSeeds: (projectId: string, sourceMaterial: string) => Promise<void>
  fetchSeeds: (projectId: string) => Promise<void>
  fetchSeedSummary: (projectId: string) => Promise<void>
  updateSeed: (
    id: string,
    patch: Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>
  ) => Promise<void>
  deleteSeed: (id: string) => Promise<void>
  addSeed: (
    projectId: string,
    title: string,
    reasoning: string,
    suggestion: string
  ) => Promise<void>
  updateSeedGenerationProgress: (projectId: string, progress: number, message?: string) => void
  setSeedGenerationCompleted: (projectId: string) => Promise<void>
  setSeedGenerationError: (projectId: string, error: string) => void
  // Story 2.9: fog map actions
  generateFogMap: (projectId: string) => Promise<void>
  fetchFogMap: (projectId: string) => Promise<void>
  fetchFogMapSummary: (projectId: string) => Promise<void>
  confirmCertainty: (id: string) => Promise<void>
  batchConfirmCertainty: (projectId: string) => Promise<void>
  updateFogMapProgress: (projectId: string, progress: number, message?: string) => void
  setFogMapCompleted: (projectId: string) => Promise<void>
  setFogMapError: (projectId: string, error: string) => void
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
  mandatoryItems: null,
  mandatorySummary: null,
  mandatoryDetectionTaskId: null,
  mandatoryDetectionProgress: 0,
  mandatoryDetectionMessage: '',
  mandatoryDetectionLoading: false,
  mandatoryDetectionError: null,
  seeds: null,
  seedSummary: null,
  seedGenerationTaskId: null,
  seedGenerationProgress: 0,
  seedGenerationMessage: '',
  seedGenerationLoading: false,
  seedGenerationError: null,
  fogMap: null,
  fogMapSummary: null,
  fogMapTaskId: null,
  fogMapProgress: 0,
  fogMapMessage: '',
  fogMapLoading: false,
  fogMapError: null,
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
    if (
      projectState.importTaskId === taskId ||
      projectState.extractionTaskId === taskId ||
      projectState.mandatoryDetectionTaskId === taskId ||
      projectState.seedGenerationTaskId === taskId ||
      projectState.fogMapTaskId === taskId
    ) {
      return projectId
    }
  }

  return null
}

function computeSeedSummary(seeds: StrategySeed[]): StrategySeedSummary {
  return {
    total: seeds.length,
    confirmed: seeds.filter((s) => s.status === 'confirmed').length,
    adjusted: seeds.filter((s) => s.status === 'adjusted').length,
    pending: seeds.filter((s) => s.status === 'pending').length,
  }
}

function computeFogMapSummary(items: FogMapItem[]): FogMapSummary {
  const total = items.length
  const clear = items.filter((i) => i.certaintyLevel === 'clear').length
  const ambiguous = items.filter((i) => i.certaintyLevel === 'ambiguous').length
  const risky = items.filter((i) => i.certaintyLevel === 'risky').length
  // Only count confirmed among non-clear items to avoid double-counting in fogClearingPercentage
  const confirmed = items.filter((i) => i.confirmed && i.certaintyLevel !== 'clear').length
  const fogClearingPercentage = total > 0 ? Math.round(((clear + confirmed) / total) * 100) : 0
  return { total, clear, ambiguous, risky, confirmed, fogClearingPercentage }
}

function computeMandatorySummary(items: MandatoryItem[]): MandatoryItemSummary {
  return {
    total: items.length,
    confirmed: items.filter((i) => i.status === 'confirmed').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
    pending: items.filter((i) => i.status === 'detected').length,
  }
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
        error:
          taskKind === 'mandatory' || taskKind === 'seed' || taskKind === 'fog-map'
            ? projectState.error
            : error,
        loading: false,
        importTaskId: taskKind === 'import' ? null : projectState.importTaskId,
        extractionTaskId: taskKind === 'extraction' ? null : projectState.extractionTaskId,
        extractionLoading: taskKind === 'extraction' ? false : projectState.extractionLoading,
        taskStatus: taskKind === 'import' ? 'failed' : projectState.taskStatus,
        mandatoryDetectionTaskId:
          taskKind === 'mandatory' ? null : projectState.mandatoryDetectionTaskId,
        mandatoryDetectionLoading:
          taskKind === 'mandatory' ? false : projectState.mandatoryDetectionLoading,
        mandatoryDetectionError:
          taskKind === 'mandatory' ? error : projectState.mandatoryDetectionError,
        seedGenerationTaskId: taskKind === 'seed' ? null : projectState.seedGenerationTaskId,
        seedGenerationLoading: taskKind === 'seed' ? false : projectState.seedGenerationLoading,
        seedGenerationError: taskKind === 'seed' ? error : projectState.seedGenerationError,
        // Extraction failure also invalidates any in-flight fog-map task (stale requirements)
        fogMapTaskId:
          taskKind === 'fog-map' || taskKind === 'extraction' ? null : projectState.fogMapTaskId,
        fogMapLoading:
          taskKind === 'fog-map' || taskKind === 'extraction' ? false : projectState.fogMapLoading,
        fogMapError: taskKind === 'fog-map' ? error : projectState.fogMapError,
        // Re-extraction failure: backend may have already deleted certainties + fog-map.json,
        // so invalidate stale frontend fog map data to prevent operating on phantom state
        fogMap: taskKind === 'extraction' ? null : projectState.fogMap,
        fogMapSummary: taskKind === 'extraction' ? null : projectState.fogMapSummary,
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
        // Clear stale fog map data — backend deletes certainties on re-extraction
        fogMap: null,
        fogMapSummary: null,
        fogMapError: null,
      })),
    }))
  },

  // ─── Story 2.6: Mandatory Detection Actions ───

  detectMandatoryItems: async (projectId: string) => {
    // Guard: prevent concurrent detection
    const current = getAnalysisProjectState(useAnalysisStore.getState(), projectId)
    if (current.mandatoryDetectionLoading || current.mandatoryDetectionTaskId) return

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        mandatoryDetectionLoading: true,
        mandatoryDetectionProgress: 0,
        mandatoryDetectionMessage: '正在启动*项检测...',
        mandatoryDetectionTaskId: null,
        mandatoryDetectionError: null,
      })),
    }))

    try {
      const res = await window.api.analysisDetectMandatory({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            mandatoryDetectionTaskId: res.data.taskId,
            mandatoryDetectionLoading: false,
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            mandatoryDetectionError: res.error.message,
            mandatoryDetectionLoading: false,
            mandatoryDetectionTaskId: null,
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          mandatoryDetectionError: (err as Error).message,
          mandatoryDetectionLoading: false,
          mandatoryDetectionTaskId: null,
        })),
      }))
    }
  },

  fetchMandatoryItems: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetMandatoryItems({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            mandatoryItems: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail — data may not exist yet
    }
  },

  fetchMandatorySummary: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetMandatorySummary({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            mandatorySummary: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail
    }
  },

  updateMandatoryItem: async (id, patch) => {
    try {
      const res = await window.api.analysisUpdateMandatoryItem({ id, patch })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      // Update in-place and recompute summary
      set((state) => {
        const newProjects = { ...state.projects }
        for (const [pid, ps] of Object.entries(newProjects)) {
          if (ps.mandatoryItems) {
            const idx = ps.mandatoryItems.findIndex((m) => m.id === id)
            if (idx !== -1) {
              const updated = [...ps.mandatoryItems]
              updated[idx] = res.data
              const summary = computeMandatorySummary(updated)
              newProjects[pid] = { ...ps, mandatoryItems: updated, mandatorySummary: summary }
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

  addMandatoryItem: async (projectId, content, sourceText, sourcePages) => {
    try {
      const res = await window.api.analysisAddMandatoryItem({
        projectId,
        content,
        sourceText,
        sourcePages,
      })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => {
          const items = [...(prev.mandatoryItems ?? []), res.data]
          return {
            ...prev,
            mandatoryItems: items,
            mandatorySummary: computeMandatorySummary(items),
          }
        }),
      }))
    } catch (error) {
      throw new Error(toErrorMessage(error))
    }
  },

  updateMandatoryDetectionProgress: (projectId, progress, message) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        mandatoryDetectionProgress: progress,
        mandatoryDetectionMessage: message ?? prev.mandatoryDetectionMessage,
      })),
    }))
  },

  setMandatoryDetectionCompleted: async (projectId) => {
    // Fetch fresh data
    const itemsRes = await window.api.analysisGetMandatoryItems({ projectId })
    const summaryRes = await window.api.analysisGetMandatorySummary({ projectId })

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        mandatoryItems: itemsRes.success ? itemsRes.data : prev.mandatoryItems,
        mandatorySummary: summaryRes.success ? summaryRes.data : prev.mandatorySummary,
        mandatoryDetectionTaskId: null,
        mandatoryDetectionProgress: 100,
        mandatoryDetectionMessage: '*项检测完成',
        mandatoryDetectionLoading: false,
        mandatoryDetectionError: null,
      })),
    }))
  },

  setMandatoryDetectionError: (projectId, error) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        mandatoryDetectionError: error,
        mandatoryDetectionTaskId: null,
        mandatoryDetectionLoading: false,
      })),
    }))
  },

  // ─── Story 2.7: Strategy Seed Actions ───

  generateSeeds: async (projectId: string, sourceMaterial: string) => {
    const current = getAnalysisProjectState(useAnalysisStore.getState(), projectId)
    if (current.seedGenerationLoading || current.seedGenerationTaskId) return

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        seedGenerationLoading: true,
        seedGenerationProgress: 0,
        seedGenerationMessage: '正在启动策略种子生成...',
        seedGenerationTaskId: null,
        seedGenerationError: null,
      })),
    }))

    try {
      const res = await window.api.analysisGenerateSeeds({ projectId, sourceMaterial })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            seedGenerationTaskId: res.data.taskId,
            seedGenerationLoading: false,
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            seedGenerationError: res.error.message,
            seedGenerationLoading: false,
            seedGenerationTaskId: null,
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          seedGenerationError: (err as Error).message,
          seedGenerationLoading: false,
          seedGenerationTaskId: null,
        })),
      }))
    }
  },

  fetchSeeds: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetSeeds({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            seeds: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail — data may not exist yet
    }
  },

  fetchSeedSummary: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetSeedSummary({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            seedSummary: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail
    }
  },

  updateSeed: async (id, patch) => {
    try {
      const res = await window.api.analysisUpdateSeed({ id, patch })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => {
        const newProjects = { ...state.projects }
        for (const [pid, ps] of Object.entries(newProjects)) {
          if (ps.seeds) {
            const idx = ps.seeds.findIndex((s) => s.id === id)
            if (idx !== -1) {
              const updated = [...ps.seeds]
              updated[idx] = res.data
              const summary = computeSeedSummary(updated)
              newProjects[pid] = { ...ps, seeds: updated, seedSummary: summary }
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

  deleteSeed: async (id) => {
    try {
      const res = await window.api.analysisDeleteSeed({ id })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => {
        const newProjects = { ...state.projects }
        for (const [pid, ps] of Object.entries(newProjects)) {
          if (ps.seeds) {
            const idx = ps.seeds.findIndex((s) => s.id === id)
            if (idx !== -1) {
              const updated = ps.seeds.filter((s) => s.id !== id)
              const summary = computeSeedSummary(updated)
              newProjects[pid] = { ...ps, seeds: updated, seedSummary: summary }
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

  addSeed: async (projectId, title, reasoning, suggestion) => {
    try {
      const res = await window.api.analysisAddSeed({ projectId, title, reasoning, suggestion })
      if (!res.success) {
        throw new Error(res.error.message)
      }

      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => {
          const seeds = [...(prev.seeds ?? []), res.data]
          return {
            ...prev,
            seeds,
            seedSummary: computeSeedSummary(seeds),
          }
        }),
      }))
    } catch (error) {
      throw new Error(toErrorMessage(error))
    }
  },

  updateSeedGenerationProgress: (projectId, progress, message) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        seedGenerationProgress: progress,
        seedGenerationMessage: message ?? prev.seedGenerationMessage,
      })),
    }))
  },

  setSeedGenerationCompleted: async (projectId) => {
    const seedsRes = await window.api.analysisGetSeeds({ projectId })
    const summaryRes = await window.api.analysisGetSeedSummary({ projectId })

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        seeds: seedsRes.success ? seedsRes.data : prev.seeds,
        seedSummary: summaryRes.success ? summaryRes.data : prev.seedSummary,
        seedGenerationTaskId: null,
        seedGenerationProgress: 100,
        seedGenerationMessage: '策略种子生成完成',
        seedGenerationLoading: false,
        seedGenerationError: null,
      })),
    }))
  },

  setSeedGenerationError: (projectId, error) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        seedGenerationError: error,
        seedGenerationTaskId: null,
        seedGenerationLoading: false,
      })),
    }))
  },

  // ─── Story 2.9: Fog Map Actions ───

  generateFogMap: async (projectId: string) => {
    const current = getAnalysisProjectState(useAnalysisStore.getState(), projectId)
    if (current.fogMapLoading || current.fogMapTaskId) return

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        fogMapLoading: true,
        fogMapProgress: 0,
        fogMapMessage: '正在启动迷雾地图生成...',
        fogMapTaskId: null,
        fogMapError: null,
      })),
    }))

    try {
      const res = await window.api.analysisGenerateFogMap({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            fogMapTaskId: res.data.taskId,
            fogMapLoading: false,
          })),
        }))
      } else {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            fogMapError: res.error.message,
            fogMapLoading: false,
            fogMapTaskId: null,
          })),
        }))
      }
    } catch (err) {
      set((state) => ({
        projects: updateProjectState(state.projects, projectId, (prev) => ({
          ...prev,
          fogMapError: (err as Error).message,
          fogMapLoading: false,
          fogMapTaskId: null,
        })),
      }))
    }
  },

  fetchFogMap: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetFogMap({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            fogMap: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail — data may not exist yet
    }
  },

  fetchFogMapSummary: async (projectId: string) => {
    try {
      const res = await window.api.analysisGetFogMapSummary({ projectId })
      if (res.success) {
        set((state) => ({
          projects: updateProjectState(state.projects, projectId, (prev) => ({
            ...prev,
            fogMapSummary: res.data,
          })),
        }))
      }
    } catch {
      // Silently fail
    }
  },

  confirmCertainty: async (id: string) => {
    // Optimistic update: find which project this item belongs to
    let targetProjectId: string | null = null
    const state = useAnalysisStore.getState()
    for (const [pid, ps] of Object.entries(state.projects)) {
      if (ps.fogMap?.some((item) => item.id === id)) {
        targetProjectId = pid
        break
      }
    }

    if (!targetProjectId) return

    // Save snapshot for rollback
    const prevFogMap = state.projects[targetProjectId]?.fogMap
    const prevSummary = state.projects[targetProjectId]?.fogMapSummary

    // Optimistic: mark as confirmed locally
    set((s) => ({
      projects: updateProjectState(s.projects, targetProjectId!, (prev) => {
        const updatedFogMap = prev.fogMap?.map((item) =>
          item.id === id
            ? { ...item, confirmed: true, confirmedAt: new Date().toISOString() }
            : item
        )
        const summary = updatedFogMap ? computeFogMapSummary(updatedFogMap) : prev.fogMapSummary
        return { ...prev, fogMap: updatedFogMap ?? null, fogMapSummary: summary }
      }),
    }))

    try {
      const res = await window.api.analysisConfirmCertainty({ id })
      if (!res.success) {
        // Rollback
        set((s) => ({
          projects: updateProjectState(s.projects, targetProjectId!, (prev) => ({
            ...prev,
            fogMap: prevFogMap ?? null,
            fogMapSummary: prevSummary ?? null,
          })),
        }))
      }
    } catch {
      // Rollback
      set((s) => ({
        projects: updateProjectState(s.projects, targetProjectId!, (prev) => ({
          ...prev,
          fogMap: prevFogMap ?? null,
          fogMapSummary: prevSummary ?? null,
        })),
      }))
    }
  },

  batchConfirmCertainty: async (projectId: string) => {
    // Save snapshot for rollback
    const state = useAnalysisStore.getState()
    const prevFogMap = state.projects[projectId]?.fogMap
    const prevSummary = state.projects[projectId]?.fogMapSummary

    // Optimistic: mark all non-clear unconfirmed items as confirmed
    set((s) => ({
      projects: updateProjectState(s.projects, projectId, (prev) => {
        const now = new Date().toISOString()
        const updatedFogMap = prev.fogMap?.map((item) =>
          item.confirmed || item.certaintyLevel === 'clear'
            ? item
            : { ...item, confirmed: true, confirmedAt: now }
        )
        const summary = updatedFogMap ? computeFogMapSummary(updatedFogMap) : prev.fogMapSummary
        return { ...prev, fogMap: updatedFogMap ?? null, fogMapSummary: summary }
      }),
    }))

    try {
      const res = await window.api.analysisBatchConfirmCertainty({ projectId })
      if (!res.success) {
        set((s) => ({
          projects: updateProjectState(s.projects, projectId, (prev) => ({
            ...prev,
            fogMap: prevFogMap ?? null,
            fogMapSummary: prevSummary ?? null,
          })),
        }))
      }
    } catch {
      set((s) => ({
        projects: updateProjectState(s.projects, projectId, (prev) => ({
          ...prev,
          fogMap: prevFogMap ?? null,
          fogMapSummary: prevSummary ?? null,
        })),
      }))
    }
  },

  updateFogMapProgress: (projectId, progress, message) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        fogMapProgress: progress,
        fogMapMessage: message ?? prev.fogMapMessage,
      })),
    }))
  },

  setFogMapCompleted: async (projectId) => {
    const fogMapRes = await window.api.analysisGetFogMap({ projectId })
    const summaryRes = await window.api.analysisGetFogMapSummary({ projectId })

    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => {
        // Guard: if fogMapTaskId was already invalidated (e.g. extraction failure
        // cleared it), skip write-back to avoid restoring stale data.
        if (!prev.fogMapTaskId) return prev
        return {
          ...prev,
          fogMap: fogMapRes.success ? fogMapRes.data : prev.fogMap,
          fogMapSummary: summaryRes.success ? summaryRes.data : prev.fogMapSummary,
          fogMapTaskId: null,
          fogMapProgress: 100,
          fogMapMessage: '迷雾地图生成完成',
          fogMapLoading: false,
          fogMapError: null,
        }
      }),
    }))
  },

  setFogMapError: (projectId, error) => {
    set((state) => ({
      projects: updateProjectState(state.projects, projectId, (prev) => ({
        ...prev,
        fogMapError: error,
        fogMapTaskId: null,
        fogMapLoading: false,
      })),
    }))
  },
}))
