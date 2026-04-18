/**
 * Chapter identity helpers — read-side derivation between the canonical
 * `ProposalSectionIndexEntry[]` UUID model and the runtime locator/path view.
 *
 * Story 11.1.
 *
 * `proposal.meta.json.sectionIndex` is the source of truth for project-level
 * chapter structure. These helpers exist so renderer (`useCurrentSection`,
 * `OutlineHeadingElement`) and main services (`chapter-generation-service`,
 * `chapter-structure-service`, `traceability-matrix-service`) can keep
 * consuming locator / path views without persisting them.
 */

import type { ChapterHeadingLocator, ChapterTreeNode, StableSectionId } from './chapter-types'
import type { ProposalSectionIndexEntry } from './template-types'

/** UUID v4 regex — used to distinguish UUID `sectionId` from legacy keys. */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isStableSectionId(
  candidate: string | undefined | null
): candidate is StableSectionId {
  return typeof candidate === 'string' && UUID_V4_RE.test(candidate)
}

/**
 * Build an in-memory tree from the flat sectionIndex. Entries are sorted by
 * `order` within each parent group — callers must not rely on input order.
 *
 * Orphan entries (missing parent) are treated as top-level so pathological
 * migrated projects still render instead of dropping chapters silently.
 */
export function buildChapterTree(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>
): ChapterTreeNode[] {
  const byId = new Map<string, ChapterTreeNode>()
  const nodes: ChapterTreeNode[] = sectionIndex.map((entry) => {
    const node: ChapterTreeNode = { ...entry, children: [] }
    byId.set(entry.sectionId, node)
    return node
  })

  const roots: ChapterTreeNode[] = []
  for (const node of nodes) {
    const parentId = node.parentSectionId
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortByOrder = (a: ChapterTreeNode, b: ChapterTreeNode): number => a.order - b.order
  roots.sort(sortByOrder)
  for (const node of nodes) {
    node.children.sort(sortByOrder)
  }
  return roots
}

/**
 * Derive the human-facing section path ("2.1.3") for a `sectionId`. Returns
 * `null` when the id is not present in the index.
 *
 * Numbering follows sibling ordering within each parent, starting at 1.
 */
export function deriveSectionPath(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>,
  sectionId: StableSectionId
): string | null {
  const roots = buildChapterTree(sectionIndex)
  const path: number[] = []

  function walk(nodes: ChapterTreeNode[]): boolean {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      path.push(i + 1)
      if (node.sectionId === sectionId) return true
      if (walk(node.children)) return true
      path.pop()
    }
    return false
  }

  return walk(roots) ? path.join('.') : null
}

/**
 * Resolve a UUID `sectionId` from a locator. Matches on
 * `(title, level, occurrenceIndex)`.
 */
export function resolveSectionIdFromLocator(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>,
  locator: ChapterHeadingLocator
): StableSectionId | undefined {
  const entry = sectionIndex.find(
    (s) =>
      s.headingLocator.title === locator.title &&
      s.headingLocator.level === locator.level &&
      s.headingLocator.occurrenceIndex === locator.occurrenceIndex
  )
  return entry?.sectionId
}

/**
 * Resolve the runtime `ChapterHeadingLocator` for a `sectionId`. Prefers the
 * stored `headingLocator`; when `markdown` is provided, callers can optionally
 * verify it still points to a live heading by calling
 * `findMarkdownHeading(extractMarkdownHeadings(markdown), locator)`.
 *
 * `markdown` is declared in the signature so downstream callers can pass it
 * without plumbing a separate verifier — no actual scan is performed here to
 * keep this helper pure and cheap.
 */
export function resolveLocatorFromSectionId(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>,
  sectionId: StableSectionId,
  _markdown?: string
): ChapterHeadingLocator | undefined {
  const entry = sectionIndex.find((s) => s.sectionId === sectionId)
  return entry?.headingLocator
}

/**
 * Return a copy of sectionIndex with `order` renumbered contiguously within
 * each parent group (0..n-1) while preserving relative order. Used by
 * structure-edit operations (Story 11.2+) to keep sibling order stable after
 * insert / move / delete.
 */
export function normalizeSiblingOrder(
  sectionIndex: ReadonlyArray<ProposalSectionIndexEntry>
): ProposalSectionIndexEntry[] {
  const grouped = new Map<string | undefined, ProposalSectionIndexEntry[]>()
  for (const entry of sectionIndex) {
    const key = entry.parentSectionId
    const bucket = grouped.get(key) ?? []
    bucket.push(entry)
    grouped.set(key, bucket)
  }
  const result: ProposalSectionIndexEntry[] = []
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.order - b.order)
    bucket.forEach((entry, i) => {
      result.push({ ...entry, order: i })
    })
  }
  // Preserve original flattened order by sectionId to stay deterministic for callers.
  const indexOf = new Map(sectionIndex.map((e, i) => [e.sectionId, i]))
  result.sort((a, b) => (indexOf.get(a.sectionId) ?? 0) - (indexOf.get(b.sectionId) ?? 0))
  return result
}
