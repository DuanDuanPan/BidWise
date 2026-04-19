import { useCallback, useMemo } from 'react'
import { buildChapterTree } from '@shared/chapter-identity'
import type { ChapterGenerationPhase, ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import { useDocumentStore } from '@renderer/stores/documentStore'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'

/**
 * Read-side view of a chapter node used by the Structure Design workspace.
 * `nodeKey` equals the project-level stable `sectionId` (Story 11.1). The
 * optional `generationPhase` is consumed by Idle-state decorators in
 * `StructureCanvasNode`; producers (Story 11.8 streaming recommend, chapter
 * generation status) pass it through `useChapterGeneration`-style maps.
 */
export interface StructureNode {
  sectionId: string
  nodeKey: string
  title: string
  level: 1 | 2 | 3 | 4
  parentId: string | null
  order: number
  templateSectionKey?: string
  generationPhase?: ChapterGenerationPhase
  children: StructureNode[]
}

interface UseStructureOutlineResult {
  tree: StructureNode[]
  flat: ProposalSectionIndexEntry[]
  loading: boolean
  error: string | null
  reload: () => void
}

function toStructureNode(entry: ChapterTreeNode, parentId: string | null): StructureNode {
  return {
    sectionId: entry.sectionId,
    nodeKey: entry.sectionId,
    title: entry.title,
    level: entry.level,
    parentId,
    order: entry.order,
    templateSectionKey: entry.templateSectionKey,
    children: entry.children.map((child) => toStructureNode(child, entry.sectionId)),
  }
}

/**
 * Reads chapter tree from `documentStore.sectionIndex`. The document store is
 * the single source of truth: `loadDocument` populates it on project entry,
 * `applyStructureSnapshot` (via `commitSnapshot` inside each structural
 * mutation) atomically updates it in-place.
 *
 * Consuming the store directly means we skip a second IPC round-trip after
 * every mutation. That refetch previously caused a visible "refresh" cycle
 * (loading flash + new tree reference) that reset scroll position and hid the
 * freshly-created node that Story 11.3 AC1 requires to stay focused+editing.
 */
export function useStructureOutline(projectId: string | null): UseStructureOutlineResult {
  const loadedProjectId = useDocumentStore((s) => s.loadedProjectId)
  const sectionIndex = useDocumentStore((s) => s.sectionIndex)
  const storeLoading = useDocumentStore((s) => s.loading)
  const error = useDocumentStore((s) => s.error)
  const loadDocument = useDocumentStore((s) => s.loadDocument)
  const activePendingDeletion = useChapterStructureStore((s) => s.activePendingDeletion)

  const matchesProject = projectId !== null && loadedProjectId === projectId

  // Story 11.4: during an active 5-second Undo window, the live `sectionIndex`
  // has already been pruned by the soft-delete IPC. Merge the snapshot rows
  // from `activePendingDeletion.sectionIndexEntries` back in so the tree keeps
  // rendering the deleted subtree — `chapterStructureStore.pendingDeleteBySectionId`
  // drives the per-node pending-delete visual state. Drop the pending rows
  // once the window finalizes or the Undo completes; both transitions clear
  // `activePendingDeletion` and return the flat to a pure live view.
  const flat = useMemo<ProposalSectionIndexEntry[]>(() => {
    if (!matchesProject) return []
    if (!activePendingDeletion || activePendingDeletion.sectionIndexEntries.length === 0) {
      return sectionIndex
    }
    const seen = new Set(sectionIndex.map((e) => e.sectionId))
    const pendingRows = activePendingDeletion.sectionIndexEntries
      .filter((e) => !seen.has(e.sectionId))
      .map((e) => e as unknown as ProposalSectionIndexEntry)
    if (pendingRows.length === 0) return sectionIndex
    return [...sectionIndex, ...pendingRows]
  }, [matchesProject, sectionIndex, activePendingDeletion])

  const tree = useMemo<StructureNode[]>(() => {
    if (!matchesProject) return []
    return buildChapterTree(flat).map((node) => toStructureNode(node, null))
  }, [matchesProject, flat])

  const reload = useCallback(() => {
    if (projectId) void loadDocument(projectId)
  }, [projectId, loadDocument])

  return {
    tree,
    flat,
    loading: storeLoading && !matchesProject,
    error,
    reload,
  }
}
