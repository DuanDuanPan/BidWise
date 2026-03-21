import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTodoStore } from '@renderer/stores/todoStore'
import type { ApiResponse, ProjectWithPriority } from '@shared/ipc-types'

const mockTodoItems: ProjectWithPriority[] = [
  {
    id: 'p1',
    name: 'A标',
    customerName: '客户A',
    industry: '军工',
    deadline: '2026-03-22T00:00:00.000Z',
    sopStage: 'delivery',
    status: 'active',
    updatedAt: '2026-03-20T00:00:00.000Z',
    priorityScore: 97,
    nextAction: '导出交付物',
  },
]

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    projectListWithPriority: vi
      .fn<() => Promise<ApiResponse<ProjectWithPriority[]>>>()
      .mockResolvedValue({
        success: true,
        data: mockTodoItems,
      }),
    ...overrides,
  })
}

describe('todoStore', () => {
  beforeEach(() => {
    useTodoStore.setState({
      todoItems: [],
      loading: false,
      error: null,
    })
    mockApi()
  })

  describe('loadTodos', () => {
    it('should load todos from API', async () => {
      await useTodoStore.getState().loadTodos()
      expect(useTodoStore.getState().todoItems).toHaveLength(1)
      expect(useTodoStore.getState().todoItems[0].name).toBe('A标')
      expect(useTodoStore.getState().loading).toBe(false)
    })

    it('should set loading during fetch', async () => {
      const promise = useTodoStore.getState().loadTodos()
      expect(useTodoStore.getState().loading).toBe(true)
      await promise
      expect(useTodoStore.getState().loading).toBe(false)
    })

    it('should set error on API failure', async () => {
      mockApi({
        projectListWithPriority: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'DATABASE', message: '数据库错误' },
        }),
      })
      await useTodoStore.getState().loadTodos()
      expect(useTodoStore.getState().error).toBe('数据库错误')
      expect(useTodoStore.getState().loading).toBe(false)
    })

    it('should handle network errors', async () => {
      mockApi({
        projectListWithPriority: vi.fn().mockRejectedValue(new Error('网络异常')),
      })
      await useTodoStore.getState().loadTodos()
      expect(useTodoStore.getState().error).toBe('网络异常')
      expect(useTodoStore.getState().loading).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      useTodoStore.setState({ error: '一些错误' })
      useTodoStore.getState().clearError()
      expect(useTodoStore.getState().error).toBeNull()
    })
  })
})
