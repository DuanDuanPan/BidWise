import { useState, useCallback } from 'react'
import type { AnnotationFilterGroup, StatusFilter } from '../lib/annotationFilters'

export interface AnnotationFiltersState {
  typeFilter: Set<AnnotationFilterGroup>
  statusFilter: StatusFilter
  toggleType: (group: AnnotationFilterGroup) => void
  setStatusFilter: (status: StatusFilter) => void
}

const ALL_GROUPS = new Set<AnnotationFilterGroup>([
  'ai-suggestion',
  'asset-recommendation',
  'score-warning',
  'adversarial',
  'human-crossrole',
])

export function useAnnotationFilters(): AnnotationFiltersState {
  const [typeFilter, setTypeFilter] = useState<Set<AnnotationFilterGroup>>(
    () => new Set(ALL_GROUPS)
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')

  const toggleType = useCallback((group: AnnotationFilterGroup) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }, [])

  return { typeFilter, statusFilter, toggleType, setStatusFilter }
}
