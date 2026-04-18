import type { ChapterGenerationPhase } from '@shared/chapter-types'
import type { ChapterNodeState } from '@renderer/stores/chapterStructureStore'

/**
 * Story 11.9: unified structure tree view contracts.
 *
 * The public `<StructureTreeView>` component is consumed by two hosts:
 *   - `SkeletonEditor` (draft mode): in-memory `SkeletonSection[]` edits with
 *     full-tree replace semantics via `onUpdate`.
 *   - `StructureDesignWorkspace` (persisted mode): live `sectionIndex` edits
 *     that route through Story 11.3 store actions + Story 11.9 DnD / insert
 *     child contracts.
 */

export type StructureTreeViewMode = 'draft' | 'persisted'

export interface StructureTreeNode {
  /** Stable node key. draft = internal id; persisted = sectionId (UUID). */
  key: string
  title: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  /** draft: show red `重点投入` tag. persisted: ignored. */
  isKeyFocus?: boolean
  /** draft: show weight tag with color bucket (>=15% red, >=5% orange). persisted: ignored. */
  weightPercent?: number
  /** persisted: stable template anchor; draft: unused. */
  templateSectionKey?: string
  children: StructureTreeNode[]
}

export type StructureTreeViewPlacement = 'before' | 'after' | 'inside'

export interface StructureTreeViewProps {
  mode: StructureTreeViewMode
  nodes: StructureTreeNode[]

  /** Five-state visual (persisted only). Ignored in draft mode. */
  stateOf?: (key: string) => ChapterNodeState
  /** Idle-state phase decorator (persisted only). */
  phaseByKey?: ReadonlyMap<string, ChapterGenerationPhase>

  /* === Write path — mode-exclusive. === */
  /** draft: full-tree replace after any mutation. persisted: must not be passed. */
  onUpdate?: (nextNodes: StructureTreeNode[]) => void
  /** persisted: insert a new last-child under `parentKey`. */
  onInsertChild?: (parentKey: string) => Promise<void> | void
  /** persisted: insert a sibling after `targetKey`. */
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
   * Required when `mode='persisted'` and keyboard support is on — the internal
   * Story 11.3 keymap dispatches `insertSibling` / `indent` / `outdent` /
   * `requestSoftDelete` against this projectId. Omitting it (or passing null)
   * silently disables the keymap so draft mounts and read-only previews stay
   * pure.
   */
  projectId?: string | null
  onConfirm?: () => void
  confirmLabel?: string
  /** When true, the confirm CTA shows a spinner and blocks clicks. */
  confirmLoading?: boolean
  onReselectTemplate?: () => void
  showStats?: boolean
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
