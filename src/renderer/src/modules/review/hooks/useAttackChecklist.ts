import { useCallback, useEffect, useMemo } from 'react'
import { useReviewStore, getReviewProjectState } from '@renderer/stores'
import type { AttackChecklist, AttackChecklistItemStatus } from '@shared/attack-checklist-types'

export interface AttackChecklistStats {
  total: number
  addressed: number
  dismissed: number
  remaining: number
  progressPercent: number
}

interface UseAttackChecklistReturn {
  checklist: AttackChecklist | null
  loading: boolean
  error: string | null
  progress: number
  message: string | null
  generateChecklist: () => Promise<void>
  updateItemStatus: (itemId: string, status: AttackChecklistItemStatus) => Promise<void>
  clearError: () => void
  stats: AttackChecklistStats
}

export function useAttackChecklist(projectId?: string): UseAttackChecklistReturn {
  const projectState = useReviewStore((s) =>
    projectId ? getReviewProjectState(s, projectId) : null
  )
  const storeGenerate = useReviewStore((s) => s.startAttackChecklistGeneration)
  const storeLoad = useReviewStore((s) => s.loadAttackChecklist)
  const storeUpdateItem = useReviewStore((s) => s.updateChecklistItemStatus)
  const storeClearError = useReviewStore((s) => s.clearAttackChecklistError)

  // Auto-load on mount
  useEffect(() => {
    if (
      projectId &&
      projectState &&
      !projectState.attackChecklistLoaded &&
      !projectState.attackChecklistLoading
    ) {
      void storeLoad(projectId)
    }
  }, [projectId, projectState, storeLoad])

  const generateChecklist = useCallback(async () => {
    if (!projectId) return
    await storeGenerate(projectId)
  }, [projectId, storeGenerate])

  const updateItemStatus = useCallback(
    async (itemId: string, status: AttackChecklistItemStatus) => {
      if (!projectId) return
      await storeUpdateItem(projectId, itemId, status)
    },
    [projectId, storeUpdateItem]
  )

  const clearError = useCallback(() => {
    if (!projectId) return
    storeClearError(projectId)
  }, [projectId, storeClearError])

  const stats = useMemo<AttackChecklistStats>(() => {
    const items = projectState?.attackChecklist?.items ?? []
    const nonDismissed = items.filter((i) => i.status !== 'dismissed')
    const addressed = nonDismissed.filter((i) => i.status === 'addressed').length
    const dismissed = items.filter((i) => i.status === 'dismissed').length
    const total = nonDismissed.length
    const remaining = total - addressed

    return {
      total,
      addressed,
      dismissed,
      remaining,
      progressPercent: total > 0 ? Math.round((addressed / total) * 100) : 0,
    }
  }, [projectState?.attackChecklist?.items])

  return {
    checklist: projectState?.attackChecklist ?? null,
    loading: projectState?.attackChecklistLoading ?? false,
    error: projectState?.attackChecklistError ?? null,
    progress: projectState?.attackChecklistProgress ?? 0,
    message: projectState?.attackChecklistMessage ?? null,
    generateChecklist,
    updateItemStatus,
    clearError,
    stats,
  }
}
