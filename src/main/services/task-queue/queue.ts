import { createLogger } from '@main/utils/logger'
import { TaskQueueError } from '@main/utils/errors'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { TaskRepository } from '@main/db/repositories/task-repo'
import { progressEmitter } from './progress-emitter'
import type { CreateTaskInput, TaskFilter } from '@main/db/repositories/task-repo'
import type { TaskTable } from '@main/db/schema'
import type { TaskRecord } from '@shared/ai-types'

const logger = createLogger('task-queue')

const DEFAULT_TIMEOUT_MS = 900_000 // 15 minutes
const DEFAULT_MAX_CONCURRENCY = 3

/** Context passed to a task executor */
export interface TaskExecutorContext {
  taskId: string
  input: unknown
  signal: AbortSignal
  updateProgress: (progress: number, message?: string) => void
  setCheckpoint: (data: unknown) => Promise<void>
  checkpoint?: unknown
}

/** Function that executes a task */
export type TaskExecutor = (context: TaskExecutorContext) => Promise<unknown>

/** Request to enqueue a new task */
export type EnqueueRequest = {
  category: CreateTaskInput['category']
  agentType?: CreateTaskInput['agentType']
  input: unknown
  priority?: CreateTaskInput['priority']
  maxRetries?: number
  timeoutMs?: number
}

function getRegisteredExecutorKey(
  category: CreateTaskInput['category'] | TaskTable['category'],
  agentType?: CreateTaskInput['agentType'] | TaskTable['agentType']
): string {
  return `${category}:${agentType ?? '*'}`
}

function tableToRecord(row: TaskTable): TaskRecord {
  return {
    id: row.id,
    category: row.category as TaskRecord['category'],
    agentType: (row.agentType as TaskRecord['agentType']) ?? undefined,
    status: row.status as TaskRecord['status'],
    priority: row.priority as TaskRecord['priority'],
    progress: row.progress,
    input: row.input,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    checkpoint: row.checkpoint ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
  }
}

export class TaskQueueService {
  private repo = new TaskRepository()
  private controllers = new Map<string, AbortController>()
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private executors = new Map<string, TaskExecutor>()
  private registeredExecutors = new Map<string, TaskExecutor>()
  private activeCount = 0
  private pendingQueue: Array<{ taskId: string; executor: TaskExecutor; timeoutMs: number }> = []
  private maxConcurrency = DEFAULT_MAX_CONCURRENCY

  async enqueue(request: EnqueueRequest): Promise<string> {
    const task = await this.repo.create({
      category: request.category,
      agentType: request.agentType,
      input: JSON.stringify(request.input),
      priority: request.priority,
      maxRetries: request.maxRetries,
    })
    logger.info(`Task enqueued: ${task.id} category=${task.category} agentType=${task.agentType}`)
    return task.id
  }

  registerExecutor(
    registration: {
      category: CreateTaskInput['category']
      agentType?: CreateTaskInput['agentType']
    },
    executor: TaskExecutor
  ): void {
    const key = getRegisteredExecutorKey(registration.category, registration.agentType)
    this.registeredExecutors.set(key, executor)
    logger.info(`Task executor registered: ${key}`)
  }

  async execute(
    taskId: string,
    executor: TaskExecutor,
    options?: { timeoutMs?: number }
  ): Promise<TaskRecord> {
    const task = await this.repo.findById(taskId)
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

    // Store executor for retry / recovery before queueing.
    this.executors.set(taskId, executor)

    // Check concurrency limit
    if (this.activeCount >= this.maxConcurrency) {
      logger.info(`Task ${taskId} queued — active=${this.activeCount} max=${this.maxConcurrency}`)
      return new Promise<TaskRecord>((resolve, reject) => {
        this.pendingQueue.push({
          taskId,
          executor,
          timeoutMs,
        })
        // We need to resolve when the task eventually completes.
        // Use a polling mechanism via the task's completion.
        const check = async (): Promise<void> => {
          // This will be resolved when the task is dequeued and executed.
          // We attach completion callbacks to the dequeue path.
        }
        // Store resolve/reject for dequeue
        this._pendingCallbacks.set(taskId, { resolve, reject })
        check()
      })
    }

    return this._executeTask(taskId, task, executor, timeoutMs)
  }

  private _pendingCallbacks = new Map<
    string,
    { resolve: (r: TaskRecord) => void; reject: (e: unknown) => void }
  >()

  private async _executeTask(
    taskId: string,
    task: TaskTable,
    executor: TaskExecutor,
    timeoutMs: number
  ): Promise<TaskRecord> {
    this.activeCount++
    const controller = new AbortController()
    this.controllers.set(taskId, controller)

    // Enforce timeout via AbortController
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new Error('AGENT_TIMEOUT'))
      }
    }, timeoutMs)
    this.timeoutTimers.set(taskId, timer)

    try {
      // Update status to running
      await this.repo.update(taskId, { status: 'running' })

      let parsedInput: unknown
      try {
        parsedInput = JSON.parse(task.input)
      } catch {
        parsedInput = task.input
      }

      let parsedCheckpoint: unknown
      if (task.checkpoint) {
        try {
          parsedCheckpoint = JSON.parse(task.checkpoint)
        } catch {
          parsedCheckpoint = task.checkpoint
        }
      }

      const context: TaskExecutorContext = {
        taskId,
        input: parsedInput,
        signal: controller.signal,
        updateProgress: (progress: number, message?: string) => {
          // Fire-and-forget progress update
          this.repo.update(taskId, { progress }).catch((err) => {
            logger.warn(`Failed to persist progress for task ${taskId}`, err)
          })
          progressEmitter.emit({ taskId, progress, message })
        },
        setCheckpoint: async (data: unknown) => {
          await this.repo.update(taskId, { checkpoint: JSON.stringify(data) })
        },
        checkpoint: parsedCheckpoint,
      }

      const result = await executor(context)
      throwIfAborted(controller.signal, `Task ${taskId} cancelled`)

      // Task completed successfully
      const now = new Date().toISOString()
      const updated = await this.repo.update(taskId, {
        status: 'completed',
        progress: 100,
        output: JSON.stringify(result),
        completedAt: now,
      })

      progressEmitter.emit({ taskId, progress: 100 })
      progressEmitter.clear(taskId)
      logger.info(`Task completed: ${taskId}`)

      return tableToRecord(updated)
    } catch (err) {
      // Check if this was an abort (timeout or user cancellation)
      if (controller.signal.aborted || isAbortError(err)) {
        const isTimeout =
          controller.signal.reason instanceof Error &&
          controller.signal.reason.message === 'AGENT_TIMEOUT'
        const now = new Date().toISOString()

        if (isTimeout) {
          const updated = await this.repo.update(taskId, {
            status: 'failed',
            error: 'Task timed out',
            completedAt: now,
          })
          progressEmitter.clear(taskId)
          logger.error(`Task timed out: ${taskId} after ${timeoutMs}ms`)
          return tableToRecord(updated)
        }

        const updated = await this.repo.update(taskId, {
          status: 'cancelled',
          error: 'Task cancelled',
          completedAt: now,
        })
        progressEmitter.clear(taskId)
        logger.info(`Task cancelled: ${taskId}`)
        return tableToRecord(updated)
      }

      // Check retry eligibility
      const currentTask = await this.repo.findById(taskId)
      if (currentTask.retryCount < currentTask.maxRetries) {
        await this.repo.update(taskId, {
          status: 'pending',
          retryCount: currentTask.retryCount + 1,
        })
        logger.info(`Task ${taskId} retry ${currentTask.retryCount + 1}/${currentTask.maxRetries}`)
        // Re-execute
        const retryTask = await this.repo.findById(taskId)
        return this._executeTask(taskId, retryTask, executor, timeoutMs)
      }

      // Max retries exceeded — mark as failed
      const now = new Date().toISOString()
      const errMsg = err instanceof Error ? err.message : String(err)
      const updated = await this.repo.update(taskId, {
        status: 'failed',
        error: errMsg,
        completedAt: now,
      })
      progressEmitter.clear(taskId)
      logger.error(`Task failed: ${taskId} error=${errMsg}`)

      return tableToRecord(updated)
    } finally {
      const existingTimer = this.timeoutTimers.get(taskId)
      if (existingTimer) clearTimeout(existingTimer)
      this.timeoutTimers.delete(taskId)
      this.controllers.delete(taskId)
      this.activeCount--
      this._processQueue()
    }
  }

  private _processQueue(): void {
    while (this.activeCount < this.maxConcurrency && this.pendingQueue.length > 0) {
      const next = this.pendingQueue.shift()!
      const callbacks = this._pendingCallbacks.get(next.taskId)
      this._pendingCallbacks.delete(next.taskId)

      this.repo
        .findById(next.taskId)
        .then((task) => this._executeTask(next.taskId, task, next.executor, next.timeoutMs))
        .then((result) => callbacks?.resolve(result))
        .catch((err) => callbacks?.reject(err))
    }
  }

  async cancel(taskId: string): Promise<void> {
    const task = await this.repo.findById(taskId)
    if (task.status === 'completed' || task.status === 'cancelled' || task.status === 'failed') {
      throw new TaskQueueError(
        ErrorCode.TASK_QUEUE,
        `Cannot cancel task in ${task.status} state: ${taskId}`
      )
    }

    // If task is running, abort it
    const controller = this.controllers.get(taskId)
    if (controller) {
      controller.abort()
      // The executor catch block will handle status update
      return
    }

    // If task is pending (not yet running), directly update status
    const now = new Date().toISOString()
    await this.repo.update(taskId, {
      status: 'cancelled',
      error: 'Task cancelled',
      completedAt: now,
    })
    progressEmitter.clear(taskId)

    // Remove from pending queue if present
    const idx = this.pendingQueue.findIndex((p) => p.taskId === taskId)
    if (idx !== -1) {
      this.pendingQueue.splice(idx, 1)
      const callbacks = this._pendingCallbacks.get(taskId)
      this._pendingCallbacks.delete(taskId)
      if (callbacks) {
        const updated = await this.repo.findById(taskId)
        callbacks.resolve(tableToRecord(updated))
      }
    }

    logger.info(`Task cancelled: ${taskId}`)
  }

  async retry(taskId: string): Promise<string> {
    const task = await this.repo.findById(taskId)
    const executor = this.executors.get(taskId) ?? this._resolveRegisteredExecutor(task)
    if (!executor) {
      throw new TaskQueueError(
        ErrorCode.TASK_QUEUE,
        `No executor registered for task: ${taskId}. Task cannot be retried after process restart.`
      )
    }
    this.executors.set(taskId, executor)
    await this.repo.update(taskId, {
      status: 'pending',
      retryCount: task.retryCount + 1,
      error: null,
      completedAt: null,
    })
    logger.info(`Task queued for retry: ${taskId}`)
    // Re-execute the task
    this.execute(taskId, executor).catch((err) => {
      logger.error(`Retry execution failed for task ${taskId}:`, err)
    })
    return taskId
  }

  async getStatus(taskId: string): Promise<TaskRecord> {
    const task = await this.repo.findById(taskId)
    return tableToRecord(task)
  }

  async listTasks(filter?: TaskFilter): Promise<TaskRecord[]> {
    const tasks = await this.repo.findAll(filter)
    return tasks.map(tableToRecord)
  }

  async updateProgress(taskId: string, progress: number, message?: string): Promise<void> {
    await this.repo.update(taskId, { progress })
    progressEmitter.emit({ taskId, progress, message })
  }

  private _resolveRegisteredExecutor(
    task: Pick<TaskTable, 'id' | 'category' | 'agentType'>
  ): TaskExecutor | undefined {
    const registered =
      this.registeredExecutors.get(getRegisteredExecutorKey(task.category, task.agentType)) ??
      this.registeredExecutors.get(getRegisteredExecutorKey(task.category))

    if (!registered) {
      logger.warn(
        `No registered executor found for task ${task.id} type=${task.category}:${task.agentType ?? '*'}`
      )
    }

    return registered
  }

  async recoverPendingTasks(): Promise<void> {
    const tasks = await this.repo.findPending()
    let recovered = 0
    let reDispatched = 0
    for (const task of tasks) {
      let recoveredTask = task
      if (task.status === 'running') {
        recoveredTask = await this.repo.update(task.id, { status: 'pending' })
        recovered++
      }
      const executor =
        this.executors.get(recoveredTask.id) ?? this._resolveRegisteredExecutor(recoveredTask)
      if (!executor) {
        continue
      }

      this.executors.set(recoveredTask.id, executor)
      this.execute(recoveredTask.id, executor).catch((err) => {
        logger.error(`Recovery re-dispatch failed for task ${recoveredTask.id}:`, err)
      })
      reDispatched++
    }
    if (recovered > 0) {
      logger.info(`Recovered ${recovered} interrupted tasks to pending state`)
    }
    if (reDispatched > 0) {
      logger.info(`Re-dispatched ${reDispatched} pending tasks with registered executors`)
    }
  }
}
