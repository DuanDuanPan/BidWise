import { describe, it, expect } from 'vitest'
import type { AnnotationType, AnnotationStatus } from '@shared/annotation-types'
import {
  ANNOTATION_TYPE_COLORS,
  ANNOTATION_TYPE_LABELS,
  ANNOTATION_TYPE_ICONS,
  ANNOTATION_TYPE_ACTIONS,
  ANNOTATION_STATUS_LABELS,
  ANNOTATION_STATUS_COLORS,
} from '@renderer/modules/annotation/constants/annotation-colors'

const ALL_TYPES: AnnotationType[] = [
  'ai-suggestion',
  'asset-recommendation',
  'score-warning',
  'adversarial',
  'human',
  'cross-role',
]

const PROCESSED_STATUSES: Exclude<AnnotationStatus, 'pending'>[] = [
  'accepted',
  'rejected',
  'needs-decision',
]

describe('@story-4-2 annotation-colors constants', () => {
  describe('ANNOTATION_TYPE_COLORS', () => {
    it('has a hex color for every AnnotationType', () => {
      for (const type of ALL_TYPES) {
        expect(ANNOTATION_TYPE_COLORS[type]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('uses exact hex values from UX-DR9', () => {
      expect(ANNOTATION_TYPE_COLORS['ai-suggestion']).toBe('#1677FF')
      expect(ANNOTATION_TYPE_COLORS['asset-recommendation']).toBe('#52C41A')
      expect(ANNOTATION_TYPE_COLORS['score-warning']).toBe('#FAAD14')
      expect(ANNOTATION_TYPE_COLORS['adversarial']).toBe('#FF4D4F')
      expect(ANNOTATION_TYPE_COLORS['human']).toBe('#722ED1')
    })

    it('cross-role shares purple with human', () => {
      expect(ANNOTATION_TYPE_COLORS['cross-role']).toBe(ANNOTATION_TYPE_COLORS['human'])
      expect(ANNOTATION_TYPE_COLORS['cross-role']).toBe('#722ED1')
    })
  })

  describe('ANNOTATION_TYPE_LABELS', () => {
    it('has a Chinese label for every AnnotationType', () => {
      for (const type of ALL_TYPES) {
        expect(ANNOTATION_TYPE_LABELS[type]).toBeTruthy()
        expect(typeof ANNOTATION_TYPE_LABELS[type]).toBe('string')
      }
    })

    it('cross-role label is distinct from human', () => {
      expect(ANNOTATION_TYPE_LABELS['cross-role']).not.toBe(ANNOTATION_TYPE_LABELS['human'])
    })
  })

  describe('ANNOTATION_TYPE_ICONS', () => {
    it('has an icon component for every AnnotationType', () => {
      for (const type of ALL_TYPES) {
        expect(typeof ANNOTATION_TYPE_ICONS[type]).toBe('function')
      }
    })

    it('cross-role reuses human icon', () => {
      expect(ANNOTATION_TYPE_ICONS['cross-role']).toBe(ANNOTATION_TYPE_ICONS['human'])
    })
  })

  describe('ANNOTATION_TYPE_ACTIONS', () => {
    it('has actions defined for every AnnotationType', () => {
      for (const type of ALL_TYPES) {
        expect(ANNOTATION_TYPE_ACTIONS[type].length).toBeGreaterThan(0)
      }
    })

    it('every type has exactly one primary action', () => {
      for (const type of ALL_TYPES) {
        const primaries = ANNOTATION_TYPE_ACTIONS[type].filter((a) => a.primary)
        expect(primaries).toHaveLength(1)
      }
    })

    it('primary actions always have targetStatus', () => {
      for (const type of ALL_TYPES) {
        const primary = ANNOTATION_TYPE_ACTIONS[type].find((a) => a.primary)
        expect(primary?.targetStatus).toBeTruthy()
      }
    })

    it('ai-suggestion has accept/reject/edit', () => {
      const keys = ANNOTATION_TYPE_ACTIONS['ai-suggestion'].map((a) => a.key)
      expect(keys).toEqual(['accept', 'reject', 'edit'])
    })

    it('asset-recommendation has insert/ignore/view', () => {
      const keys = ANNOTATION_TYPE_ACTIONS['asset-recommendation'].map((a) => a.key)
      expect(keys).toEqual(['insert', 'ignore', 'view'])
    })

    it('score-warning has handle/defer with no reject action', () => {
      const actions = ANNOTATION_TYPE_ACTIONS['score-warning']
      expect(actions.map((a) => a.key)).toEqual(['handle', 'defer'])
      expect(actions.find((a) => a.targetStatus === 'rejected')).toBeUndefined()
    })

    it('adversarial has accept-edit/refute/request-guidance', () => {
      const keys = ANNOTATION_TYPE_ACTIONS['adversarial'].map((a) => a.key)
      expect(keys).toEqual(['accept-edit', 'refute', 'request-guidance'])
    })

    it('human has mark-handled/reply with mark-handled as primary', () => {
      const actions = ANNOTATION_TYPE_ACTIONS['human']
      expect(actions.map((a) => a.key)).toEqual(['mark-handled', 'reply'])
      expect(actions[0].primary).toBe(true)
      expect(actions[0].targetStatus).toBe('accepted')
    })

    it('cross-role has same actions as human', () => {
      const humanKeys = ANNOTATION_TYPE_ACTIONS['human'].map((a) => a.key)
      const crossRoleKeys = ANNOTATION_TYPE_ACTIONS['cross-role'].map((a) => a.key)
      expect(crossRoleKeys).toEqual(humanKeys)
    })

    it('placeholder actions have no targetStatus', () => {
      const placeholders = ['edit', 'view', 'reply']
      for (const type of ALL_TYPES) {
        for (const action of ANNOTATION_TYPE_ACTIONS[type]) {
          if (placeholders.includes(action.key)) {
            expect(action.targetStatus).toBeUndefined()
          }
        }
      }
    })
  })

  describe('ANNOTATION_STATUS_LABELS', () => {
    it('has labels for all processed statuses', () => {
      for (const status of PROCESSED_STATUSES) {
        expect(ANNOTATION_STATUS_LABELS[status]).toBeTruthy()
      }
    })
  })

  describe('ANNOTATION_STATUS_COLORS', () => {
    it('has hex colors for all processed statuses', () => {
      for (const status of PROCESSED_STATUSES) {
        expect(ANNOTATION_STATUS_COLORS[status]).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('uses correct status colors', () => {
      expect(ANNOTATION_STATUS_COLORS['accepted']).toBe('#52C41A')
      expect(ANNOTATION_STATUS_COLORS['rejected']).toBe('#FF4D4F')
      expect(ANNOTATION_STATUS_COLORS['needs-decision']).toBe('#FAAD14')
    })
  })
})
