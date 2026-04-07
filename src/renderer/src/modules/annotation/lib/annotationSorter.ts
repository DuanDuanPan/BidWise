import type { AnnotationRecord, AnnotationType } from '@shared/annotation-types'

/** Active stage keys excluding 'not-started' */
type ActiveStageKey =
  | 'requirements-analysis'
  | 'solution-design'
  | 'proposal-writing'
  | 'cost-estimation'
  | 'review'
  | 'delivery'

/** Default type weights when no phase-specific mapping exists */
const DEFAULT_WEIGHTS: Partial<Record<AnnotationType, number>> = {
  'ai-suggestion': 6,
  'asset-recommendation': 4,
  'score-warning': 6,
  adversarial: 6,
  human: 5,
  'cross-role': 5,
}

/** Phase → annotation-type → sort weight mapping */
const PHASE_TYPE_WEIGHTS: Record<string, Partial<Record<AnnotationType, number>>> = {
  'proposal-writing': {
    'ai-suggestion': 10,
    'asset-recommendation': 8,
    'score-warning': 6,
    adversarial: 4,
    human: 5,
    'cross-role': 5,
  },
  review: {
    adversarial: 10,
    'score-warning': 8,
    human: 6,
    'cross-role': 6,
    'ai-suggestion': 4,
    'asset-recommendation': 2,
  },
}

export interface SortContext {
  sopPhase: ActiveStageKey
}

/**
 * Sorts annotations by context-aware priority.
 * Priority: ① pending > non-pending ② SOP phase type weight ③ createdAt DESC
 * Returns a new sorted array (does not mutate input).
 */
export function sortAnnotations(
  items: AnnotationRecord[],
  context: SortContext
): AnnotationRecord[] {
  const weights = PHASE_TYPE_WEIGHTS[context.sopPhase] ?? DEFAULT_WEIGHTS

  return [...items].sort((a, b) => {
    // 1. pending first
    const pendingA = a.status === 'pending' ? 1 : 0
    const pendingB = b.status === 'pending' ? 1 : 0
    if (pendingA !== pendingB) return pendingB - pendingA

    // 2. type weight (higher weight = higher priority)
    const wA = weights[a.type] ?? 0
    const wB = weights[b.type] ?? 0
    if (wA !== wB) return wB - wA

    // 3. createdAt DESC (newer first)
    return b.createdAt.localeCompare(a.createdAt)
  })
}
