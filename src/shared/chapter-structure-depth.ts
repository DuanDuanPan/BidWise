/**
 * Story 11.3 — derive per-sectionId depth from a flat sectionIndex.
 *
 * `depth` is the parent-chain length counted from a top-level node (depth=1
 * for roots, depth=2 for first-level children, …). Used to drive Story 11.5's
 * 6-layer warn-on-exceed seam.
 *
 * Pure helper — no I/O — so renderer + main can both consume it without an
 * extra service round-trip.
 */
import type { ProposalSectionIndexEntry } from './template-types'

export function computeMaxDepthBySectionId(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>
): Map<string, number> {
  const byId = new Map(sectionIndex.map((e) => [e.sectionId, e]))
  const cache = new Map<string, number>()

  const depthOf = (sectionId: string, seen: Set<string>): number => {
    if (cache.has(sectionId)) return cache.get(sectionId)!
    if (seen.has(sectionId)) return 1
    seen.add(sectionId)
    const entry = byId.get(sectionId)
    if (!entry || !entry.parentSectionId) {
      cache.set(sectionId, 1)
      return 1
    }
    const result = depthOf(entry.parentSectionId, seen) + 1
    cache.set(sectionId, result)
    return result
  }

  for (const entry of sectionIndex) {
    depthOf(entry.sectionId, new Set())
  }
  return cache
}
