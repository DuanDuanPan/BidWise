import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

const mockHandle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
    }
  },
  NotFoundError: class NotFoundError extends Error {
    code = 'NOT_FOUND'
    constructor(message: string) {
      super(message)
      this.name = 'NotFoundError'
    }
  },
}))

const mockListTasks = vi.fn()
const mockCancel = vi.fn()
const mockGetStatus = vi.fn()

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    listTasks: (...args: unknown[]) => mockListTasks(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
  },
}))

import { registerTaskHandlers } from '@main/ipc/task-handlers'

describe('task-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register task:list, task:cancel, and task:get-status handlers', () => {
    registerTaskHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('task:list')
    expect(registeredChannels).toContain('task:cancel')
    expect(registeredChannels).toContain('task:get-status')
  })

  it('task:list handler should dispatch to taskQueue.listTasks', async () => {
    registerTaskHandlers()

    const listHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:list')?.[1]
    expect(listHandler).toBeDefined()

    const mockTasks = [{ id: 'task-1', status: 'pending' }]
    mockListTasks.mockResolvedValue(mockTasks)

    const result = await listHandler({}, { status: 'pending' })

    expect(result).toEqual({ success: true, data: mockTasks })
    expect(mockListTasks).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('task:list handler should handle void input', async () => {
    registerTaskHandlers()

    const listHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:list')?.[1]

    mockListTasks.mockResolvedValue([])

    const result = await listHandler({}, undefined)

    expect(result).toEqual({ success: true, data: [] })
    expect(mockListTasks).toHaveBeenCalledWith(undefined)
  })

  it('task:cancel handler should dispatch to taskQueue.cancel', async () => {
    registerTaskHandlers()

    const cancelHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:cancel')?.[1]
    expect(cancelHandler).toBeDefined()

    mockCancel.mockResolvedValue(undefined)

    const result = await cancelHandler({}, 'task-1')

    expect(result).toEqual({ success: true, data: undefined })
    expect(mockCancel).toHaveBeenCalledWith('task-1')
  })

  it('task:get-status handler should return TaskRecord for existing task', async () => {
    registerTaskHandlers()

    const handler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:get-status')?.[1]
    expect(handler).toBeDefined()

    const mockTask = { id: 'task-1', status: 'running', progress: 50 }
    mockGetStatus.mockResolvedValue(mockTask)

    const result = await handler({}, { taskId: 'task-1' })

    expect(result).toEqual({ success: true, data: mockTask })
    expect(mockGetStatus).toHaveBeenCalledWith('task-1')
  })

  it('task:get-status handler should return null for non-existent task', async () => {
    registerTaskHandlers()

    const handler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:get-status')?.[1]

    const { NotFoundError } = await import('@main/utils/errors')
    mockGetStatus.mockRejectedValue(new NotFoundError('任务不存在'))

    const result = await handler({}, { taskId: 'nonexistent' })

    expect(result).toEqual({ success: true, data: null })
  })

  it('should wrap errors as ApiResponse error format', async () => {
    registerTaskHandlers()

    const cancelHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'task:cancel')?.[1]

    const { BidWiseError } = await import('@main/utils/errors')
    mockCancel.mockRejectedValue(new BidWiseError('TASK_QUEUE', 'Cannot cancel'))

    const result = await cancelHandler({}, 'task-1')

    expect(result).toEqual({
      success: false,
      error: { code: 'TASK_QUEUE', message: 'Cannot cancel' },
    })
  })
})
