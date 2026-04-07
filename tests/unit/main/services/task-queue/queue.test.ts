import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Hoisted mocks (available inside vi.mock factories) ───

const {
  mockCreate,
  mockFindById,
  mockFindAll,
  mockUpdate,
  mockFindPending,
  mockEmit,
  mockClear,
  mockLoggerInfo,
  mockLoggerWarn,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindById: vi.fn(),
  mockFindAll: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindPending: vi.fn(),
  mockEmit: vi.fn(),
  mockClear: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  }),
}))

vi.mock('@main/db/repositories/task-repo', () => {
  return {
    TaskRepository: class MockTaskRepository {
      create = mockCreate
      findById = mockFindById
      findAll = mockFindAll
      update = mockUpdate
      findPending = mockFindPending
    },
  }
})

vi.mock('@main/services/task-queue/progress-emitter', () => ({
  progressEmitter: {
    emit: (...args: unknown[]) => mockEmit(...args),
    clear: (...args: unknown[]) => mockClear(...args),
  },
}))

import { TaskQueueService } from '@main/services/task-queue/queue'
import type { TaskExecutor } from '@main/services/task-queue/queue'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    category: 'ai-agent',
    agentType: 'parse',
    status: 'pending',
    priority: 'normal',
    progress: 0,
    input: '{"rfpContent":"test"}',
    output: null,
    error: null,
    retryCount: 0,
    maxRetries: 3,
    checkpoint: null,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

describe('TaskQueueService @story-2-2', () => {
  let queue: TaskQueueService

  beforeEach(() => {
    vi.clearAllMocks()
    queue = new TaskQueueService()
  })

  describe('enqueue', () => {
    it('@p0 should create a task record and return taskId', async () => {
      const task = makeTask()
      mockCreate.mockResolvedValue(task)

      const taskId = await queue.enqueue({
        category: 'ai-agent',
        agentType: 'parse',
        input: { rfpContent: 'test' },
      })

      expect(taskId).toBe('task-1')
      expect(mockCreate).toHaveBeenCalledWith({
        category: 'ai-agent',
        agentType: 'parse',
        input: '{"rfpContent":"test"}',
        priority: undefined,
        maxRetries: undefined,
      })
    })
  })

  describe('execute', () => {
    it('@p0 should update status pending → running → completed', async () => {
      const task = makeTask()
      mockFindById.mockResolvedValue(task)
      const completedTask = makeTask({ status: 'completed', progress: 100 })
      mockUpdate.mockResolvedValue(completedTask)

      const executor: TaskExecutor = async () => ({ result: 'ok' })

      const result = await queue.execute('task-1', executor)
      expect(result.status).toBe('completed')
      expect(result.progress).toBe(100)

      // Verify running update was called
      expect(mockUpdate).toHaveBeenCalledWith('task-1', { status: 'running' })
    })

    it('@p0 should retry on failure when retryCount < maxRetries', async () => {
      const task = makeTask({ retryCount: 0, maxRetries: 2 })
      const retryTask = makeTask({ retryCount: 1, maxRetries: 2 })
      const completedTask = makeTask({ status: 'completed', progress: 100 })

      mockFindById
        .mockResolvedValueOnce(task) // initial execute
        .mockResolvedValueOnce(task) // retry check
        .mockResolvedValueOnce(retryTask) // re-execute findById
        .mockResolvedValueOnce(retryTask) // any further calls

      mockUpdate.mockResolvedValue(completedTask)

      let attempts = 0
      const executor: TaskExecutor = async () => {
        attempts++
        if (attempts < 2) throw new Error('transient')
        return { result: 'ok' }
      }

      const result = await queue.execute('task-1', executor)
      expect(result.status).toBe('completed')
      expect(attempts).toBe(2)
    })

    it('@p0 should mark as failed when retryCount >= maxRetries', async () => {
      const task = makeTask({ retryCount: 3, maxRetries: 3 })
      mockFindById.mockResolvedValue(task)
      const failedTask = makeTask({ status: 'failed', error: 'permanent' })
      mockUpdate.mockResolvedValue(failedTask)

      const executor: TaskExecutor = async () => {
        throw new Error('permanent')
      }

      const result = await queue.execute('task-1', executor)
      expect(result.status).toBe('failed')
    })

    it('@p1 should trigger progressEmitter on progress update', async () => {
      const task = makeTask()
      mockFindById.mockResolvedValue(task)
      const completedTask = makeTask({ status: 'completed', progress: 100 })
      mockUpdate.mockResolvedValue(completedTask)

      const executor: TaskExecutor = async (ctx) => {
        ctx.updateProgress(50, 'halfway')
        return { result: 'ok' }
      }

      await queue.execute('task-1', executor)

      expect(mockEmit).toHaveBeenCalledWith({ taskId: 'task-1', progress: 50, message: 'halfway' })
      expect(mockEmit).toHaveBeenCalledWith({
        taskId: 'task-1',
        progress: 100,
        message: 'halfway',
      })
    })

    it('@p1 should persist checkpoint via setCheckpoint', async () => {
      const task = makeTask()
      mockFindById.mockResolvedValue(task)
      const completedTask = makeTask({ status: 'completed' })
      mockUpdate.mockResolvedValue(completedTask)

      const executor: TaskExecutor = async (ctx) => {
        await ctx.setCheckpoint({ page: 5 })
        return { result: 'ok' }
      }

      await queue.execute('task-1', executor)

      expect(mockUpdate).toHaveBeenCalledWith('task-1', {
        checkpoint: '{"page":5}',
      })
    })

    it('@p1 should pass checkpoint to executor on recovery', async () => {
      const task = makeTask({ checkpoint: '{"page":5}' })
      mockFindById.mockResolvedValue(task)
      const completedTask = makeTask({ status: 'completed' })
      mockUpdate.mockResolvedValue(completedTask)

      let receivedCheckpoint: unknown
      const executor: TaskExecutor = async (ctx) => {
        receivedCheckpoint = ctx.checkpoint
        return { result: 'ok' }
      }

      await queue.execute('task-1', executor)
      expect(receivedCheckpoint).toEqual({ page: 5 })
    })

    it('@p0 should mark task as cancelled when executor returns after abort', async () => {
      mockFindById.mockResolvedValue(makeTask())
      mockUpdate.mockImplementation(async (_taskId, input) =>
        makeTask(input as Record<string, unknown>)
      )

      let releaseAfterAbort: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        releaseAfterAbort = resolve
      })

      const executor: TaskExecutor = async (ctx) => {
        ctx.signal.addEventListener('abort', () => releaseAfterAbort?.(), { once: true })
        await started
        return { result: 'late-success' }
      }

      const execution = queue.execute('task-1', executor)
      await Promise.resolve()
      await queue.cancel('task-1')

      const result = await execution
      expect(result.status).toBe('cancelled')
      expect(mockUpdate).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          status: 'cancelled',
          error: 'Task cancelled',
        })
      )
    })
    it('@p0 should mark a timed out task as failed', async () => {
      vi.useFakeTimers()

      mockFindById.mockResolvedValue(makeTask({ retryCount: 3, maxRetries: 3 }))
      mockUpdate.mockImplementation(async (_taskId, input) =>
        makeTask(input as Record<string, unknown>)
      )

      const executor: TaskExecutor = async (ctx) =>
        new Promise<unknown>((_, reject) => {
          ctx.signal.addEventListener(
            'abort',
            () => reject(ctx.signal.reason ?? new Error('aborted')),
            { once: true }
          )
        })

      const execution = queue.execute('task-1', executor)

      await vi.advanceTimersByTimeAsync(900_000)
      const result = await execution

      expect(result.status).toBe('failed')
      expect(result.error).toBe('Task timed out')
      expect(mockUpdate).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          status: 'failed',
          error: 'Task timed out',
        })
      )

      vi.useRealTimers()
    })
  })

  describe('cancel', () => {
    it('@p1 should throw when cancelling a completed task', async () => {
      mockFindById.mockResolvedValue(makeTask({ status: 'completed' }))

      await expect(queue.cancel('task-1')).rejects.toThrow('Cannot cancel task')
    })

    it('@p1 should throw when cancelling an already cancelled task', async () => {
      mockFindById.mockResolvedValue(makeTask({ status: 'cancelled' }))

      await expect(queue.cancel('task-1')).rejects.toThrow('Cannot cancel task')
    })

    it('@p0 should update pending task to cancelled', async () => {
      mockFindById.mockResolvedValue(makeTask({ status: 'pending' }))
      mockUpdate.mockResolvedValue(makeTask({ status: 'cancelled' }))

      await queue.cancel('task-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          status: 'cancelled',
          error: 'Task cancelled',
        })
      )
    })
  })

  describe('recoverPendingTasks', () => {
    it('@p1 should reset running tasks to pending', async () => {
      mockFindPending.mockResolvedValue([
        makeTask({ id: 'task-1', status: 'running' }),
        makeTask({ id: 'task-2', status: 'pending' }),
      ])
      mockUpdate.mockResolvedValue(makeTask())

      await queue.recoverPendingTasks()

      // Only running task should be reset
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate).toHaveBeenCalledWith('task-1', { status: 'pending' })
    })

    it('@p1 should re-dispatch recovered tasks with registered executors', async () => {
      const executor: TaskExecutor = vi.fn(async () => ({ result: 'ok' }))
      queue.registerExecutor({ category: 'ai-agent', agentType: 'parse' }, executor)
      mockFindPending.mockResolvedValue([
        makeTask({ id: 'task-1', status: 'running' }),
        makeTask({ id: 'task-2', status: 'pending' }),
      ])
      mockUpdate.mockImplementation(async (taskId, input) =>
        makeTask({ id: taskId, ...((input as Record<string, unknown>) ?? {}) })
      )

      const executeSpy = vi
        .spyOn(queue, 'execute')
        .mockResolvedValue(makeTask({ status: 'completed' }) as never)

      await queue.recoverPendingTasks()

      expect(mockUpdate).toHaveBeenCalledWith('task-1', { status: 'pending' })
      expect(executeSpy).toHaveBeenCalledTimes(2)
      expect(executeSpy).toHaveBeenCalledWith('task-1', executor)
      expect(executeSpy).toHaveBeenCalledWith('task-2', executor)
    })

    it('@p1 should warn when recovered task type has no registered executor', async () => {
      mockFindPending.mockResolvedValue([makeTask({ id: 'task-9', agentType: 'generate' })])

      await queue.recoverPendingTasks()

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('No registered executor found for task task-9')
      )
    })
  })

  describe('getStatus', () => {
    it('@p1 should return task record', async () => {
      mockFindById.mockResolvedValue(makeTask())

      const status = await queue.getStatus('task-1')
      expect(status.id).toBe('task-1')
      expect(status.status).toBe('pending')
    })
  })

  describe('listTasks', () => {
    it('@p1 should return task records with filter', async () => {
      mockFindAll.mockResolvedValue([makeTask()])

      const tasks = await queue.listTasks({ status: 'pending' })
      expect(tasks).toHaveLength(1)
      expect(mockFindAll).toHaveBeenCalledWith({ status: 'pending' })
    })
  })

  describe('@story-3-4 per-task timeout', () => {
    it('@p0 should use custom timeoutMs when provided via options', async () => {
      vi.useFakeTimers()

      mockFindById.mockResolvedValue(makeTask({ retryCount: 3, maxRetries: 3 }))
      mockUpdate.mockImplementation(async (_taskId, input) =>
        makeTask(input as Record<string, unknown>)
      )

      const executor: TaskExecutor = async (ctx) =>
        new Promise<unknown>((_, reject) => {
          ctx.signal.addEventListener(
            'abort',
            () => reject(ctx.signal.reason ?? new Error('aborted')),
            { once: true }
          )
        })

      // Use a short 5-second timeout instead of the 15-minute default
      const execution = queue.execute('task-1', executor, { timeoutMs: 5_000 })

      // Advance past the custom timeout but well before the default
      await vi.advanceTimersByTimeAsync(5_000)
      const result = await execution

      expect(result.status).toBe('failed')
      expect(result.error).toBe('Task timed out')

      vi.useRealTimers()
    })

    it('@p1 should fall back to default timeout when options.timeoutMs is not provided', async () => {
      vi.useFakeTimers()

      mockFindById.mockResolvedValue(makeTask({ retryCount: 3, maxRetries: 3 }))
      mockUpdate.mockImplementation(async (_taskId, input) =>
        makeTask(input as Record<string, unknown>)
      )

      const executor: TaskExecutor = async (ctx) =>
        new Promise<unknown>((_, reject) => {
          ctx.signal.addEventListener(
            'abort',
            () => reject(ctx.signal.reason ?? new Error('aborted')),
            { once: true }
          )
        })

      // Execute without custom timeout — default 15 min should apply
      const execution = queue.execute('task-1', executor)

      // 5 seconds should NOT trigger timeout
      await vi.advanceTimersByTimeAsync(5_000)

      // 15 minutes (900_000ms) should trigger timeout
      await vi.advanceTimersByTimeAsync(895_000)
      const result = await execution

      expect(result.status).toBe('failed')
      expect(result.error).toBe('Task timed out')

      vi.useRealTimers()
    })
  })

  describe('concurrency', () => {
    it('@p1 should queue 4th task when 3 are running', async () => {
      const task = makeTask()
      mockFindById.mockResolvedValue(task)
      const completedTask = makeTask({ status: 'completed', progress: 100 })
      mockUpdate.mockResolvedValue(completedTask)

      const resolvers: Array<(v: unknown) => void> = []

      const slowExecutor: TaskExecutor = async () => {
        return new Promise<unknown>((resolve) => {
          resolvers.push(resolve)
        })
      }

      // Start 3 tasks that block
      const p1 = queue.execute('task-1', slowExecutor)
      const p2 = queue.execute('task-2', slowExecutor)
      const p3 = queue.execute('task-3', slowExecutor)

      // Wait for them to start
      await new Promise((r) => setTimeout(r, 50))

      // 4th task should be queued
      const p4 = queue.execute('task-4', slowExecutor)

      // Wait a bit for event loop
      await new Promise((r) => setTimeout(r, 50))

      // 3 resolvers so far (4th hasn't started)
      expect(resolvers).toHaveLength(3)

      // Complete first task
      resolvers[0]({ result: 'ok' })
      await p1

      // Wait for queue processing
      await new Promise((r) => setTimeout(r, 50))

      // Now 4th should have started
      expect(resolvers).toHaveLength(4)

      // Complete remaining
      resolvers[1]({ result: 'ok' })
      resolvers[2]({ result: 'ok' })
      resolvers[3]({ result: 'ok' })
      await Promise.all([p2, p3, p4])
    })
  })

  describe('retry', () => {
    it('@p1 should reset task state and re-dispatch execution', async () => {
      const task = makeTask({
        status: 'failed',
        retryCount: 1,
        error: 'boom',
        completedAt: '2026-03-20T01:00:00.000Z',
      })
      const executor: TaskExecutor = vi.fn(async () => ({ result: 'ok' }))

      mockFindById.mockResolvedValue(task)
      mockUpdate.mockResolvedValue(makeTask({ status: 'pending', retryCount: 2 }))

      queue.registerExecutor({ category: 'ai-agent', agentType: 'parse' }, executor)
      const executeSpy = vi
        .spyOn(queue, 'execute')
        .mockResolvedValue(makeTask({ status: 'completed' }) as never)

      const taskId = await queue.retry('task-1')

      expect(taskId).toBe('task-1')
      expect(mockUpdate).toHaveBeenCalledWith('task-1', {
        status: 'pending',
        retryCount: 2,
        error: null,
        completedAt: null,
      })
      expect(executeSpy).toHaveBeenCalledWith('task-1', executor)
    })
  })
})
