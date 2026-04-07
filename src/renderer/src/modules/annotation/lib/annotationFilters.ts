import type { AnnotationRecord, AnnotationType, AnnotationStatus } from '@shared/annotation-types'

/** 5 color groups (purple combines human + cross-role) */
export type AnnotationFilterGroup =
  | 'ai-suggestion'
  | 'asset-recommendation'
  | 'score-warning'
  | 'adversarial'
  | 'human-crossrole'

export type StatusFilter = 'pending' | 'processed' | 'needs-decision'

/** Maps each AnnotationType to its filter group */
export function typeToGroup(type: AnnotationType): AnnotationFilterGroup {
  if (type === 'human' || type === 'cross-role') return 'human-crossrole'
  return type as AnnotationFilterGroup
}

/** Maps each AnnotationStatus to the status filter tab */
function statusMatchesFilter(status: AnnotationStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case 'pending':
      return status === 'pending'
    case 'processed':
      return status === 'accepted' || status === 'rejected'
    case 'needs-decision':
      return status === 'needs-decision'
  }
}

export function filterAnnotations(
  items: AnnotationRecord[],
  typeFilter: Set<AnnotationFilterGroup>,
  statusFilter: StatusFilter
): AnnotationRecord[] {
  return items.filter(
    (item) =>
      typeFilter.has(typeToGroup(item.type)) && statusMatchesFilter(item.status, statusFilter)
  )
}

export function countByStatus(
  items: AnnotationRecord[],
  typeFilter: Set<AnnotationFilterGroup>
): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { pending: 0, processed: 0, 'needs-decision': 0 }
  for (const item of items) {
    if (!typeFilter.has(typeToGroup(item.type))) continue
    if (item.status === 'pending') counts.pending++
    else if (item.status === 'accepted' || item.status === 'rejected') counts.processed++
    else if (item.status === 'needs-decision') counts['needs-decision']++
  }
  return counts
}
