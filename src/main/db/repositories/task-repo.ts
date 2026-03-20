import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { TaskTable } from '../schema'
import type { TaskStatus, TaskCategory, AgentType, TaskPriority } from '@shared/ai-types'

export type CreateTaskInput = {
  category: TaskCategory
  agentType?: AgentType
  input: string
  priority?: TaskPriority
  maxRetries?: number
}

export type UpdateTaskInput = {
  status?: TaskStatus
  progress?: number
  output?: string | null
  error?: string | null
  checkpoint?: string
  retryCount?: number
  completedAt?: string | null
}

export type TaskFilter = {
  status?: TaskStatus
  category?: TaskCategory
  agentType?: AgentType
}

export class TaskRepository {
  async create(input: CreateTaskInput): Promise<TaskTable> {
    const now = new Date().toISOString()
    const task: TaskTable = {
      id: uuidv4(),
      category: input.category,
      agentType: input.agentType ?? null,
      status: 'pending',
      priority: input.priority ?? 'normal',
      progress: 0,
      input: input.input,
      output: null,
      error: null,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 3,
      checkpoint: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
    try {
      await getDb().insertInto('tasks').values(task).execute()
      return task
    } catch (err) {
      throw new DatabaseError(`任务创建失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<TaskTable> {
    try {
      const task = await getDb()
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (!task) throw new NotFoundError(`任务不存在: ${id}`)
      return task
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`任务查询失败: ${(err as Error).message}`, err)
    }
  }

  async findAll(filter?: TaskFilter): Promise<TaskTable[]> {
    try {
      let query = getDb().selectFrom('tasks').selectAll()
      if (filter?.status) {
        query = query.where('status', '=', filter.status)
      }
      if (filter?.category) {
        query = query.where('category', '=', filter.category)
      }
      if (filter?.agentType) {
        query = query.where('agentType', '=', filter.agentType)
      }
      return await query.orderBy('createdAt', 'desc').execute()
    } catch (err) {
      throw new DatabaseError(`任务列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async update(id: string, input: UpdateTaskInput): Promise<TaskTable> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('tasks')
        .set({ ...input, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()
      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`任务不存在: ${id}`)
      }
      return this.findById(id)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`任务更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await getDb().deleteFrom('tasks').where('id', '=', id).executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        throw new NotFoundError(`任务不存在: ${id}`)
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`任务删除失败: ${(err as Error).message}`, err)
    }
  }

  async findPending(): Promise<TaskTable[]> {
    try {
      return await getDb()
        .selectFrom('tasks')
        .selectAll()
        .where((eb) => eb.or([eb('status', '=', 'pending'), eb('status', '=', 'running')]))
        .orderBy('createdAt', 'asc')
        .execute()
    } catch (err) {
      throw new DatabaseError(`查询待处理任务失败: ${(err as Error).message}`, err)
    }
  }
}
