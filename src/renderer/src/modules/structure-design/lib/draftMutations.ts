import type {
  StructureTreeNode,
  StructureTreeViewPlacement,
} from '../components/StructureTreeView.types'
import { generateDraftKey } from '../adapters/skeletonAdapter'

/**
 * Draft-mode pure mutations. Every function returns a fresh tree — the public
 * component calls `onUpdate(next)` after these so the host owns authoritative
 * state. No IPC, no store mutation.
 */

function cloneTree(nodes: StructureTreeNode[]): StructureTreeNode[] {
  return nodes.map((n) => ({
    ...n,
    children: cloneTree(n.children),
  }))
}

function findParent(
  nodes: StructureTreeNode[],
  targetKey: string
): {
  container: StructureTreeNode[]
  index: number
  parent: StructureTreeNode | null
} | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].key === targetKey) return { container: nodes, index: i, parent: null }
    const child = findParentInSubtree(nodes[i], targetKey)
    if (child) return child
  }
  return null
}

function findParentInSubtree(
  parent: StructureTreeNode,
  targetKey: string
): {
  container: StructureTreeNode[]
  index: number
  parent: StructureTreeNode
} | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].key === targetKey) {
      return { container: parent.children, index: i, parent }
    }
    const deeper = findParentInSubtree(parent.children[i], targetKey)
    if (deeper) return deeper
  }
  return null
}

function findNode(nodes: StructureTreeNode[], key: string): StructureTreeNode | null {
  for (const n of nodes) {
    if (n.key === key) return n
    const found = findNode(n.children, key)
    if (found) return found
  }
  return null
}

function maxChildDepth(node: StructureTreeNode): number {
  if (node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map(maxChildDepth))
}

function depthOfNode(nodes: StructureTreeNode[], key: string): number {
  const find = (tree: StructureTreeNode[], depth: number): number => {
    for (const node of tree) {
      if (node.key === key) return depth
      const r = find(node.children, depth + 1)
      if (r >= 0) return r
    }
    return -1
  }
  return find(nodes, 1)
}

function retypeLevels(node: StructureTreeNode, parentLevel: number): void {
  node.level = parentLevel as StructureTreeNode['level']
  for (const child of node.children) {
    retypeLevels(child, parentLevel + 1)
  }
}

export interface DraftMutationResult {
  nextNodes: StructureTreeNode[]
  /** Newly created node key (for add* operations) so callers can autofocus. */
  createdKey?: string
}

export function addSibling(
  nodes: StructureTreeNode[],
  targetKey: string,
  maxDepth: number
): DraftMutationResult | null {
  const cloned = cloneTree(nodes)
  const loc = findParent(cloned, targetKey)
  if (!loc) return null
  const level = loc.parent ? ((loc.parent.level + 1) as StructureTreeNode['level']) : 1
  const newKey = generateDraftKey()
  const newNode: StructureTreeNode = {
    key: newKey,
    title: '新章节',
    level: level as StructureTreeNode['level'],
    isKeyFocus: false,
    children: [],
  }
  if (level > maxDepth) return null
  loc.container.splice(loc.index + 1, 0, newNode)
  return { nextNodes: cloned, createdKey: newKey }
}

export function addChild(
  nodes: StructureTreeNode[],
  targetKey: string,
  maxDepth: number
): DraftMutationResult | null {
  const cloned = cloneTree(nodes)
  const node = findNode(cloned, targetKey)
  if (!node || node.level >= maxDepth) return null
  const newKey = generateDraftKey()
  const newNode: StructureTreeNode = {
    key: newKey,
    title: '新章节',
    level: (node.level + 1) as StructureTreeNode['level'],
    isKeyFocus: false,
    children: [],
  }
  node.children.push(newNode)
  return { nextNodes: cloned, createdKey: newKey }
}

export function deleteNode(
  nodes: StructureTreeNode[],
  targetKey: string
): DraftMutationResult | null {
  const cloned = cloneTree(nodes)
  const loc = findParent(cloned, targetKey)
  if (!loc) return null
  loc.container.splice(loc.index, 1)
  return { nextNodes: cloned }
}

export function renameNode(
  nodes: StructureTreeNode[],
  targetKey: string,
  nextTitle: string
): DraftMutationResult | null {
  const cloned = cloneTree(nodes)
  const node = findNode(cloned, targetKey)
  if (!node) return null
  node.title = nextTitle
  return { nextNodes: cloned }
}

export interface DraftDropInfo {
  dragKey: string
  dropKey: string
  placement: StructureTreeViewPlacement
}

export function allowDraftDrop(
  nodes: StructureTreeNode[],
  info: { dragKey: string; dropKey: string; placement: StructureTreeViewPlacement },
  maxDepth: number
): boolean {
  const drag = findNode(nodes, info.dragKey)
  if (!drag) return false
  const dragDepth = maxChildDepth(drag)
  const dropDepth = depthOfNode(nodes, info.dropKey)
  if (dropDepth < 0) return false
  // Cycle check.
  if (findNode(drag.children, info.dropKey) || info.dragKey === info.dropKey) return false
  if (info.placement === 'inside') {
    return dropDepth + 1 + dragDepth <= maxDepth
  }
  return dropDepth + dragDepth <= maxDepth
}

export function moveDraftSubtree(
  nodes: StructureTreeNode[],
  info: { dragKey: string; dropKey: string; placement: StructureTreeViewPlacement },
  maxDepth: number
): DraftMutationResult | null {
  if (!allowDraftDrop(nodes, info, maxDepth)) return null
  const cloned = cloneTree(nodes)
  const dragLoc = findParent(cloned, info.dragKey)
  if (!dragLoc) return null
  const [dragNode] = dragLoc.container.splice(dragLoc.index, 1)

  if (info.placement === 'inside') {
    const dropNode = findNode(cloned, info.dropKey)
    if (!dropNode) return null
    retypeLevels(dragNode, dropNode.level + 1)
    dropNode.children.push(dragNode)
  } else {
    const dropLoc = findParent(cloned, info.dropKey)
    if (!dropLoc) return null
    const parentLevel = dropLoc.parent ? dropLoc.parent.level : 0
    retypeLevels(dragNode, parentLevel + 1)
    const insertAt = info.placement === 'before' ? dropLoc.index : dropLoc.index + 1
    dropLoc.container.splice(insertAt, 0, dragNode)
  }
  return { nextNodes: cloned }
}
