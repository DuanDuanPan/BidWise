import { useCallback, useMemo } from 'react'
import { buildChapterTree } from '@shared/chapter-identity'
import type { ChapterGenerationPhase, ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import { useDocumentStore } from '@renderer/stores/documentStore'

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

  const matchesProject = projectId !== null && loadedProjectId === projectId
  const flat = matchesProject ? sectionIndex : []

  const tree = useMemo<StructureNode[]>(() => {
    if (!matchesProject) return []
    return buildChapterTree(sectionIndex).map((node) => toStructureNode(node, null))
  }, [matchesProject, sectionIndex])

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
