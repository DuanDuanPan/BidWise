import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'
import { useCurrentProject } from '@modules/project/hooks/useCurrentProject'
import { useProjectStore } from '@renderer/stores'

const mockProject = {
  id: 'p1',
  name: '测试项目',
  customerName: null,
  industry: null,
  deadline: null,
  proposalType: 'presale-technical',
  sopStage: 'requirements-analysis',
  status: 'active',
  rootPath: null,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: '2026-03-20T00:00:00.000Z',
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'p1' }),
}))

describe('@story-1-6 useCurrentProject', () => {
  beforeEach(() => {
    // Reset Zustand store state to prevent cross-test leakage
    useProjectStore.setState({
      currentProject: null,
      loading: false,
      error: null,
      projects: [],
    })
    vi.stubGlobal('api', {
      projectGet: vi.fn().mockResolvedValue({ success: true, data: mockProject }),
      projectUpdate: vi.fn().mockResolvedValue({ success: true, data: mockProject }),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      projectCreate: vi.fn(),
      projectDelete: vi.fn(),
      projectArchive: vi.fn(),
    })
  })
  afterEach(cleanup)

  it('@p1 returns projectId from route params', () => {
    const { result } = renderHook(() => useCurrentProject())
    expect(result.current.projectId).toBe('p1')
  })

  it('@p0 loads project data on mount', async () => {
    const { result } = renderHook(() => useCurrentProject())
    await waitFor(() => {
      expect(result.current.currentProject).toEqual(mockProject)
    })
    expect(window.api.projectGet).toHaveBeenCalledWith('p1')
  })

  it('@p0 returns error on failed load', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: '项目不存在' },
      }),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })
    const { result } = renderHook(() => useCurrentProject())
    await waitFor(() => {
      expect(result.current.error).toBe('项目不存在')
    })
  })

  it('@p1 clears stale project when projectId changes', async () => {
    // Pre-populate store with a stale project from a different id
    useProjectStore.setState({
      currentProject: { ...mockProject, id: 'old-id', name: '旧项目' },
      loading: false,
      error: null,
    })
    // Render with route param id='p1' while store has id='old-id'
    const { result } = renderHook(() => useCurrentProject())
    // The hook should clear stale data and trigger loading
    await waitFor(() => {
      expect(result.current.currentProject).toEqual(mockProject)
    })
    expect(window.api.projectGet).toHaveBeenCalledWith('p1')
  })
})
