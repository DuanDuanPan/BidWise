import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MandatoryComplianceResult } from '@shared/analysis-types'
import type {
  AdversarialLineup,
  UpdateLineupInput,
  ConfirmLineupInput,
  AdversarialReviewSession,
  HandleFindingAction,
} from '@shared/adversarial-types'
import type { AttackChecklist, AttackChecklistItemStatus } from '@shared/attack-checklist-types'

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
  // Adversarial review execution state (Story 7.3)
  reviewSession: AdversarialReviewSession | null
  reviewLoaded: boolean
  reviewLoading: boolean
  reviewError: string | null
  reviewTaskId: string | null
  reviewProgress: number
  reviewMessage: string | null
  // Attack checklist state (Story 7.5)
  attackChecklist: AttackChecklist | null
  attackChecklistLoaded: boolean
  attackChecklistLoading: boolean
  attackChecklistError: string | null
  attackChecklistTaskId: string | null
  attackChecklistProgress: number
  attackChecklistMessage: string | null
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
  // Adversarial review actions (Story 7.3)
  startReview: (projectId: string) => Promise<void>
  loadReview: (projectId: string) => Promise<boolean>
  handleFinding: (
    projectId: string,
    findingId: string,
    action: HandleFindingAction,
    rebuttalReason?: string
  ) => Promise<void>
  retryRole: (projectId: string, roleId: string) => Promise<void>
  refreshReviewSession: (projectId: string) => Promise<void>
  updateReviewProgress: (projectId: string, progress: number, message?: string) => void
  setReviewTaskError: (projectId: string, error: string) => void
  clearReviewError: (projectId: string) => void
  // Attack checklist actions (Story 7.5)
  startAttackChecklistGeneration: (projectId: string) => Promise<void>
  loadAttackChecklist: (projectId: string) => Promise<boolean>
  refreshAttackChecklist: (projectId: string) => Promise<void>
  updateChecklistItemStatus: (
    projectId: string,
    itemId: string,
    status: AttackChecklistItemStatus
  ) => Promise<void>
  setAttackChecklistProgress: (projectId: string, progress: number, message?: string) => void
  setAttackChecklistTaskError: (projectId: string, error: string) => void
  clearAttackChecklistError: (projectId: string) => void
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
    reviewSession: null,
    reviewLoaded: false,
    reviewLoading: false,
    reviewError: null,
    reviewTaskId: null,
    reviewProgress: 0,
    reviewMessage: null,
    attackChecklist: null,
    attackChecklistLoaded: false,
    attackChecklistLoading: false,
    attackChecklistError: null,
    attackChecklistTaskId: null,
    attackChecklistProgress: 0,
    attackChecklistMessage: null,
    ...overrides,
  }
}

export function getReviewProjectState(state: ReviewState, projectId: string): ReviewProjectState {
  return state.projects[projectId] ?? createProjectState()
}

export type TaskKind = 'lineup' | 'review' | 'attack-checklist'

export function findReviewProjectIdByTaskId(
  state: ReviewState,
  taskId: string
): { projectId: string; taskKind: TaskKind } | undefined {
  for (const [projectId, projectState] of Object.entries(state.projects)) {
    if (projectState.lineupTaskId === taskId) return { projectId, taskKind: 'lineup' }
    if (projectState.reviewTaskId === taskId) return { projectId, taskKind: 'review' }
    if (projectState.attackChecklistTaskId === taskId)
      return { projectId, taskKind: 'attack-checklist' }
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

/** Per-project monotonic counter to discard stale refreshReviewSession responses */
const refreshVersions = new Map<string, number>()
/** Per-project monotonic counter to discard stale refreshAttackChecklist responses */
const attackChecklistRefreshVersions = new Map<string, number>()

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

    // ─── Review Execution Actions (Story 7.3) ───

    async startReview(projectId: string): Promise<void> {
      set((state) =>
        updateProject(state, projectId, {
          reviewSession: null,
          reviewLoaded: false,
          reviewLoading: true,
          reviewError: null,
          reviewProgress: 0,
          reviewMessage: '正在启动对抗评审…',
        })
      )

      try {
        const response = await window.api.reviewStartExecution({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              reviewTaskId: response.data.taskId,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              reviewLoading: false,
              reviewError: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            reviewLoading: false,
            reviewError: (err as Error).message,
          })
        )
      }
    },

    async loadReview(projectId: string): Promise<boolean> {
      try {
        const response = await window.api.reviewGetReview({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              reviewSession: response.data ?? null,
              reviewLoaded: true,
              reviewLoading: false,
              reviewTaskId: null,
              reviewProgress: 0,
              reviewMessage: null,
            })
          )
          return response.data != null
        }
        return false
      } catch {
        return false
      }
    },

    async handleFinding(
      projectId: string,
      findingId: string,
      action: HandleFindingAction,
      rebuttalReason?: string
    ): Promise<void> {
      // Optimistic update
      set((state) => {
        const ps = getReviewProjectState(state, projectId)
        if (!ps.reviewSession) return state

        const updatedFindings = ps.reviewSession.findings.map((f) =>
          f.id === findingId
            ? {
                ...f,
                status: action,
                rebuttalReason: action === 'rejected' ? (rebuttalReason?.trim() ?? null) : null,
              }
            : f
        )

        return updateProject(state, projectId, {
          reviewSession: { ...ps.reviewSession, findings: updatedFindings },
        })
      })

      try {
        const response = await window.api.reviewHandleFinding({
          findingId,
          action,
          rebuttalReason,
        })
        if (response.success) {
          // Sync with server response
          set((state) => {
            const ps = getReviewProjectState(state, projectId)
            if (!ps.reviewSession) return state

            const updatedFindings = ps.reviewSession.findings.map((f) =>
              f.id === findingId ? response.data : f
            )

            return updateProject(state, projectId, {
              reviewSession: { ...ps.reviewSession, findings: updatedFindings },
            })
          })
        } else {
          // Revert optimistic update on server rejection
          await useReviewStore.getState().loadReview(projectId)
        }
      } catch {
        // Revert optimistic update by reloading
        await useReviewStore.getState().loadReview(projectId)
      }
    },

    async retryRole(projectId: string, roleId: string): Promise<void> {
      set((state) =>
        updateProject(state, projectId, {
          reviewLoading: true,
          reviewError: null,
          reviewProgress: 0,
          reviewMessage: '正在重试角色评审…',
        })
      )

      try {
        const response = await window.api.reviewRetryRole({ projectId, roleId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              reviewTaskId: response.data.taskId,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              reviewLoading: false,
              reviewError: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            reviewLoading: false,
            reviewError: (err as Error).message,
          })
        )
      }
    },

    async refreshReviewSession(projectId: string): Promise<void> {
      const version = (refreshVersions.get(projectId) ?? 0) + 1
      refreshVersions.set(projectId, version)

      try {
        const response = await window.api.reviewGetReview({ projectId })
        if (response.success && response.data) {
          // Discard stale response — a newer refresh was already dispatched
          if (refreshVersions.get(projectId) !== version) return

          set((state) =>
            updateProject(state, projectId, {
              reviewSession: response.data,
            })
          )
        }
      } catch {
        // Non-fatal: session will be loaded on terminal state
      }
    },

    updateReviewProgress(projectId: string, progress: number, message?: string): void {
      set((state) =>
        updateProject(state, projectId, {
          reviewProgress: progress,
          reviewMessage: message ?? state.projects[projectId]?.reviewMessage ?? null,
        })
      )
    },

    setReviewTaskError(projectId: string, error: string): void {
      set((state) =>
        updateProject(state, projectId, {
          reviewLoading: false,
          reviewError: error,
          reviewTaskId: null,
          reviewProgress: 0,
          reviewMessage: null,
        })
      )
    },

    clearReviewError(projectId: string): void {
      set((state) =>
        updateProject(state, projectId, {
          reviewError: null,
        })
      )
    },

    // ─── Attack Checklist Actions (Story 7.5) ───

    async startAttackChecklistGeneration(projectId: string): Promise<void> {
      set((state) =>
        updateProject(state, projectId, {
          attackChecklist: null,
          attackChecklistLoaded: false,
          attackChecklistLoading: true,
          attackChecklistError: null,
          attackChecklistTaskId: null,
          attackChecklistProgress: 0,
          attackChecklistMessage: '正在启动攻击清单生成...',
        })
      )

      try {
        const response = await window.api.reviewGenerateAttackChecklist({ projectId })
        if (response.success) {
          set((state) =>
            updateProject(state, projectId, {
              attackChecklistTaskId: response.data.taskId,
            })
          )
        } else {
          set((state) =>
            updateProject(state, projectId, {
              attackChecklistLoading: false,
              attackChecklistError: response.error.message,
            })
          )
        }
      } catch (err) {
        set((state) =>
          updateProject(state, projectId, {
            attackChecklistLoading: false,
            attackChecklistError: (err as Error).message,
          })
        )
      }
    },

    async loadAttackChecklist(projectId: string): Promise<boolean> {
      // Snapshot generation state before the async call so we can detect
      // whether a generation started (or changed) while the IPC was in flight.
      const preCall = getReviewProjectState(useReviewStore.getState(), projectId)
      const preCallLoading = preCall.attackChecklistLoading
      const preCallTaskId = preCall.attackChecklistTaskId

      try {
        const response = await window.api.reviewGetAttackChecklist({ projectId })
        if (response.success) {
          set((state) => {
            const current = getReviewProjectState(state, projectId)
            // A generation started (or a different generation replaced the old one)
            // while this load was in-flight — preserve generation tracking state.
            const generationStartedDuringLoad =
              current.attackChecklistLoading &&
              (!preCallLoading || current.attackChecklistTaskId !== preCallTaskId)

            if (generationStartedDuringLoad) {
              return state
            }

            return updateProject(state, projectId, {
              attackChecklist: response.data ?? null,
              attackChecklistLoaded: true,
              attackChecklistLoading: false,
              attackChecklistTaskId: null,
              attackChecklistProgress: 0,
              attackChecklistMessage: null,
            })
          })
          return response.data != null
        }
        return false
      } catch {
        return false
      }
    },

    async refreshAttackChecklist(projectId: string): Promise<void> {
      const version = (attackChecklistRefreshVersions.get(projectId) ?? 0) + 1
      attackChecklistRefreshVersions.set(projectId, version)

      try {
        const response = await window.api.reviewGetAttackChecklist({ projectId })
        if (response.success && response.data) {
          if (attackChecklistRefreshVersions.get(projectId) !== version) return

          set((state) =>
            updateProject(state, projectId, {
              attackChecklist: response.data,
            })
          )
        }
      } catch {
        // Non-fatal
      }
    },

    async updateChecklistItemStatus(
      projectId: string,
      itemId: string,
      status: AttackChecklistItemStatus
    ): Promise<void> {
      // Optimistic update
      set((state) => {
        const ps = getReviewProjectState(state, projectId)
        if (!ps.attackChecklist) return state

        const updatedItems = ps.attackChecklist.items.map((item) =>
          item.id === itemId ? { ...item, status } : item
        )

        return updateProject(state, projectId, {
          attackChecklist: { ...ps.attackChecklist, items: updatedItems },
        })
      })

      try {
        const response = await window.api.reviewUpdateChecklistItemStatus({ itemId, status })
        if (response.success) {
          // Sync with server response
          set((state) => {
            const ps = getReviewProjectState(state, projectId)
            if (!ps.attackChecklist) return state

            const updatedItems = ps.attackChecklist.items.map((item) =>
              item.id === itemId ? response.data : item
            )

            return updateProject(state, projectId, {
              attackChecklist: { ...ps.attackChecklist, items: updatedItems },
            })
          })
        } else {
          // Revert optimistic update — skip if regeneration is in progress to avoid clobbering taskId
          const ps = getReviewProjectState(useReviewStore.getState(), projectId)
          if (!ps.attackChecklistLoading) {
            await useReviewStore.getState().loadAttackChecklist(projectId)
          }
        }
      } catch {
        // Revert optimistic update — skip if regeneration is in progress to avoid clobbering taskId
        const ps = getReviewProjectState(useReviewStore.getState(), projectId)
        if (!ps.attackChecklistLoading) {
          await useReviewStore.getState().loadAttackChecklist(projectId)
        }
      }
    },

    setAttackChecklistProgress(projectId: string, progress: number, message?: string): void {
      set((state) =>
        updateProject(state, projectId, {
          attackChecklistProgress: progress,
          attackChecklistMessage:
            message ?? state.projects[projectId]?.attackChecklistMessage ?? null,
        })
      )
    },

    setAttackChecklistTaskError(projectId: string, error: string): void {
      set((state) =>
        updateProject(state, projectId, {
          attackChecklistLoading: false,
          attackChecklistError: error,
          attackChecklistTaskId: null,
          attackChecklistProgress: 0,
          attackChecklistMessage: null,
        })
      )
    },

    clearAttackChecklistError(projectId: string): void {
      set((state) =>
        updateProject(state, projectId, {
          attackChecklistError: null,
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
