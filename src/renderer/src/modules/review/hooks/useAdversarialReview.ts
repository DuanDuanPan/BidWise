import { useCallback, useEffect, useRef, useState } from 'react'
import { useReviewStore, getReviewProjectState } from '@renderer/stores'
import type { HandleFindingAction, AdversarialReviewSession } from '@shared/adversarial-types'

interface UseAdversarialReviewReturn {
  reviewSession: AdversarialReviewSession | null
  reviewLoaded: boolean
  reviewLoading: boolean
  reviewError: string | null
  reviewProgress: number
  reviewMessage: string | null
  panelOpen: boolean
  openPanel: () => void
  closePanel: () => void
  startReview: () => Promise<void>
  retryRole: (roleId: string) => Promise<void>
  handleFinding: (
    findingId: string,
    action: HandleFindingAction,
    rebuttalReason?: string
  ) => Promise<void>
  clearError: () => void
}

export function useAdversarialReview(projectId: string | undefined): UseAdversarialReviewReturn {
  const [panelOpen, setPanelOpen] = useState(false)

  const projectState = useReviewStore((s) =>
    projectId ? getReviewProjectState(s, projectId) : null
  )
  const storeStartReview = useReviewStore((s) => s.startReview)
  const storeLoadReview = useReviewStore((s) => s.loadReview)
  const storeRetryRole = useReviewStore((s) => s.retryRole)
  const storeHandleFinding = useReviewStore((s) => s.handleFinding)
  const storeClearError = useReviewStore((s) => s.clearReviewError)

  // Auto-load existing review on mount
  useEffect(() => {
    if (projectId && projectState && !projectState.reviewLoaded && !projectState.reviewLoading) {
      void storeLoadReview(projectId)
    }
  }, [projectId, projectState, storeLoadReview])

  // Auto-open panel when review reaches terminal state
  const prevStatusRef = useRef(projectState?.reviewSession?.status)
  const currentStatus = projectState?.reviewSession?.status
  if (currentStatus !== prevStatusRef.current) {
    prevStatusRef.current = currentStatus
    if (
      currentStatus === 'completed' ||
      currentStatus === 'partial' ||
      currentStatus === 'failed'
    ) {
      if (!panelOpen) {
        setPanelOpen(true)
      }
    }
  }

  const startReview = useCallback(async () => {
    if (!projectId) return
    setPanelOpen(true)
    await storeStartReview(projectId)
  }, [projectId, storeStartReview])

  const retryRole = useCallback(
    async (roleId: string) => {
      if (!projectId) return
      setPanelOpen(true)
      await storeRetryRole(projectId, roleId)
    },
    [projectId, storeRetryRole]
  )

  const handleFinding = useCallback(
    async (findingId: string, action: HandleFindingAction, rebuttalReason?: string) => {
      if (!projectId) return
      await storeHandleFinding(projectId, findingId, action, rebuttalReason)
    },
    [projectId, storeHandleFinding]
  )

  const clearError = useCallback(() => {
    if (!projectId) return
    storeClearError(projectId)
  }, [projectId, storeClearError])

  return {
    reviewSession: projectState?.reviewSession ?? null,
    reviewLoaded: projectState?.reviewLoaded ?? false,
    reviewLoading: projectState?.reviewLoading ?? false,
    reviewError: projectState?.reviewError ?? null,
    reviewProgress: projectState?.reviewProgress ?? 0,
    reviewMessage: projectState?.reviewMessage ?? null,
    panelOpen,
    openPanel: useCallback(() => setPanelOpen(true), []),
    closePanel: useCallback(() => setPanelOpen(false), []),
    startReview,
    retryRole,
    handleFinding,
    clearError,
  }
}
