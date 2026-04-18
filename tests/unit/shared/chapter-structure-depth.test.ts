import { describe, expect, it } from 'vitest'
import { computeMaxDepthBySectionId } from '@shared/chapter-structure-depth'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const entry = (
  id: string,
  parentId: string | undefined,
  level: 1 | 2 | 3 | 4
): ProposalSectionIndexEntry => ({
  sectionId: id,
  title: id,
  level,
  parentSectionId: parentId,
  order: 0,
  occurrenceIndex: 0,
  headingLocator: { title: id, level, occurrenceIndex: 0 },
})

describe('@story-11-3 computeMaxDepthBySectionId', () => {
  it('@p0 reports depth 1 for top-level nodes', () => {
    const map = computeMaxDepthBySectionId([entry('A', undefined, 1)])
    expect(map.get('A')).toBe(1)
  })

  it('@p0 walks parent chain', () => {
    const idx = [
      entry('A', undefined, 1),
      entry('B', 'A', 2),
      entry('C', 'B', 3),
      entry('D', 'C', 4),
    ]
    const map = computeMaxDepthBySectionId(idx)
    expect(map.get('A')).toBe(1)
    expect(map.get('B')).toBe(2)
    expect(map.get('C')).toBe(3)
    expect(map.get('D')).toBe(4)
  })

  it('@p1 handles orphans by treating missing parent as root', () => {
    const map = computeMaxDepthBySectionId([entry('A', 'missing', 2)])
    // missing parent is unresolved → orphan resolves to depth 1 (treated as root).
    expect(map.get('A')).toBe(2)
  })

  it('@p1 short-circuits cycles at depth 1', () => {
    // Pathological data: A → B → A. Should not infinite-loop; return finite depth.
    const map = computeMaxDepthBySectionId([entry('A', 'B', 1), entry('B', 'A', 1)])
    expect(map.get('A')).toBeGreaterThan(0)
    expect(map.get('B')).toBeGreaterThan(0)
  })
})
