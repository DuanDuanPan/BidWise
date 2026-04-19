import { useCallback, useMemo } from 'react'
import { useStructureOutline } from '../hooks/useStructureOutline'
import { StructureTreeView } from './StructureTreeView'
import { sectionIndexToTreeNodes } from '../adapters/persistedAdapter'
import {
  useChapterStructureStore,
  deriveChapterNodeState,
  type ChapterNodeState,
} from '@renderer/stores/chapterStructureStore'
import { resolveSectionIdFromLocator } from '@shared/chapter-identity'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'

export interface StructureDesignWorkspaceProps {
  projectId: string
  onConfirmSkeleton?: () => void
  /**
   * Caller-supplied CTA label. `SolutionDesignView` derives this from
   * `templateId + firstSkeletonConfirmedAt` — workspace is dumb and simply
   * forwards. Defaults to `继续撰写` when omitted.
   */
  confirmLabel?: string
  confirmLoading?: boolean
  onReselectTemplate?: () => void
  phaseByNodeKey?: ReadonlyMap<string, ChapterGenerationPhase>
}

/**
 * Story 11.9: persisted-mode host around `<StructureTreeView>`. Owns store
 * actions, keymap wiring, scroll / DOM focus continuity, and derived phase
 * map. The shared tree component handles visuals + DnD routing.
 */
export function StructureDesignWorkspace({
  projectId,
  onConfirmSkeleton,
  confirmLabel = '继续撰写',
  confirmLoading,
  onReselectTemplate,
  phaseByNodeKey,
}: StructureDesignWorkspaceProps): React.JSX.Element {
  const { flat, loading, error, reload } = useStructureOutline(projectId)

  const commitTitle = useChapterStructureStore((s) => s.commitTitle)
  const insertSibling = useChapterStructureStore((s) => s.insertSibling)
  const insertChildAction = useChapterStructureStore((s) => s.insertChild)
  const indentSection = useChapterStructureStore((s) => s.indentSection)
  const outdentSection = useChapterStructureStore((s) => s.outdentSection)
  const moveSubtreeAction = useChapterStructureStore((s) => s.moveSubtree)
  const requestSoftDelete = useChapterStructureStore((s) => s.requestSoftDelete)
  const undoPendingDelete = useChapterStructureStore((s) => s.undoPendingDelete)
  const activePendingDeletion = useChapterStructureStore((s) => s.activePendingDeletion)

  // Phase source — prefer host-injected map, otherwise derive from global
  // ChapterGenerationContext. Same projectId guard as pre-11.9 so commonly
  // named chapters (综述 / 概述) can't leak a phase icon between projects.
  const chapterGen = useChapterGenerationContext()
  const derivedPhaseMap = useMemo<ReadonlyMap<string, ChapterGenerationPhase>>(() => {
    if (phaseByNodeKey) return phaseByNodeKey
    const map = new Map<string, ChapterGenerationPhase>()
    if (!chapterGen) return map
    if (chapterGen.currentProjectId !== projectId) return map
    for (const status of chapterGen.statuses.values()) {
      const id = resolveSectionIdFromLocator(flat, status.target)
      if (id) map.set(id, status.phase)
    }
    return map
  }, [phaseByNodeKey, chapterGen, flat, projectId])

  // Story 11.4: bindProject lifecycle is owned by `ProjectWorkspace` — the
  // single host that spans every SOP stage (solution-design → proposal-writing
  // → compliance-review). Clearing the binding here on stage-switch unmount
  // was dropping the active Undo window + finalize timer mid-flight, leaving
  // the persisted journal entry orphaned in memory until process restart.

  const persistedNodes = useMemo(() => sectionIndexToTreeNodes(flat), [flat])

  const stateOf = useCallback(
    (key: string): ChapterNodeState =>
      deriveChapterNodeState(useChapterStructureStore.getState(), key),
    []
  )

  const handleCommitTitle = useCallback(
    async (key: string, nextTitle: string): Promise<void> => {
      await commitTitle(projectId, key, nextTitle)
    },
    [projectId, commitTitle]
  )

  const handleInsertChild = useCallback(
    async (parentKey: string): Promise<void> => {
      await insertChildAction(projectId, parentKey)
    },
    [projectId, insertChildAction]
  )

  const handleInsertSibling = useCallback(
    async (targetKey: string): Promise<void> => {
      await insertSibling(projectId, targetKey)
    },
    [projectId, insertSibling]
  )

  const handleIndent = useCallback(
    async (targetKey: string): Promise<void> => {
      await indentSection(projectId, targetKey)
    },
    [projectId, indentSection]
  )

  const handleOutdent = useCallback(
    async (targetKey: string): Promise<void> => {
      await outdentSection(projectId, targetKey)
    },
    [projectId, outdentSection]
  )

  const handleMove = useCallback(
    async (dragKey: string, dropKey: string, placement: 'before' | 'after' | 'inside') => {
      await moveSubtreeAction(projectId, dragKey, dropKey, placement)
    },
    [projectId, moveSubtreeAction]
  )

  const handleDelete = useCallback(
    async (keys: string[]): Promise<void> => {
      await requestSoftDelete(projectId, keys)
    },
    [projectId, requestSoftDelete]
  )

  const handleUndo = useCallback(
    async (_keys: string[]): Promise<void> => {
      // Story 11.4: row-level Undo routes through the real store action.
      // The toast presents the primary Undo button; the per-row callback is
      // kept so keyboard focus / right-click affordances still work.
      const deletionId = activePendingDeletion?.deletionId
      if (!deletionId) return
      await undoPendingDelete(projectId, deletionId)
    },
    [projectId, activePendingDeletion, undoPendingDelete]
  )

  return (
    <div
      className="flex h-full flex-col"
      data-testid="structure-design-workspace"
      data-project-id={projectId}
    >
      <StructureTreeView
        nodes={persistedNodes}
        projectId={projectId}
        stateOf={stateOf}
        phaseByKey={derivedPhaseMap}
        onInsertChild={handleInsertChild}
        onInsertSibling={handleInsertSibling}
        onIndent={handleIndent}
        onOutdent={handleOutdent}
        onMove={handleMove}
        onDelete={handleDelete}
        onCommitTitle={handleCommitTitle}
        onUndoPendingDelete={handleUndo}
        onConfirm={onConfirmSkeleton}
        confirmLabel={confirmLabel}
        confirmLoading={confirmLoading}
        onReselectTemplate={onReselectTemplate}
        keyboardEnabled
        showStats
        loading={loading}
        error={error ?? null}
        onRetry={reload}
        data-testid="structure-tree-view"
      />
    </div>
  )
}
