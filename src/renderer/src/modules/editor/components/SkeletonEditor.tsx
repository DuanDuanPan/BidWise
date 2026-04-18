import { useMemo } from 'react'
import type { SkeletonSection } from '@shared/template-types'
import { StructureTreeView } from '@modules/structure-design/components/StructureTreeView'
import {
  skeletonToTreeNodes,
  treeNodesToSkeleton,
} from '@modules/structure-design/adapters/skeletonAdapter'

interface SkeletonEditorProps {
  skeleton: SkeletonSection[]
  onUpdate: (updated: SkeletonSection[]) => void
  onConfirm: () => void
  onRegenerate: () => void
}

/**
 * Story 11.9: draft-mode wrapper around `<StructureTreeView>`. Owns
 * SkeletonSection ⇔ StructureTreeNode translation at the host boundary so the
 * unified component never imports template types. All testIds from the legacy
 * AntD-native implementation stay intact so existing SolutionDesignView /
 * skeleton-editor unit tests keep matching.
 */
export function SkeletonEditor({
  skeleton,
  onUpdate,
  onConfirm,
  onRegenerate,
}: SkeletonEditorProps): React.JSX.Element {
  const nodes = useMemo(() => skeletonToTreeNodes(skeleton), [skeleton])

  return (
    <StructureTreeView
      mode="draft"
      nodes={nodes}
      onUpdate={(next) => onUpdate(treeNodesToSkeleton(next))}
      onConfirm={onConfirm}
      onReselectTemplate={onRegenerate}
      confirmLabel="确认骨架，开始撰写"
      showStats
      data-testid="skeleton-editor"
    />
  )
}
