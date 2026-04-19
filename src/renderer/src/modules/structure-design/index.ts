/**
 * Structure Design module public surface.
 */
export { StructureDesignWorkspace } from './components/StructureDesignWorkspace'
export { StructureTreeView } from './components/StructureTreeView'
export type {
  StructureTreeNode,
  StructureTreeViewPlacement,
  StructureTreeViewProps,
} from './components/StructureTreeView.types'
export {
  sectionIndexToTreeNodes,
  collectSubtreeKeys,
  countTreeNodes,
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
