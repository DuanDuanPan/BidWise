import { describe, it, expect } from 'vitest'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import {
  collectSubtreeKeys,
  findTreeNode,
  sectionIndexToTreeNodes,
} from '@modules/structure-design/adapters/persistedAdapter'

const UUID = {
  A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  C: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
}

function entry(overrides: Partial<ProposalSectionIndexEntry>): ProposalSectionIndexEntry {
  return {
    sectionId: 'x',
    title: 't',
    level: 1,
    order: 0,
    occurrenceIndex: 0,
    headingLocator: { title: 't', level: 1, occurrenceIndex: 0 },
    ...overrides,
  } as ProposalSectionIndexEntry
}

describe('@story-11-9 persistedAdapter', () => {
  it('builds tree from flat sectionIndex with nodeKey = sectionId', () => {
    const flat = [
      entry({ sectionId: UUID.A, title: '综述', level: 1, order: 0 }),
      entry({
        sectionId: UUID.B,
        title: '背景',
        level: 2,
        order: 0,
        parentSectionId: UUID.A,
      }),
    ]
    const tree = sectionIndexToTreeNodes(flat)
    expect(tree).toHaveLength(1)
    expect(tree[0].key).toBe(UUID.A)
    expect(tree[0].children[0].key).toBe(UUID.B)
  })

  it('collectSubtreeKeys walks self + descendants', () => {
    const tree = sectionIndexToTreeNodes([
      entry({ sectionId: UUID.A, title: 'A', level: 1, order: 0 }),
      entry({
        sectionId: UUID.B,
        title: 'B',
        level: 2,
        order: 0,
        parentSectionId: UUID.A,
      }),
      entry({
        sectionId: UUID.C,
        title: 'C',
        level: 3,
        order: 0,
        parentSectionId: UUID.B,
      }),
    ])
    expect(collectSubtreeKeys(tree[0])).toEqual([UUID.A, UUID.B, UUID.C])
  })

  it('findTreeNode locates deeply nested nodes', () => {
    const tree = sectionIndexToTreeNodes([
      entry({ sectionId: UUID.A, title: 'A', level: 1, order: 0 }),
      entry({
        sectionId: UUID.B,
        title: 'B',
        level: 2,
        order: 0,
        parentSectionId: UUID.A,
      }),
    ])
    expect(findTreeNode(tree, UUID.B)?.title).toBe('B')
    expect(findTreeNode(tree, 'missing')).toBeNull()
  })

  it('returns empty tree for empty input', () => {
    expect(sectionIndexToTreeNodes([])).toEqual([])
  })

  it('forwards isKeyFocus so the shared footer key-chapter count stays honest', () => {
    // Regression: pre-fix `chapterNodeToTreeNode` dropped isKeyFocus, so
    // countTreeNodes in persisted mode always returned keyFocus=0 even when
    // sectionIndex flagged multiple chapters. Spec 11-9 AC7 requires the
    // shared action bar stat to match source data in both modes.
    const flat = [
      entry({ sectionId: UUID.A, title: 'A', level: 1, order: 0, isKeyFocus: true }),
      entry({ sectionId: UUID.B, title: 'B', level: 1, order: 1, isKeyFocus: false }),
      entry({ sectionId: UUID.C, title: 'C', level: 1, order: 2, isKeyFocus: true }),
    ]
    const tree = sectionIndexToTreeNodes(flat)
    expect(tree.map((n) => n.isKeyFocus)).toEqual([true, false, true])
  })
})
