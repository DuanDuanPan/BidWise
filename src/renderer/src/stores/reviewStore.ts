import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MandatoryComplianceResult } from '@shared/analysis-types'
import type {
  AdversarialLineup,
  UpdateLineupInput,
  ConfirmLineupInput,
} from '@shared/adversarial-types'

export interface ReviewProjectState {
  compliance: MandatoryComplianceResult | null
  loading: boolean
  error: string | null
  loaded: boolean
  // Adversarial lineup state (Story 7.2)
  lineup: AdversarialLineup | null
  lineupLoaded: boolean
  lineupLoading: boolean
  lineupError: string | null
  lineupTaskId: string | null
  lineupProgress: number
  lineupMessage: string | null
}

export interface ReviewState {
  projects: Record<string, ReviewProjectState>
}

interface ReviewActions {
  checkCompliance: (projectId: string) => Promise<void>
  reset: (projectId?: string) => void
  // Adversarial lineup actions (Story 7.2)
  startLineupGeneration: (projectId: string) => Promise<void>
  loadLineup: (projectId: string) => Promise<boolean>
  updateRoles: (input: UpdateLineupInput) => Promise<void>
  confirmLineup: (input: ConfirmLineupInput) => Promise<void>
  setLineupProgress: (projectId: string, progress: number, message?: string) => void
  setLineupTaskError: (projectId: string, error: string) => void
  clearLineupError: (projectId: string) => void
}

export type ReviewStore = ReviewState & ReviewActions

export function createProjectState(overrides?: Partial<ReviewProjectState>): ReviewProjectState {
  return {
    compliance: null,
    loading: false,
    error: null,
    loaded: false,
    lineup: null,
    lineupLoaded: false,
    lineupLoading: false,
    lineupError: null,
    lineupTaskId: null,
    lineupProgress: 0,
    lineupMessage: null,
    ...overrides,
  }
}

export function getReviewProjectState(state: ReviewState, projectId: string): ReviewProjectState {
  return state.projects[projectId] ?? createProjectState()
}

export function findReviewProjectIdByTaskId(
  state: ReviewState,
  taskId: string
): string | undefined {
  for (const [projectId, projectState] of Object.entries(state.projects)) {
    if (projectState.lineupTaskId === taskId) return projectId
  }
  return undefined
}

function updateProject(
  state: ReviewState,
  projectId: string,
  patch: Partial<ReviewProjectState>
): ReviewState {
  return {
    ...state,
    projects: {
      ...state.projects,
      [projectId]: {
        ...getReviewProjectState(state, projectId),
        ...patch,
      },
    },
  }
}

export const useReviewStore = create<ReviewStore>()(
  subscribeWithSelector((set) => ({
    projects: {},

    async checkCompliance(projectId: string): Promise<void> {
      set((state) => updateProject(state, projectId, { loading: true, error: null }))

      try {
        const response = await window.api.complianceCheck({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              compliance: response.data,
              loading: false,
              loaded: true,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              compliance: null,
              loading: false,
              loaded: false,
              error: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            compliance: null,
            loading: false,
            loaded: false,
            error: (err as Error).message,
          })
        )
      }
    },

    async startLineupGeneration(projectId: string): Promise<void> {
      set((state) =>
        updateProject(state, projectId, {
          lineup: null,
          lineupLoaded: false,
          lineupLoading: true,
          lineupError: null,
          lineupProgress: 0,
          lineupMessage: '正在启动对抗角色生成...',
        })
      )

      try {
        const response = await window.api.reviewGenerateRoles({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              lineupTaskId: response.data.taskId,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              lineupLoading: false,
              lineupError: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            lineupLoading: false,
            lineupError: (err as Error).message,
          })
        )
      }
    },

    async loadLineup(projectId: string): Promise<boolean> {
      try {
        const response = await window.api.reviewGetLineup({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              lineup: response.data ?? null,
              lineupLoaded: true,
              lineupLoading: false,
              lineupTaskId: null,
              lineupProgress: 0,
              lineupMessage: null,
            })
          )
          return response.data != null
        }
        return false
      } catch {
        // Non-fatal: lineup will be loaded when available
        return false
      }
    },

    async updateRoles(input: UpdateLineupInput): Promise<void> {
      try {
        const response = await window.api.reviewUpdateRoles(input)
        if (response.success) {
          const projectId = response.data.projectId
          set((state) =>
            updateProject(state, projectId, {
              lineup: response.data,
            })
          )
        }
      } catch {
        // Handled by caller
      }
    },

    async confirmLineup(input: ConfirmLineupInput): Promise<void> {
      try {
        const response = await window.api.reviewConfirmLineup(input)
        if (response.success) {
          const projectId = response.data.projectId
          set((state) =>
            updateProject(state, projectId, {
              lineup: response.data,
            })
          )
        }
      } catch {
        // Handled by caller
      }
    },

    setLineupProgress(projectId: string, progress: number, message?: string): void {
      set((state) =>
        updateProject(state, projectId, {
          lineupProgress: progress,
          lineupMessage: message ?? state.projects[projectId]?.lineupMessage ?? null,
        })
      )
    },

    setLineupTaskError(projectId: string, error: string): void {
      set((state) =>
        updateProject(state, projectId, {
          lineup: null,
          lineupLoaded: false,
          lineupLoading: false,
          lineupError: error,
          lineupTaskId: null,
          lineupProgress: 0,
          lineupMessage: null,
        })
      )
    },

    clearLineupError(projectId: string): void {
      set((state) =>
        updateProject(state, projectId, {
          lineupError: null,
        })
      )
    },

    reset(projectId?: string): void {
      if (projectId) {
        set((state) => ({
          ...state,
          projects: {
            ...state.projects,
            [projectId]: createProjectState(),
          },
        }))
      } else {
        set({ projects: {} })
      }
    },
  }))
)
