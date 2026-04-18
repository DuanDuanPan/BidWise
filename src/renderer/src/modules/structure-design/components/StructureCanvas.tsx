import { useCallback } from 'react'
import { Empty, Spin } from 'antd'
import type { StructureNode } from '../hooks/useStructureOutline'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import { StructureCanvasNode } from './StructureCanvasNode'

export interface StructureCanvasProps {
  tree: StructureNode[]
  loading?: boolean
  onCommitTitle: (nodeKey: string, title: string) => void | Promise<void>
  onAddChild?: (nodeKey: string) => void
  onOpenMoreMenu?: (nodeKey: string, anchor: HTMLElement) => void
  onUndoPendingDelete?: (nodeKey: string) => void
  /** sectionId → generation phase; enables AC5 idle-state decorators. */
  phaseByNodeKey?: ReadonlyMap<string, ChapterGenerationPhase>
}

function flatten(tree: StructureNode[]): StructureNode[] {
  const flat: StructureNode[] = []
  function walk(nodes: StructureNode[]): void {
    for (const node of nodes) {
      flat.push(node)
      if (node.children.length > 0) walk(node.children)
    }
  }
  walk(tree)
  return flat
}

/**
 * Structure Canvas — host container consumed by Story 11.6 Structure Design
 * Workspace. In Story 11.2 this renders a single flat hierarchy column (per
 * Task 4 "canvas slot 的最小实现"); 11.6 will layer the template selector
 * modal and diff/merge views on top.
 */
export function StructureCanvas({
  tree,
  loading,
  onCommitTitle,
  onAddChild,
  onOpenMoreMenu,
  onUndoPendingDelete,
  phaseByNodeKey,
}: StructureCanvasProps): React.JSX.Element {
  const flat = flatten(tree)

  const renderNode = useCallback(
    (node: StructureNode) => (
      <StructureCanvasNode
        key={node.nodeKey}
        node={node}
        onCommitTitle={onCommitTitle}
        onAddChild={onAddChild}
        onOpenMoreMenu={onOpenMoreMenu}
        onUndoPendingDelete={onUndoPendingDelete}
        generationPhase={phaseByNodeKey?.get(node.nodeKey) ?? node.generationPhase}
      />
    ),
    [onCommitTitle, onAddChild, onOpenMoreMenu, onUndoPendingDelete, phaseByNodeKey]
  )

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="structure-canvas-loading"
      >
        <Spin size="large" />
      </div>
    )
  }

  if (flat.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" data-testid="structure-canvas-empty">
        <Empty description="暂无章节结构" />
      </div>
    )
  }

  return (
    <div
      role="tree"
      aria-label="方案结构画布"
      data-testid="structure-canvas"
      className="bg-bg-content border-border h-full overflow-y-auto rounded border"
    >
      {flat.map(renderNode)}
    </div>
  )
}
