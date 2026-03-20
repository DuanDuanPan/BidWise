import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useProjectStore } from '@renderer/stores/projectStore'
import type { ApiResponse, ProjectListItem, ProjectRecord } from '@shared/ipc-types'

const mockProject: ProjectRecord = {
  id: 'test-1',
  name: '测试项目',
  customerName: '客户A',
  industry: '军工',
  deadline: '2026-04-01T00:00:00.000Z',
  proposalType: 'presale-technical',
  sopStage: 'not-started',
  status: 'active',
  rootPath: '/tmp/test',
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: '2026-03-20T00:00:00.000Z',
}

const mockListItem: ProjectListItem = {
  id: 'test-1',
  name: '测试项目',
  customerName: '客户A',
  industry: '军工',
  deadline: '2026-04-01T00:00:00.000Z',
  sopStage: 'not-started',
  status: 'active',
  updatedAt: '2026-03-20T00:00:00.000Z',
}

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    projectList: vi.fn<() => Promise<ApiResponse<ProjectListItem[]>>>().mockResolvedValue({
      success: true,
      data: [mockListItem],
    }),
    projectCreate: vi.fn<() => Promise<ApiResponse<ProjectRecord>>>().mockResolvedValue({
      success: true,
      data: mockProject,
    }),
    projectGet: vi.fn<() => Promise<ApiResponse<ProjectRecord>>>().mockResolvedValue({
      success: true,
      data: mockProject,
    }),
    projectUpdate: vi.fn<() => Promise<ApiResponse<ProjectRecord>>>().mockResolvedValue({
      success: true,
      data: { ...mockProject, name: '更新后' },
    }),
    projectDelete: vi.fn<() => Promise<ApiResponse<void>>>().mockResolvedValue({
      success: true,
      data: undefined as unknown as void,
    }),
    projectArchive: vi.fn<() => Promise<ApiResponse<ProjectRecord>>>().mockResolvedValue({
      success: true,
      data: { ...mockProject, status: 'archived' },
    }),
    ...overrides,
  })
}

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projects: [],
      currentProject: null,
      loading: false,
      error: null,
      filter: {
        quick: 'all',
        customer: null,
        industry: null,
        status: null,
        deadlineBefore: null,
      },
      sortMode: 'smart',
    })
    mockApi()
  })

  describe('loadProjects', () => {
    it('should load projects from API', async () => {
      await useProjectStore.getState().loadProjects()
      expect(useProjectStore.getState().projects).toHaveLength(1)
      expect(useProjectStore.getState().projects[0].name).toBe('测试项目')
      expect(useProjectStore.getState().loading).toBe(false)
    })

    it('should set error on API failure', async () => {
      mockApi({
        projectList: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'DATABASE', message: '数据库错误' },
        }),
      })
      await useProjectStore.getState().loadProjects()
      expect(useProjectStore.getState().error).toBe('数据库错误')
      expect(useProjectStore.getState().loading).toBe(false)
    })
  })

  describe('createProject', () => {
    it('should create project and reload list', async () => {
      const result = await useProjectStore.getState().createProject({ name: '新项目' })
      expect(result.name).toBe('测试项目')
      expect(window.api.projectCreate).toHaveBeenCalled()
      expect(window.api.projectList).toHaveBeenCalled()
    })

    it('should set error on create failure', async () => {
      mockApi({
        projectCreate: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'VALIDATION', message: '名称为空' },
        }),
      })
      await expect(useProjectStore.getState().createProject({ name: '' })).rejects.toThrow()
      expect(useProjectStore.getState().error).toBe('名称为空')
    })
  })

  describe('updateProject', () => {
    it('should update project and reload list', async () => {
      const result = await useProjectStore.getState().updateProject('test-1', { name: '更新' })
      expect(result.name).toBe('更新后')
      expect(window.api.projectUpdate).toHaveBeenCalled()
    })
  })

  describe('deleteProject', () => {
    it('should delete project and reload list', async () => {
      await useProjectStore.getState().deleteProject('test-1')
      expect(window.api.projectDelete).toHaveBeenCalledWith('test-1')
      expect(window.api.projectList).toHaveBeenCalled()
    })
  })

  describe('archiveProject', () => {
    it('should archive project and reload list', async () => {
      const result = await useProjectStore.getState().archiveProject('test-1')
      expect(result.status).toBe('archived')
      expect(window.api.projectArchive).toHaveBeenCalledWith('test-1')
    })
  })

  describe('setFilter', () => {
    it('should update filter partially', () => {
      useProjectStore.getState().setFilter({ quick: 'active' })
      expect(useProjectStore.getState().filter.quick).toBe('active')
      expect(useProjectStore.getState().filter.customer).toBeNull()
    })

    it('should update industry filter', () => {
      useProjectStore.getState().setFilter({ industry: '军工' })
      expect(useProjectStore.getState().filter.industry).toBe('军工')
    })
  })

  describe('setSortMode', () => {
    it('should toggle sort mode', () => {
      useProjectStore.getState().setSortMode('updated')
      expect(useProjectStore.getState().sortMode).toBe('updated')
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      useProjectStore.setState({ error: 'some error' })
      useProjectStore.getState().clearError()
      expect(useProjectStore.getState().error).toBeNull()
    })
  })
})
