/**
 * Heading tree distance (Story 3.12).
 *
 * Given an ordered heading list extracted from a markdown document, compute
 * the LCA-based hop distance and the relation type between two headings.
 *
 * Tree inference rule: ancestors of a heading at line index L are the running
 * stack of preceding headings with strictly smaller level (closer to H1 = fewer
 * '#' signs). We include the heading itself as the deepest element of its path.
 */
import type { MarkdownHeadingInfo } from '@shared/chapter-markdown'

export type HeadingRelation = 'ancestor' | 'sibling' | 'descendant' | 'other'

export interface HeadingDistanceResult {
  distance: number
  relation: HeadingRelation
}

/** Return the ancestor chain (from root down to, and including, heading). */
export function ancestorChainFromRoot(
  headings: MarkdownHeadingInfo[],
  heading: MarkdownHeadingInfo
): MarkdownHeadingInfo[] {
  const stack: MarkdownHeadingInfo[] = []
  for (const candidate of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= candidate.level) {
      stack.pop()
    }
    stack.push(candidate)
    if (candidate.lineIndex === heading.lineIndex) {
      return [...stack]
    }
  }
  return [heading]
}

function lastCommonPrefix(
  a: MarkdownHeadingInfo[],
  b: MarkdownHeadingInfo[]
): MarkdownHeadingInfo[] {
  const out: MarkdownHeadingInfo[] = []
  const min = Math.min(a.length, b.length)
  for (let i = 0; i < min; i++) {
    if (a[i].lineIndex === b[i].lineIndex) {
      out.push(a[i])
    } else {
      break
    }
  }
  return out
}

/**
 * Compute tree distance (LCA hops) + relation type between `from` (the
 * current chapter) and `to` (a candidate).
 */
export function headingTreeDistance(
  headings: MarkdownHeadingInfo[],
  from: MarkdownHeadingInfo,
  to: MarkdownHeadingInfo
): HeadingDistanceResult {
  const fromPath = ancestorChainFromRoot(headings, from)
  const toPath = ancestorChainFromRoot(headings, to)
  const lca = lastCommonPrefix(fromPath, toPath)

  const distance = fromPath.length - lca.length + (toPath.length - lca.length)

  let relation: HeadingRelation
  if (from.lineIndex === to.lineIndex) {
    relation = 'other'
  } else if (lca.length === toPath.length) {
    relation = 'ancestor'
  } else if (lca.length === fromPath.length) {
    relation = 'descendant'
  } else if (from.level === to.level && lca.length === fromPath.length - 1) {
    relation = 'sibling'
  } else {
    relation = 'other'
  }

  return { distance, relation }
}
