import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mock Kysely query builder chain ───

const mockExecute = vi.fn()
const mockExecuteTakeFirst = vi.fn()

const queryBuilder = {
  selectAll: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  execute: mockExecute,
  executeTakeFirst: mockExecuteTakeFirst,
}

const insertBuilder = {
  values: vi.fn().mockReturnValue({ execute: mockExecute }),
}

const updateBuilder = {
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst }),
  }),
}

const deleteBuilder = {
  where: vi.fn().mockReturnValue({ executeTakeFirst: mockExecuteTakeFirst }),
}

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    insertInto: vi.fn().mockReturnValue(insertBuilder),
    selectFrom: vi.fn().mockReturnValue(queryBuilder),
    updateTable: vi.fn().mockReturnValue(updateBuilder),
    deleteFrom: vi.fn().mockReturnValue(deleteBuilder),
  }),
}))

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid-1234',
}))

import { TaskRepository } from '@main/db/repositories/task-repo'

describe('TaskRepository @story-2-2', () => {
  let repo: TaskRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new TaskRepository()
    mockExecute.mockResolvedValue([])
  })

  describe('create', () => {
    it('@p0 should create a task with UUID and timestamps', async () => {
      mockExecute.mockResolvedValue(undefined)

      const result = await repo.create({
        category: 'ai-agent',
        agentType: 'parse',
        input: '{"rfpContent":"test"}',
      })

      expect(result.id).toBe('mock-uuid-1234')
      expect(result.category).toBe('ai-agent')
      expect(result.agentType).toBe('parse')
      expect(result.status).toBe('pending')
      expect(result.priority).toBe('normal')
      expect(result.retryCount).toBe(0)
      expect(result.maxRetries).toBe(3)
      expect(result.createdAt).toBeTruthy()
      expect(result.updatedAt).toBeTruthy()
    })
  })

  describe('findById', () => {
    it('@p1 should return task when found', async () => {
      const task = { id: 'task-1', status: 'pending' }
      mockExecuteTakeFirst.mockResolvedValue(task)

      const result = await repo.findById('task-1')
      expect(result).toEqual(task)
    })

    it('@p1 should throw NotFoundError when not found', async () => {
      mockExecuteTakeFirst.mockResolvedValue(undefined)

      await expect(repo.findById('nonexistent')).rejects.toThrow('任务不存在')
    })
  })

  describe('findAll', () => {
    it('@p1 should return all tasks ordered by createdAt desc', async () => {
      const tasks = [{ id: 'task-1' }, { id: 'task-2' }]
      mockExecute.mockResolvedValue(tasks)

      const result = await repo.findAll()
      expect(result).toEqual(tasks)
    })

    it('@p1 should apply filter conditions', async () => {
      mockExecute.mockResolvedValue([])

      await repo.findAll({ status: 'pending', category: 'ai-agent' })

      // where should have been called for each filter
      expect(queryBuilder.where).toHaveBeenCalledWith('status', '=', 'pending')
      expect(queryBuilder.where).toHaveBeenCalledWith('category', '=', 'ai-agent')
    })
  })

  describe('update', () => {
    it('@p0 should update task and return updated record', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 1n })
      const updatedTask = { id: 'task-1', status: 'running' }
      mockExecuteTakeFirst.mockResolvedValueOnce(updatedTask)

      const result = await repo.update('task-1', { status: 'running' })
      expect(result).toEqual(updatedTask)
    })

    it('@p1 should throw NotFoundError when task not found', async () => {
      mockExecuteTakeFirst.mockResolvedValue({ numUpdatedRows: 0n })

      await expect(repo.update('nonexistent', { status: 'running' })).rejects.toThrow('任务不存在')
    })
  })

  describe('delete', () => {
    it('@p1 should delete task', async () => {
      mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: 1n })

      await expect(repo.delete('task-1')).resolves.toBeUndefined()
    })

    it('@p1 should throw NotFoundError when task not found', async () => {
      mockExecuteTakeFirst.mockResolvedValue({ numDeletedRows: 0n })

      await expect(repo.delete('nonexistent')).rejects.toThrow('任务不存在')
    })
  })

  describe('findPending', () => {
    it('@p0 should return pending and running tasks', async () => {
      const tasks = [
        { id: 'task-1', status: 'pending' },
        { id: 'task-2', status: 'running' },
      ]
      mockExecute.mockResolvedValue(tasks)

      const result = await repo.findPending()
      expect(result).toEqual(tasks)
    })
  })
})
