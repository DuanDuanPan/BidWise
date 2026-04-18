/**
 * Structure Design module public surface.
 *
 * Story 11.9: single unified `<StructureTreeView>` renderer replaces the
 * Story 11.2 `StructureCanvas` / `StructureCanvasNode` pair. Consumers are
 * `SkeletonEditor` (draft) and `StructureDesignWorkspace` (persisted).
 */
export { StructureDesignWorkspace } from './components/StructureDesignWorkspace'
export { StructureTreeView } from './components/StructureTreeView'
export type {
  StructureTreeNode,
  StructureTreeViewMode,
  StructureTreeViewPlacement,
  StructureTreeViewProps,
} from './components/StructureTreeView.types'
export {
  skeletonToTreeNodes,
  treeNodesToSkeleton,
  countTreeNodes,
  generateDraftKey,
} from './adapters/skeletonAdapter'
export {
  sectionIndexToTreeNodes,
  collectSubtreeKeys,
  findTreeNode,
} from './adapters/persistedAdapter'
export { useStructureOutline } from './hooks/useStructureOutline'
export type { StructureNode } from './hooks/useStructureOutline'
export { useChapterNodeState } from './hooks/useChapterNodeState'
export type { ChapterNodeStateSnapshot } from './hooks/useChapterNodeState'

export {
  useChapterStructureStore,
  deriveChapterNodeState,
} from '@renderer/stores/chapterStructureStore'
export type {
  ChapterStructureStore,
  ChapterStructureState,
  ChapterStructureActions,
  ChapterNodeState,
  PendingDeleteEntry,
} from '@renderer/stores/chapterStructureStore'
