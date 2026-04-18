import { describe, it, expect } from 'vitest'
import {
  buildChapterTree,
  deriveSectionPath,
  isStableSectionId,
  normalizeSiblingOrder,
  resolveLocatorFromSectionId,
  resolveSectionIdFromLocator,
} from '@shared/chapter-identity'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

function entry(
  overrides: Partial<ProposalSectionIndexEntry> & {
    sectionId: string
    title: string
    level: 1 | 2 | 3 | 4
    order: number
  }
): ProposalSectionIndexEntry {
  const { sectionId, title, level, order, parentSectionId, occurrenceIndex, ...rest } = overrides
  return {
    sectionId,
    title,
    level,
    order,
    parentSectionId,
    occurrenceIndex: occurrenceIndex ?? 0,
    headingLocator: {
      title,
      level,
      occurrenceIndex: occurrenceIndex ?? 0,
    },
    ...rest,
  }
}

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'
const UUID_D = '44444444-4444-4444-8444-444444444444'
const UUID_E = '55555555-5555-4555-8555-555555555555'

describe('chapter-identity @story-11-1', () => {
  describe('isStableSectionId', () => {
    it('accepts UUID v4 strings', () => {
      expect(isStableSectionId(UUID_A)).toBe(true)
      expect(isStableSectionId(UUID_B.toUpperCase())).toBe(true)
    })

    it('rejects template keys, locator keys, and hash fallbacks', () => {
      expect(isStableSectionId('s1.1')).toBe(false)
      expect(isStableSectionId('2:公司简介:0')).toBe(false)
      expect(isStableSectionId('heading-2-abcdef0123')).toBe(false)
      expect(isStableSectionId(undefined)).toBe(false)
      expect(isStableSectionId('')).toBe(false)
    })
  })

  describe('buildChapterTree', () => {
    it('nests children by parentSectionId and sorts by order', () => {
      const index: ProposalSectionIndexEntry[] = [
        entry({ sectionId: UUID_A, title: '第二章', level: 1, order: 1 }),
        entry({ sectionId: UUID_B, title: '第一章', level: 1, order: 0 }),
        entry({
          sectionId: UUID_C,
          title: '背景',
          level: 2,
          order: 0,
          parentSectionId: UUID_B,
          occurrenceIndex: 0,
        }),
        entry({
          sectionId: UUID_D,
          title: '范围',
          level: 2,
          order: 1,
          parentSectionId: UUID_B,
        }),
      ]

      const tree = buildChapterTree(index)

      expect(tree).toHaveLength(2)
      expect(tree[0].sectionId).toBe(UUID_B)
      expect(tree[0].title).toBe('第一章')
      expect(tree[0].children).toHaveLength(2)
      expect(tree[0].children[0].title).toBe('背景')
      expect(tree[0].children[1].title).toBe('范围')
      expect(tree[1].sectionId).toBe(UUID_A)
    })

    it('treats entries with missing parents as top-level (orphan recovery)', () => {
      const index: ProposalSectionIndexEntry[] = [
        entry({
          sectionId: UUID_A,
          title: '孤儿章节',
          level: 2,
          order: 0,
          parentSectionId: 'does-not-exist',
        }),
      ]
      const tree = buildChapterTree(index)
      expect(tree).toHaveLength(1)
      expect(tree[0].title).toBe('孤儿章节')
    })

    it('handles duplicate titles by sectionId uniqueness', () => {
      const index: ProposalSectionIndexEntry[] = [
        entry({ sectionId: UUID_A, title: '概述', level: 2, order: 0, occurrenceIndex: 0 }),
        entry({ sectionId: UUID_B, title: '概述', level: 2, order: 1, occurrenceIndex: 1 }),
      ]
      const tree = buildChapterTree(index)
      expect(tree).toHaveLength(2)
      expect(tree[0].occurrenceIndex).toBe(0)
      expect(tree[1].occurrenceIndex).toBe(1)
    })
  })

  describe('deriveSectionPath', () => {
    const index: ProposalSectionIndexEntry[] = [
      entry({ sectionId: UUID_A, title: '第一章', level: 1, order: 0 }),
      entry({ sectionId: UUID_B, title: '第二章', level: 1, order: 1 }),
      entry({
        sectionId: UUID_C,
        title: '背景',
        level: 2,
        order: 0,
        parentSectionId: UUID_A,
      }),
      entry({
        sectionId: UUID_D,
        title: '目标',
        level: 2,
        order: 1,
        parentSectionId: UUID_A,
      }),
      entry({
        sectionId: UUID_E,
        title: '关键措施',
        level: 3,
        order: 0,
        parentSectionId: UUID_D,
      }),
    ]

    it('derives 1-based sibling path', () => {
      expect(deriveSectionPath(index, UUID_A)).toBe('1')
      expect(deriveSectionPath(index, UUID_B)).toBe('2')
      expect(deriveSectionPath(index, UUID_C)).toBe('1.1')
      expect(deriveSectionPath(index, UUID_D)).toBe('1.2')
      expect(deriveSectionPath(index, UUID_E)).toBe('1.2.1')
    })

    it('returns null for unknown sectionIds', () => {
      expect(deriveSectionPath(index, 'not-present')).toBeNull()
    })
  })

  describe('resolveSectionIdFromLocator', () => {
    const index: ProposalSectionIndexEntry[] = [
      entry({ sectionId: UUID_A, title: '概述', level: 2, order: 0, occurrenceIndex: 0 }),
      entry({ sectionId: UUID_B, title: '概述', level: 2, order: 1, occurrenceIndex: 1 }),
    ]

    it('matches on (title, level, occurrenceIndex) tuple', () => {
      expect(
        resolveSectionIdFromLocator(index, { title: '概述', level: 2, occurrenceIndex: 0 })
      ).toBe(UUID_A)
      expect(
        resolveSectionIdFromLocator(index, { title: '概述', level: 2, occurrenceIndex: 1 })
      ).toBe(UUID_B)
    })

    it('returns undefined when locator has no match', () => {
      expect(
        resolveSectionIdFromLocator(index, { title: '概述', level: 2, occurrenceIndex: 2 })
      ).toBeUndefined()
    })
  })

  describe('resolveLocatorFromSectionId', () => {
    const index: ProposalSectionIndexEntry[] = [
      entry({ sectionId: UUID_A, title: '背景', level: 2, order: 0, occurrenceIndex: 0 }),
    ]

    it('returns stored headingLocator', () => {
      const locator = resolveLocatorFromSectionId(index, UUID_A)
      expect(locator).toEqual({ title: '背景', level: 2, occurrenceIndex: 0 })
    })

    it('returns undefined for unknown sectionId', () => {
      expect(resolveLocatorFromSectionId(index, 'nope')).toBeUndefined()
    })
  })

  describe('normalizeSiblingOrder', () => {
    it('renumbers order within each parent group starting at 0', () => {
      const index: ProposalSectionIndexEntry[] = [
        entry({ sectionId: UUID_A, title: 'root-a', level: 1, order: 5 }),
        entry({ sectionId: UUID_B, title: 'root-b', level: 1, order: 9 }),
        entry({
          sectionId: UUID_C,
          title: 'child-1',
          level: 2,
          order: 2,
          parentSectionId: UUID_A,
        }),
        entry({
          sectionId: UUID_D,
          title: 'child-2',
          level: 2,
          order: 4,
          parentSectionId: UUID_A,
        }),
      ]
      const normalized = normalizeSiblingOrder(index)
      const byId = new Map(normalized.map((e) => [e.sectionId, e]))
      expect(byId.get(UUID_A)!.order).toBe(0)
      expect(byId.get(UUID_B)!.order).toBe(1)
      expect(byId.get(UUID_C)!.order).toBe(0)
      expect(byId.get(UUID_D)!.order).toBe(1)
    })
  })
})
