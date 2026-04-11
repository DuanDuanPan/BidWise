import { useState, useEffect, useCallback, useRef } from 'react'
import { useReviewStore, getReviewProjectState } from '@renderer/stores'
import type { UpdateLineupInput, ConfirmLineupInput } from '@shared/adversarial-types'
import type { SopStageKey } from '@modules/project/types'

export function useAdversarialLineup(
  projectId: string | undefined,
  currentStageKey: SopStageKey
): {
  drawerOpen: boolean
  openDrawer: () => void
  closeDrawer: () => void
  triggerGenerate: () => void
  updateRoles: (input: UpdateLineupInput) => Promise<void>
  confirmLineup: (input: ConfirmLineupInput) => Promise<void>
} {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const projectState = useReviewStore((s) =>
    projectId ? getReviewProjectState(s, projectId) : null
  )
  const storeStartGeneration = useReviewStore((s) => s.startLineupGeneration)
  const storeLoadLineup = useReviewStore((s) => s.loadLineup)
  const storeUpdateRoles = useReviewStore((s) => s.updateRoles)
  const storeConfirmLineup = useReviewStore((s) => s.confirmLineup)

  // Track whether auto-trigger has fired for this project+stage combo
  const autoTriggeredRef = useRef<string | null>(null)

  // Load lineup on mount
  useEffect(() => {
    if (projectId) {
      void storeLoadLineup(projectId)
    }
  }, [projectId, storeLoadLineup])

  // Auto-trigger when entering compliance-review with no lineup and no task in progress
  useEffect(() => {
    if (
      currentStageKey === 'compliance-review' &&
      projectId &&
      projectState &&
      !projectState.lineup &&
      !projectState.lineupTaskId &&
      !projectState.lineupLoading &&
      projectState.lineupLoaded &&
      autoTriggeredRef.current !== projectId
    ) {
      autoTriggeredRef.current = projectId
      const timer = setTimeout(() => {
        setDrawerOpen(true)
        void storeStartGeneration(projectId)
      }, 0)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [currentStageKey, projectId, projectState, storeStartGeneration])

  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  const triggerGenerate = useCallback(() => {
    if (projectId) {
      autoTriggeredRef.current = null // Allow re-trigger
      setDrawerOpen(true)
      void storeStartGeneration(projectId)
    }
  }, [projectId, storeStartGeneration])

  const updateRoles = useCallback(
    async (input: UpdateLineupInput) => {
      await storeUpdateRoles(input)
    },
    [storeUpdateRoles]
  )

  const confirmLineup = useCallback(
    async (input: ConfirmLineupInput) => {
      await storeConfirmLineup(input)
    },
    [storeConfirmLineup]
  )

  return {
    drawerOpen,
    openDrawer,
    closeDrawer,
    triggerGenerate,
    updateRoles,
    confirmLineup,
  }
}
