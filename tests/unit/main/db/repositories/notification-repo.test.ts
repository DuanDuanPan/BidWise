import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelectFrom = vi.fn()
const mockInsertInto = vi.fn()
const mockUpdateTable = vi.fn()

let selectResult: unknown = []
let selectFirstResult: unknown = undefined
const insertResult: unknown = undefined
let updateResult: unknown = { numUpdatedRows: 1n }

const createChain = (
  getResult: () => unknown,
  getFirstResult?: () => unknown
): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (_target, prop) => {
      if (prop === 'execute') return () => Promise.resolve(getResult())
      if (prop === 'executeTakeFirst')
        return () => Promise.resolve(getFirstResult ? getFirstResult() : getResult())
      return () => proxy
    },
  })
  return proxy
}

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    selectFrom: (...args: unknown[]) => {
      mockSelectFrom(...args)
      return createChain(
        () => selectResult,
        () => selectFirstResult
      )
    },
    insertInto: (...args: unknown[]) => {
      mockInsertInto(...args)
      return createChain(() => insertResult)
    },
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args)
      return createChain(() => updateResult)
    },
  }),
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  class DatabaseError extends BidWiseError {
    constructor(message: string, _cause?: unknown) {
      super('DATABASE', message)
    }
  }
  class NotFoundError extends BidWiseError {
    constructor(message: string) {
      super('NOT_FOUND', message)
    }
  }
  return { BidWiseError, DatabaseError, NotFoundError }
})

vi.mock('uuid', () => ({ v4: () => 'generated-notification-id' }))

import { NotificationRepository } from '@main/db/repositories/notification-repo'
import { NotFoundError } from '@main/utils/errors'

describe('NotificationRepository', () => {
  let repo: NotificationRepository

  beforeEach(() => {
    vi.clearAllMocks()
    selectResult = []
    selectFirstResult = undefined
    updateResult = { numUpdatedRows: 1n }
    repo = new NotificationRepository()
  })

  describe('create', () => {
    it('inserts a notification and returns record with read=false', async () => {
      const result = await repo.create({
        projectId: 'proj-1',
        projectName: 'Test Project',
        sectionId: 'section-1',
        annotationId: 'ann-1',
        targetUser: 'user:zhang-zong',
        type: 'decision-requested',
        title: '请求指导',
        summary: 'Test summary',
      })

      expect(mockInsertInto).toHaveBeenCalledWith('notifications')
      expect(result.id).toBe('generated-notification-id')
      expect(result.read).toBe(false)
      expect(result.projectName).toBe('Test Project')
      expect(result.type).toBe('decision-requested')
    })
  })

  describe('listByUser', () => {
    it('returns notifications for target user', async () => {
      selectResult = [
        { id: 'n-1', targetUser: 'user:zhang-zong', read: 0 },
        { id: 'n-2', targetUser: 'user:zhang-zong', read: 1 },
      ]

      const result = await repo.listByUser('user:zhang-zong')

      expect(mockSelectFrom).toHaveBeenCalledWith('notifications')
      expect(result).toHaveLength(2)
      expect(result[0].read).toBe(false)
      expect(result[1].read).toBe(true)
    })

    it('filters unread-only when specified', async () => {
      selectResult = [{ id: 'n-1', targetUser: 'user:zhang-zong', read: 0 }]

      const result = await repo.listByUser('user:zhang-zong', true)

      expect(mockSelectFrom).toHaveBeenCalledWith('notifications')
      expect(result).toHaveLength(1)
    })
  })

  describe('markRead', () => {
    it('marks notification as read and returns updated record', async () => {
      selectFirstResult = { id: 'n-1', read: 1, targetUser: 'user:zhang-zong' }

      const result = await repo.markRead('n-1')

      expect(mockUpdateTable).toHaveBeenCalledWith('notifications')
      expect(result.read).toBe(true)
    })

    it('throws NotFoundError when notification does not exist', async () => {
      updateResult = { numUpdatedRows: 0n }

      await expect(repo.markRead('missing')).rejects.toThrow(NotFoundError)
    })
  })

  describe('markAllRead', () => {
    it('updates all unread notifications for target user', async () => {
      await repo.markAllRead('user:zhang-zong')

      expect(mockUpdateTable).toHaveBeenCalledWith('notifications')
    })
  })

  describe('countUnread', () => {
    it('returns count of unread notifications', async () => {
      selectFirstResult = { count: 5 }

      const result = await repo.countUnread('user:zhang-zong')

      expect(mockSelectFrom).toHaveBeenCalledWith('notifications')
      expect(result).toBe(5)
    })
  })
})
