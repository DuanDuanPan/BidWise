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
}))

const mockListTasks = vi.fn()
const mockCancel = vi.fn()

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    listTasks: (...args: unknown[]) => mockListTasks(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
  },
}))

import { registerTaskHandlers } from '@main/ipc/task-handlers'

describe('task-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register task:list and task:cancel handlers', () => {
    registerTaskHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('task:list')
    expect(registeredChannels).toContain('task:cancel')
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
