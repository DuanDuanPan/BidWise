import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { useProjects } from '@modules/project/hooks/useProjects'
import { useProjectStore, type ProjectFilter, type SortMode } from '@renderer/stores/projectStore'
import type { ProjectListItem } from '@shared/ipc-types'

const originalTZ = process.env.TZ

const baseProjects: ProjectListItem[] = [
  {
    id: 'active-1',
    name: '进行中项目',
    customerName: '客户A',
    industry: '军工',
    deadline: '2026-04-01T19:00:00.000Z',
    sopStage: 'not-started',
    status: 'active',
    updatedAt: '2026-03-20T00:00:00.000Z',
  },
  {
    id: 'archived-1',
    name: '归档项目',
    customerName: '客户B',
    industry: '能源',
    deadline: '2026-04-03T19:00:00.000Z',
    sopStage: 'not-started',
    status: 'archived',
    updatedAt: '2026-03-19T00:00:00.000Z',
  },
]

function seedStore(
  options: {
    projects?: ProjectListItem[]
    filter?: Partial<ProjectFilter>
    sortMode?: SortMode
  } = {}
): void {
  const loadProjects = vi.fn().mockResolvedValue(undefined)

  useProjectStore.setState({
    projects: options.projects ?? baseProjects,
    loading: false,
    error: null,
    filter: {
      quick: 'all',
      customer: null,
      industry: null,
      status: null,
      deadlineBefore: null,
      ...options.filter,
    },
    sortMode: options.sortMode ?? 'smart',
    loadProjects,
  })
}

describe.sequential('useProjects', () => {
  beforeEach(() => {
    seedStore()
  })

  afterEach(() => {
    process.env.TZ = originalTZ
    cleanup()
  })

  it('keeps archived projects hidden for quick=all by default', () => {
    const { result } = renderHook(() => useProjects())

    expect(result.current.projects.map((project) => project.id)).toEqual(['active-1'])
  })

  it('shows archived projects when advanced status filter requests archived', () => {
    seedStore({ filter: { status: 'archived' } })

    const { result } = renderHook(() => useProjects())

    expect(result.current.projects.map((project) => project.id)).toEqual(['archived-1'])
  })

  it('treats deadlineBefore as a local end-of-day cutoff for date-only values', () => {
    process.env.TZ = 'America/Los_Angeles'
    seedStore({
      projects: [
        {
          id: 'due-apr-1',
          name: '四月一日截止',
          customerName: '客户A',
          industry: '军工',
          deadline: '2026-04-01T19:00:00.000Z',
          sopStage: 'not-started',
          status: 'active',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'due-apr-2',
          name: '四月二日截止',
          customerName: '客户B',
          industry: '能源',
          deadline: '2026-04-02T07:00:00.000Z',
          sopStage: 'not-started',
          status: 'active',
          updatedAt: '2026-03-19T00:00:00.000Z',
        },
      ],
      filter: { deadlineBefore: '2026-04-01' },
    })

    const { result } = renderHook(() => useProjects())

    expect(result.current.projects.map((project) => project.id)).toEqual(['due-apr-1'])
  })
})
