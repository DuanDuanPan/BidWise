/**
 * Structure Design module public surface.
 *
 * Story 11.3 / 11.4 / 11.8 import the focus-state machine API from here; the
 * underlying store lives in `@renderer/stores/chapterStructureStore` so that
 * every renderer module shares a single instance.
 */
export { StructureDesignWorkspace } from './components/StructureDesignWorkspace'
export { StructureCanvas } from './components/StructureCanvas'
export { StructureCanvasNode } from './components/StructureCanvasNode'
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
