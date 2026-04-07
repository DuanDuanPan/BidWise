import type { AnnotationRecord } from '@shared/annotation-types'
import { sortAnnotations } from './annotationSorter'

/**
 * Filters annotations to the current chapter section scope.
 * When sectionKey is null, returns all items (project-level view).
 */
export function scopeToSection(
  items: AnnotationRecord[],
  sectionKey: string | null
): AnnotationRecord[] {
  if (!sectionKey) return items
  return items.filter((item) => item.sectionId === sectionKey)
}

/**
 * Count pending items in a given scope (used for overload detection).
 */
export function countPendingInScope(items: AnnotationRecord[], sectionKey: string | null): number {
  const scoped = scopeToSection(items, sectionKey)
  return scoped.filter((item) => item.status === 'pending').length
}

export const OVERLOAD_THRESHOLD = 15

/** Get Top 5 high-priority items for summary mode (adversarial + score-warning pending) */
export function getSummaryItems(items: AnnotationRecord[], sopPhase: string): AnnotationRecord[] {
  const highPriority = items.filter(
    (item) =>
      item.status === 'pending' && (item.type === 'adversarial' || item.type === 'score-warning')
  )
  const sorted = sortAnnotations(highPriority, {
    sopPhase: sopPhase as Parameters<typeof sortAnnotations>[1]['sopPhase'],
  })
  return sorted.slice(0, 5)
}
