import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MandatoryComplianceResult } from '@shared/analysis-types'

export interface ReviewProjectState {
  compliance: MandatoryComplianceResult | null
  loading: boolean
  error: string | null
  loaded: boolean
}

export interface ReviewState {
  projects: Record<string, ReviewProjectState>
}

interface ReviewActions {
  checkCompliance: (projectId: string) => Promise<void>
  reset: (projectId?: string) => void
}

export type ReviewStore = ReviewState & ReviewActions

export function createProjectState(overrides?: Partial<ReviewProjectState>): ReviewProjectState {
  return {
    compliance: null,
    loading: false,
    error: null,
    loaded: false,
    ...overrides,
  }
}

export function getReviewProjectState(state: ReviewState, projectId: string): ReviewProjectState {
  return state.projects[projectId] ?? createProjectState()
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
              loading: false,
              error: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            loading: false,
            error: (err as Error).message,
          })
        )
      }
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
