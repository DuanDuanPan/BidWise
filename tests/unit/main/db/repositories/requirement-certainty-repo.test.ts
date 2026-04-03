import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockDeleteFrom = vi.fn()
const mockInsertInto = vi.fn()
const mockSelectFrom = vi.fn()
const mockUpdateTable = vi.fn()
const mockTransaction = vi.fn()

const createChain = (result: unknown): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (_, prop) => {
      if (prop === 'execute') return () => Promise.resolve(result)
      if (prop === 'executeTakeFirst') return () => Promise.resolve(result)
      if (prop === 'executeTakeFirstOrThrow')
        return () => {
          if (result === undefined) throw new Error('no result')
          return Promise.resolve(result)
        }
      return (..._args: unknown[]) => proxy
    },
  })
  return proxy
}

// Default chain results — tests override via mockReturnValue / mockImplementation
let selectResult: unknown = []
let updateResult: unknown = { numUpdatedRows: 1n }

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    deleteFrom: (...args: unknown[]) => {
      mockDeleteFrom(...args)
      return createChain(undefined)
    },
    insertInto: (...args: unknown[]) => {
      mockInsertInto(...args)
      return createChain(undefined)
    },
    selectFrom: (...args: unknown[]) => {
      mockSelectFrom(...args)
      return createChain(selectResult)
    },
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args)
      return createChain(updateResult)
    },
    transaction: () => ({
      execute: (fn: unknown) => mockTransaction(fn),
    }),
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

import { RequirementCertaintyRepository } from '@main/db/repositories/requirement-certainty-repo'
import { NotFoundError } from '@main/utils/errors'

describe('RequirementCertaintyRepository', () => {
  let repo: RequirementCertaintyRepository

  beforeEach(() => {
    vi.clearAllMocks()
    selectResult = []
    updateResult = { numUpdatedRows: 1n }
    repo = new RequirementCertaintyRepository()
  })

  describe('replaceByProject', () => {
    it('should call transaction with delete + insert', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const trx = {
          deleteFrom: (...args: unknown[]) => {
            mockDeleteFrom(...args)
            return createChain(undefined)
          },
          insertInto: (...args: unknown[]) => {
            mockInsertInto(...args)
            return createChain(undefined)
          },
        }
        return fn(trx)
      })

      const items = [
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'risky' as const,
          reason: 'unclear scope',
          suggestion: 'clarify with client',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]

      await repo.replaceByProject('proj-1', items)

      expect(mockTransaction).toHaveBeenCalledOnce()
      expect(mockDeleteFrom).toHaveBeenCalledWith('requirementCertainties')
      expect(mockInsertInto).toHaveBeenCalledWith('requirementCertainties')
    })

    it('should skip insert when items array is empty', async () => {
      mockTransaction.mockImplementation(async (fn) => {
        const trx = {
          deleteFrom: (...args: unknown[]) => {
            mockDeleteFrom(...args)
            return createChain(undefined)
          },
          insertInto: (...args: unknown[]) => {
            mockInsertInto(...args)
            return createChain(undefined)
          },
        }
        return fn(trx)
      })

      await repo.replaceByProject('proj-1', [])

      expect(mockTransaction).toHaveBeenCalledOnce()
      expect(mockDeleteFrom).toHaveBeenCalledWith('requirementCertainties')
      expect(mockInsertInto).not.toHaveBeenCalled()
    })
  })

  describe('findByProject', () => {
    it('should call selectFrom with projectId filter', async () => {
      await repo.findByProject('proj-1')
      expect(mockSelectFrom).toHaveBeenCalledWith('requirementCertainties')
    })
  })

  describe('confirmItem', () => {
    it('should call updateTable with confirmed=1 and return updated row', async () => {
      // After update succeeds, the repo does a selectFrom to fetch the confirmed row
      selectResult = {
        id: 'cert-1',
        requirementId: 'req-1',
        certaintyLevel: 'risky',
        reason: 'unclear scope',
        suggestion: 'clarify with client',
        confirmed: 1,
        confirmedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }

      const result = await repo.confirmItem('cert-1')

      expect(mockUpdateTable).toHaveBeenCalledWith('requirementCertainties')
      expect(result).toMatchObject({
        id: 'cert-1',
        confirmed: true,
      })
    })

    it('should throw NotFoundError for non-existent ID', async () => {
      // updateTable returns 0 updated rows
      updateResult = { numUpdatedRows: 0n }

      await expect(repo.confirmItem('non-existent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('batchConfirm', () => {
    it('should call updateTable for all unconfirmed items', async () => {
      await repo.batchConfirm('proj-1')
      expect(mockUpdateTable).toHaveBeenCalledWith('requirementCertainties')
    })
  })

  describe('deleteByProject', () => {
    it('should call deleteFrom with projectId', async () => {
      await repo.deleteByProject('proj-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('requirementCertainties')
    })
  })

  describe('findProjectId', () => {
    it('should return projectId when found', async () => {
      selectResult = { projectId: 'proj-1' }

      const result = await repo.findProjectId('cert-1')
      expect(result).toBe('proj-1')
      expect(mockSelectFrom).toHaveBeenCalledWith('requirementCertainties')
    })

    it('should return null when not found', async () => {
      selectResult = undefined

      const result = await repo.findProjectId('non-existent')
      expect(result).toBeNull()
    })
  })
})
