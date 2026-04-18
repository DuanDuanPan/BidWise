import { buildChapterTree } from '@shared/chapter-identity'
import type { ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import type { StructureTreeNode } from '../components/StructureTreeView.types'

/**
 * Pure adapter from a persisted `sectionIndex` flat list to the public
 * `StructureTreeNode[]` contract. The node `key` is the sectionId (UUID) —
 * hosts that need the five-state visual, keymap, or DnD should use this key
 * directly when calling `stateOf` / `onMove` / `onDelete` etc.
 */
export function sectionIndexToTreeNodes(
  sectionIndex: ProposalSectionIndexEntry[]
): StructureTreeNode[] {
  // `ChapterTreeNode` extends `ChapterIdentityEntry`, which omits `isKeyFocus`
  // — that field lives on the wider `ProposalSectionIndexEntry`. Build a
  // sectionId → entry lookup so the adapter can forward the flag into the
  // public tree without hacking a cross-cutting type widening.
  const byId = new Map(sectionIndex.map((entry) => [entry.sectionId, entry]))
  return buildChapterTree(sectionIndex).map((node) => chapterNodeToTreeNode(node, byId))
}

function chapterNodeToTreeNode(
  node: ChapterTreeNode,
  byId: Map<string, ProposalSectionIndexEntry>
): StructureTreeNode {
  const entry = byId.get(node.sectionId)
  return {
    key: node.sectionId,
    title: node.title,
    level: node.level,
    // Persisted sectionIndex already carries `isKeyFocus` (template-service
    // writes it via `extractSectionIndex`). Forwarding it keeps the shared
    // footer `N 个重点章节` stat honest across both modes.
    isKeyFocus: entry?.isKeyFocus,
    templateSectionKey: node.templateSectionKey,
    children: node.children.map((child) => chapterNodeToTreeNode(child, byId)),
  }
}

/**
 * Collect every sectionId (self + descendants) rooted at a tree node. Persisted
 * delete callbacks receive this so cascade-delete selects the entire subtree in
 * a single store action.
 */
export function collectSubtreeKeys(node: StructureTreeNode): string[] {
  const keys: string[] = []
  const walk = (n: StructureTreeNode): void => {
    keys.push(n.key)
    for (const child of n.children) walk(child)
  }
  walk(node)
  return keys
}

export function findTreeNode(nodes: StructureTreeNode[], key: string): StructureTreeNode | null {
  const stack = [...nodes]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.key === key) return n
    stack.push(...n.children)
  }
  return null
}
