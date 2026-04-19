import type { ChapterGenerationPhase } from '@shared/chapter-types'
import type { ChapterNodeState } from '@renderer/stores/chapterStructureStore'

/**
 * Structure tree view contracts.
 *
 * Consumed by `StructureDesignWorkspace` (solution-design has-content) and
 * `DocumentOutlineTree` (proposal-writing). All mutations flow through
 * host-supplied callbacks that close over `chapterStructureStore` actions.
 */

export interface StructureTreeNode {
  /** Stable node key === canonical `sectionId` (UUID). */
  key: string
  title: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  /** Forwarded from sectionIndex so the footer "N 个重点章节" stat stays honest. */
  isKeyFocus?: boolean
  /** Stable template anchor, when the section came from a template. */
  templateSectionKey?: string
  children: StructureTreeNode[]
}

export type StructureTreeViewPlacement = 'before' | 'after' | 'inside'

export interface StructureTreeViewProps {
  nodes: StructureTreeNode[]

  /** Five-state visual. */
  stateOf?: (key: string) => ChapterNodeState
  /** Idle-state phase decorator. */
  phaseByKey?: ReadonlyMap<string, ChapterGenerationPhase>

  /* === Write path — all mutations route through host callbacks that close
   *     over `chapterStructureStore` actions. === */
  onInsertChild?: (parentKey: string) => Promise<void> | void
  onInsertSibling?: (targetKey: string) => Promise<void> | void
  onIndent?: (targetKey: string) => Promise<void> | void
  onOutdent?: (targetKey: string) => Promise<void> | void
  onMove?: (
    dragKey: string,
    dropKey: string,
    placement: StructureTreeViewPlacement
  ) => Promise<void> | void
  onDelete?: (targetKeys: string[]) => Promise<void> | void
  onCommitTitle?: (targetKey: string, nextTitle: string) => Promise<void> | void
  onUndoPendingDelete?: (targetKeys: string[]) => Promise<void> | void

  /* === Shared === */
  /**
   * Required when keyboard support is on — the internal Story 11.3 keymap
   * dispatches `insertSibling` / `indent` / `outdent` / `requestSoftDelete`
   * against this projectId. Omitting it (or passing null) silently disables
   * the keymap so read-only previews stay pure.
   */
  projectId?: string | null
  onConfirm?: () => void
  confirmLabel?: string
  /** When true, the confirm CTA shows a spinner and blocks clicks. */
  confirmLoading?: boolean
  onReselectTemplate?: () => void
  showStats?: boolean
  /** Defaults to `true`; set to `false` for read-only previews. */
  keyboardEnabled?: boolean
  maxDepth?: number
  emptyHint?: React.ReactNode
  loading?: boolean
  error?: string | null
  onRetry?: () => void

  /**
   * Forwarded to the root wrapper for host-level Playwright / unit assertions.
   * Defaults to `structure-tree-view` when absent.
   */
  'data-testid'?: string

  /**
   * Optional host-provided wrapper for the tree panel. The component still
   * owns the focusable panel ref used by the internal Story 11.3 keymap;
   * `renderPanel` only lets hosts add decorative chrome around the panel.
   */
  renderPanel?: (tree: React.ReactNode) => React.ReactNode
}
