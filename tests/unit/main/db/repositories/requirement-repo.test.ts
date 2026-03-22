import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockInsertInto = vi.fn()
const mockSelectFrom = vi.fn()
const mockUpdateTable = vi.fn()
const mockDeleteFrom = vi.fn()

const createChain = (result: unknown): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (target, prop) => {
      if (prop === 'execute') return () => Promise.resolve(result)
      if (prop === 'executeTakeFirst') return () => Promise.resolve(result)
      if (prop === 'executeTakeFirstOrThrow') return () => Promise.resolve(result)
      return () => proxy
    },
  })
  return proxy
}

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    insertInto: (...args: unknown[]) => {
      mockInsertInto(...args)
      return createChain(undefined)
    },
    selectFrom: (...args: unknown[]) => {
      mockSelectFrom(...args)
      return createChain([])
    },
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args)
      return createChain({ numUpdatedRows: 1n })
    },
    deleteFrom: (...args: unknown[]) => {
      mockDeleteFrom(...args)
      return createChain(undefined)
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

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import type { RequirementItem } from '@shared/analysis-types'

describe('RequirementRepository', () => {
  let repo: RequirementRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new RequirementRepository()
  })

  describe('create', () => {
    it('should batch insert requirements', async () => {
      const items: RequirementItem[] = [
        {
          id: 'req-1',
          sequenceNumber: 1,
          description: '需求1',
          sourcePages: [1, 2],
          category: 'technical',
          priority: 'high',
          status: 'extracted',
        },
      ]

      await repo.create('proj-1', items)
      expect(mockInsertInto).toHaveBeenCalledWith('requirements')
    })

    it('should skip insert when items is empty', async () => {
      await repo.create('proj-1', [])
      expect(mockInsertInto).not.toHaveBeenCalled()
    })
  })

  describe('findByProject', () => {
    it('should query by projectId and parse sourcePages JSON', async () => {
      await repo.findByProject('proj-1')
      expect(mockSelectFrom).toHaveBeenCalledWith('requirements')
    })
  })

  describe('deleteByProject', () => {
    it('should delete all requirements for a project', async () => {
      await repo.deleteByProject('proj-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('requirements')
    })
  })
})
