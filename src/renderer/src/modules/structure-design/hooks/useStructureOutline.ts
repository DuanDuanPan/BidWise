import { useCallback, useEffect, useState } from 'react'
import { buildChapterTree } from '@shared/chapter-identity'
import type { ChapterGenerationPhase, ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

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

export function useStructureOutline(projectId: string | null): UseStructureOutlineResult {
  const [tree, setTree] = useState<StructureNode[]>([])
  const [flat, setFlat] = useState<ProposalSectionIndexEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const reload = useCallback(() => {
    setRefreshNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      if (!projectId) {
        setTree([])
        setFlat([])
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.documentGetMetadata({ projectId })
        if (cancelled) return
        if (!res.success) {
          setError(res.error.message)
          setTree([])
          setFlat([])
          return
        }
        const index = res.data.sectionIndex ?? []
        setFlat(index)
        const built = buildChapterTree(index)
        setTree(built.map((node) => toStructureNode(node, null)))
      } catch (err) {
        if (cancelled) return
        setError((err as Error).message)
        setTree([])
        setFlat([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [projectId, refreshNonce])

  return { tree, flat, loading, error, reload }
}
