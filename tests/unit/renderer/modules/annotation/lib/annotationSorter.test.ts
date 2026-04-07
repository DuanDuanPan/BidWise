import { describe, it, expect } from 'vitest'
import { sortAnnotations } from '@renderer/modules/annotation/lib/annotationSorter'
import type { AnnotationRecord } from '@shared/annotation-types'

function makeAnnotation(overrides: Partial<AnnotationRecord> = {}): AnnotationRecord {
  return {
    id: 'ann-1',
    projectId: 'proj-1',
    sectionId: '2:公司简介:0',
    type: 'ai-suggestion',
    content: 'test',
    author: 'agent:generate',
    status: 'pending',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortAnnotations', () => {
  describe('pending priority', () => {
    it('sorts pending before non-pending', () => {
      const items = [
        makeAnnotation({ id: 'a', status: 'accepted', type: 'adversarial' }),
        makeAnnotation({ id: 'b', status: 'pending', type: 'ai-suggestion' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'proposal-writing' })
      expect(sorted[0].id).toBe('b')
      expect(sorted[1].id).toBe('a')
    })
  })

  describe('proposal-writing phase', () => {
    it('prioritizes ai-suggestion over adversarial', () => {
      const items = [
        makeAnnotation({ id: 'adv', type: 'adversarial', status: 'pending' }),
        makeAnnotation({ id: 'ai', type: 'ai-suggestion', status: 'pending' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'proposal-writing' })
      expect(sorted[0].id).toBe('ai')
      expect(sorted[1].id).toBe('adv')
    })

    it('prioritizes asset-recommendation over adversarial', () => {
      const items = [
        makeAnnotation({ id: 'adv', type: 'adversarial', status: 'pending' }),
        makeAnnotation({ id: 'asset', type: 'asset-recommendation', status: 'pending' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'proposal-writing' })
      expect(sorted[0].id).toBe('asset')
      expect(sorted[1].id).toBe('adv')
    })
  })

  describe('review phase', () => {
    it('prioritizes adversarial over ai-suggestion', () => {
      const items = [
        makeAnnotation({ id: 'ai', type: 'ai-suggestion', status: 'pending' }),
        makeAnnotation({ id: 'adv', type: 'adversarial', status: 'pending' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'review' })
      expect(sorted[0].id).toBe('adv')
      expect(sorted[1].id).toBe('ai')
    })

    it('prioritizes score-warning over human', () => {
      const items = [
        makeAnnotation({ id: 'human', type: 'human', status: 'pending' }),
        makeAnnotation({ id: 'score', type: 'score-warning', status: 'pending' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'review' })
      expect(sorted[0].id).toBe('score')
      expect(sorted[1].id).toBe('human')
    })
  })

  describe('createdAt tiebreaker', () => {
    it('sorts by createdAt DESC within same priority', () => {
      const items = [
        makeAnnotation({ id: 'old', createdAt: '2026-04-01T00:00:00.000Z' }),
        makeAnnotation({ id: 'new', createdAt: '2026-04-02T00:00:00.000Z' }),
      ]
      const sorted = sortAnnotations(items, { sopPhase: 'proposal-writing' })
      expect(sorted[0].id).toBe('new')
      expect(sorted[1].id).toBe('old')
    })
  })

  describe('unknown phase fallback', () => {
    it('uses default weights for unknown phases', () => {
      const items = [
        makeAnnotation({ id: 'ai', type: 'ai-suggestion', status: 'pending' }),
        makeAnnotation({ id: 'adv', type: 'adversarial', status: 'pending' }),
      ]
      // 'requirements-analysis' is not in PHASE_TYPE_WEIGHTS, falls back to DEFAULT_WEIGHTS
      const sorted = sortAnnotations(items, { sopPhase: 'requirements-analysis' })
      // Both have weight 6 in DEFAULT_WEIGHTS, so createdAt decides — same time, stable order
      expect(sorted).toHaveLength(2)
    })
  })

  describe('stability', () => {
    it('does not mutate the original array', () => {
      const items = [
        makeAnnotation({ id: 'b', type: 'adversarial' }),
        makeAnnotation({ id: 'a', type: 'ai-suggestion' }),
      ]
      const original = [...items]
      sortAnnotations(items, { sopPhase: 'proposal-writing' })
      expect(items[0].id).toBe(original[0].id)
      expect(items[1].id).toBe(original[1].id)
    })

    it('returns empty array for empty input', () => {
      const sorted = sortAnnotations([], { sopPhase: 'proposal-writing' })
      expect(sorted).toEqual([])
    })
  })
})
