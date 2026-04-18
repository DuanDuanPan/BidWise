import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useStructureOutline } from '@modules/structure-design/hooks/useStructureOutline'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

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

function mockMetadataApi(sectionIndex: ProposalSectionIndexEntry[] | undefined): void {
  vi.stubGlobal('api', {
    documentGetMetadata: vi.fn().mockResolvedValue({
      success: true,
      data: {
        annotations: [],
        sourceAttributions: [],
        baselineValidations: [],
        sectionIndex,
      },
    }),
  })
}

describe('@story-11-2 useStructureOutline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('@p0 returns empty tree when projectId is null', async () => {
    mockMetadataApi([])
    const { result } = renderHook(() => useStructureOutline(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tree).toEqual([])
  })

  it('@p0 builds a hierarchical tree from sectionIndex', async () => {
    mockMetadataApi([
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
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.tree).toHaveLength(2)
    expect(result.current.tree[0].sectionId).toBe(UUID_A)
    expect(result.current.tree[0].children).toHaveLength(1)
    expect(result.current.tree[0].children[0].sectionId).toBe(UUID_B)
    expect(result.current.tree[0].children[0].parentId).toBe(UUID_A)
    expect(result.current.tree[1].sectionId).toBe(UUID_C)
  })

  it('@p0 uses sectionId as nodeKey (Story 11.1 contract, AC6)', async () => {
    mockMetadataApi([entry({ sectionId: UUID_A, title: 'X', level: 1, order: 0 })])
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tree[0].nodeKey).toBe(UUID_A)
    expect(result.current.tree[0].sectionId).toBe(UUID_A)
  })

  it('@p1 surfaces error when IPC returns failure', async () => {
    vi.stubGlobal('api', {
      documentGetMetadata: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: 'project missing' },
      }),
    })
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('project missing')
    expect(result.current.tree).toEqual([])
  })

  it('@p1 handles missing sectionIndex gracefully', async () => {
    mockMetadataApi(undefined)
    const { result } = renderHook(() => useStructureOutline('proj-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.tree).toEqual([])
    expect(result.current.error).toBe(null)
  })
})
