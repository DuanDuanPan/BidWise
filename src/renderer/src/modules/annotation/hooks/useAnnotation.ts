import { useAnnotationStore } from '@renderer/stores/annotationStore'
import type { AnnotationProjectState } from '@renderer/stores/annotationStore'
import type { AnnotationRecord } from '@shared/annotation-types'
import { useShallow } from 'zustand/react/shallow'

const emptyState: AnnotationProjectState = {
  items: [],
  loading: false,
  error: null,
  loaded: false,
}

export function useProjectAnnotations(projectId: string): AnnotationProjectState {
  return useAnnotationStore((state) => state.projects[projectId] ?? emptyState)
}

const EMPTY_ITEMS: AnnotationRecord[] = []

export function useAnnotationsForSection(projectId: string, sectionId: string): AnnotationRecord[] {
  return useAnnotationStore(
    useShallow((state) => {
      const items = state.projects[projectId]?.items
      if (!items) return EMPTY_ITEMS
      return items.filter((item) => item.sectionId === sectionId)
    })
  )
}

export function usePendingAnnotationCount(projectId: string): number {
  return useAnnotationStore(
    (state) =>
      (state.projects[projectId]?.items ?? []).filter((item) => item.status === 'pending').length
  )
}
