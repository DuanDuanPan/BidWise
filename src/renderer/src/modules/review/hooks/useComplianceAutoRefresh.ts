import { useEffect, useRef, useCallback } from 'react'
import { useAnalysisStore, getAnalysisProjectState } from '@renderer/stores'
import { useReviewStore } from '@renderer/stores/reviewStore'

const DEBOUNCE_MS = 1000

function getMandatoryFingerprint(projectId: string): string | null {
  const state = useAnalysisStore.getState()
  const ps = getAnalysisProjectState(state, projectId)
  if (!ps.mandatoryItems) return null
  const confirmed = ps.mandatoryItems.filter((m) => m.status === 'confirmed')
  return confirmed
    .map((m) => `${m.id}:${m.linkedRequirementId ?? ''}`)
    .sort()
    .join(',')
}

function getMatrixUpdatedAt(projectId: string): string | null {
  const state = useAnalysisStore.getState()
  const ps = getAnalysisProjectState(state, projectId)
  return ps.traceabilityMatrix?.updatedAt ?? null
}

/**
 * Auto-refreshes compliance data when mandatory items or traceability matrix change.
 * Subscribes to analysisStore and compares fingerprints to detect relevant changes.
 * Compliance orchestration stays in this hook — reviewStore never calls analysisStore directly.
 */
export function useComplianceAutoRefresh(projectId: string): void {
  const checkCompliance = useReviewStore((s) => s.checkCompliance)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevFingerprintRef = useRef<string | null>(null)
  const prevMatrixUpdatedAtRef = useRef<string | null>(null)

  const debouncedCheck = useCallback(
    (pid: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void checkCompliance(pid)
      }, DEBOUNCE_MS)
    },
    [checkCompliance]
  )

  // Initial check on mount
  useEffect(() => {
    if (!projectId) return
    prevFingerprintRef.current = getMandatoryFingerprint(projectId)
    prevMatrixUpdatedAtRef.current = getMatrixUpdatedAt(projectId)
    void checkCompliance(projectId)
  }, [projectId, checkCompliance])

  // Subscribe to analysisStore changes that affect compliance
  useEffect(() => {
    if (!projectId) return undefined

    const unsubscribe = useAnalysisStore.subscribe(() => {
      const newFingerprint = getMandatoryFingerprint(projectId)
      const newMatrixUpdatedAt = getMatrixUpdatedAt(projectId)

      const changed =
        newFingerprint !== prevFingerprintRef.current ||
        newMatrixUpdatedAt !== prevMatrixUpdatedAtRef.current

      if (changed) {
        prevFingerprintRef.current = newFingerprint
        prevMatrixUpdatedAtRef.current = newMatrixUpdatedAt
        debouncedCheck(projectId)
      }
    })

    return () => {
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [projectId, debouncedCheck])
}
