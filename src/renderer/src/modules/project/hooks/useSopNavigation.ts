import { useState, useCallback, useEffect, useMemo } from 'react'
import { message } from 'antd'
import { useProjectStore } from '@renderer/stores'
import type { SopStageKey, SopStageStatus } from '../types'
import { SOP_STAGES, deriveSopStageStatuses } from '../types'

type ActiveStageKey = Exclude<SopStageKey, 'not-started'>

interface UseSopNavigationResult {
  currentStageKey: ActiveStageKey
  stageStatuses: Record<ActiveStageKey, SopStageStatus>
  navigateToStage: (key: ActiveStageKey) => void
}

/** Valid active stage keys for validation */
const ACTIVE_STAGE_KEYS = new Set<string>(SOP_STAGES.map((s) => s.key))

/** Normalize sopStage from DB: invalid/missing → default to 'requirements-analysis' */
function normalizeStageKey(sopStage: string | undefined): ActiveStageKey {
  if (!sopStage || sopStage === 'not-started' || !ACTIVE_STAGE_KEYS.has(sopStage)) {
    return 'requirements-analysis'
  }
  return sopStage as ActiveStageKey
}

export function useSopNavigation(
  projectId: string | undefined,
  sopStage: string | undefined
): UseSopNavigationResult {
  const updateProject = useProjectStore((s) => s.updateProject)

  const [currentStageKey, setCurrentStageKey] = useState<ActiveStageKey>(
    normalizeStageKey(sopStage)
  )

  // React-recommended pattern: adjust state when prop changes (during render, not in effect)
  const [prevSopStage, setPrevSopStage] = useState(sopStage)
  if (sopStage !== prevSopStage) {
    setPrevSopStage(sopStage)
    setCurrentStageKey(normalizeStageKey(sopStage))
  }

  // Auto-persist 'not-started' → 'requirements-analysis' on first entry
  useEffect(() => {
    if (projectId && (!sopStage || sopStage === 'not-started')) {
      updateProject(projectId, { sopStage: 'requirements-analysis' }).catch((err: unknown) => {
        console.error('Failed to persist initial SOP stage:', err)
        message.warning('阶段状态保存失败，请稍后重试')
      })
    }
  }, [projectId, sopStage, updateProject])

  const stageStatuses = useMemo(() => deriveSopStageStatuses(currentStageKey), [currentStageKey])

  const navigateToStage = useCallback(
    (targetKey: ActiveStageKey) => {
      const targetIdx = SOP_STAGES.findIndex((s) => s.key === targetKey)
      const currentIdx = SOP_STAGES.findIndex((s) => s.key === currentStageKey)

      // Check for skipped stages — warn but still allow navigation
      if (targetIdx > currentIdx) {
        for (let i = currentIdx + 1; i < targetIdx; i++) {
          const skippedStage = SOP_STAGES[i]
          if (stageStatuses[skippedStage.key] === 'not-started') {
            message.warning(`前置阶段"${skippedStage.label}"尚未开始，建议按序完成后再进入当前阶段`)
            break
          }
        }
      }

      setCurrentStageKey(targetKey)

      // Persist the currently active stage for both forward and backward navigation
      if (projectId && targetKey !== currentStageKey) {
        updateProject(projectId, { sopStage: targetKey }).catch((err: unknown) => {
          console.error('Failed to persist SOP stage:', err)
          message.warning('阶段状态保存失败，请稍后重试')
        })
      }
    },
    [currentStageKey, stageStatuses, projectId, updateProject]
  )

  return { currentStageKey, stageStatuses, navigateToStage }
}
