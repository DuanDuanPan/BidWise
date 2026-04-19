import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStructureOutline } from '@modules/structure-design/hooks/useStructureOutline'
import { useDocumentStore } from '@renderer/stores/documentStore'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import type { PendingStructureDeletionSummary } from '@shared/chapter-types'

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function entry(overrides: Partial<ProposalSectionIndexEntry>): ProposalSectionIndexEntry {
  return {
    sectionId: 'default-id',
    title: 't',
    level: 1,
    order: 0,
    occurrenceIndex: 0,
    headingLocator: { title: 't', level: 1, occurrenceIndex: 0 },
    ...overrides,
  } as ProposalSectionIndexEntry
}

function seedDocStore(
  projectId: string | null,
  sectionIndex: ProposalSectionIndexEntry[],
  overrides: Partial<{ loading: boolean; error: string | null }> = {}
): void {
  useDocumentStore.setState({
    loadedProjectId: projectId,
    sectionIndex,
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
  })
}

describe('@story-11-2 useStructureOutline', () => {
  beforeEach(() => {
    useDocumentStore.setState({
      loadedProjectId: null,
      sectionIndex: [],
      loading: false,
      error: null,
    })
    useChapterStructureStore.getState().reset()
  })

  it('@p0 returns empty tree when projectId is null', () => {
    seedDocStore('proj-1', [entry({ sectionId: UUID_A, title: 'X', level: 1, order: 0 })])
    const { result } = renderHook(() => useStructureOutline(null))
    expect(result.current.tree).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('@p0 builds a hierarchical tree from docStore sectionIndex', () => {
    seedDocStore('proj-1', [
      entry({ sectionId: UUID_A, title: '项目综述', level: 1, order: 0 }),
      entry({
        sectionId: UUID_B,
        title: '需求理解',
        level: 2,
        parentSectionId: UUID_A,
        order: 0,
      }),
      entry({ sectionId: UUID_C, title: '总体技术方案', level: 1, order: 1 }),
    ])

    const { result } = renderHook(() => useStructureOutline('proj-1'))

    expect(result.current.tree).toHaveLength(2)
    expect(result.current.tree[0].sectionId).toBe(UUID_A)
    expect(result.current.tree[0].children).toHaveLength(1)
    expect(result.current.tree[0].children[0].sectionId).toBe(UUID_B)
    expect(result.current.tree[0].children[0].parentId).toBe(UUID_A)
    expect(result.current.tree[1].sectionId).toBe(UUID_C)
  })

  it('@p0 uses sectionId as nodeKey (Story 11.1 contract, AC6)', () => {
    seedDocStore('proj-1', [entry({ sectionId: UUID_A, title: 'X', level: 1, order: 0 })])
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    expect(result.current.tree[0].nodeKey).toBe(UUID_A)
    expect(result.current.tree[0].sectionId).toBe(UUID_A)
  })

  it('@p1 surfaces docStore error state', () => {
    seedDocStore(null, [], { error: 'project missing' })
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    expect(result.current.error).toBe('project missing')
    expect(result.current.tree).toEqual([])
  })

  it('@p1 returns empty tree when docStore holds a different project', () => {
    seedDocStore('other-proj', [entry({ sectionId: UUID_A, title: 'X', level: 1, order: 0 })])
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    expect(result.current.tree).toEqual([])
  })

  it('@p1 handles empty sectionIndex gracefully', () => {
    seedDocStore('proj-1', [])
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    expect(result.current.tree).toEqual([])
    expect(result.current.error).toBe(null)
  })

  it('@story-11-4 merges pending-delete sectionIndex entries back into the tree during the Undo window', () => {
    // Live sectionIndex has already been scrubbed of the deleted subtree by
    // the soft-delete IPC (Story 11.4). The renderer must still render the
    // rows so the `pending-delete` visual state has nodes to attach to.
    seedDocStore('proj-1', [entry({ sectionId: UUID_C, title: '总体', level: 1, order: 1 })])
    const pendingSummary: PendingStructureDeletionSummary = {
      deletionId: 'del-1',
      deletedAt: '2026-04-18T00:00:00.000Z',
      expiresAt: '2026-04-18T00:00:05.000Z',
      rootSectionId: UUID_A,
      sectionIds: [UUID_A, UUID_B],
      firstTitle: '综述',
      totalWordCount: 10,
      subtreeSize: 2,
      sectionIndexEntries: [
        entry({ sectionId: UUID_A, title: '综述', level: 1, order: 0 }),
        entry({
          sectionId: UUID_B,
          title: '需求',
          level: 2,
          parentSectionId: UUID_A,
          order: 0,
        }),
      ],
    }
    useChapterStructureStore.getState().hydratePendingDeletion(pendingSummary)

    const { result } = renderHook(() => useStructureOutline('proj-1'))

    // Deleted root + child appear alongside the live sibling during the window.
    const topIds = result.current.tree.map((n) => n.sectionId).sort()
    expect(topIds).toEqual([UUID_A, UUID_C].sort())
    const root = result.current.tree.find((n) => n.sectionId === UUID_A)
    expect(root?.children[0]?.sectionId).toBe(UUID_B)

    // After the Undo window finalizes, pending rows drop out of the merged view.
    useChapterStructureStore.getState().hydratePendingDeletion(null)
    const { result: resultAfter } = renderHook(() => useStructureOutline('proj-1'))
    expect(resultAfter.current.tree.map((n) => n.sectionId)).toEqual([UUID_C])
  })
})
