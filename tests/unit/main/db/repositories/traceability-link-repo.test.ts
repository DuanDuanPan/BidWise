import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelectFrom = vi.fn()
const mockUpdateTable = vi.fn()
const mockDeleteFrom = vi.fn()
const mockInsertInto = vi.fn()
const mockTransactionDeleteFrom = vi.fn()
const mockTransactionInsertInto = vi.fn()
const mockTransactionValues = vi.fn()

let selectResult: unknown = []
let updateResult: unknown = { numUpdatedRows: 1n }
let deleteResult: unknown = { numDeletedRows: 1n }

const createChain = (getResult: () => unknown): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (_target, prop) => {
      if (prop === 'execute') return () => Promise.resolve(getResult())
      if (prop === 'executeTakeFirst') return () => Promise.resolve(getResult())
      if (prop === 'executeTakeFirstOrThrow') return () => Promise.resolve(getResult())
      return () => proxy
    },
  })
  return proxy
}

const transactionChain: Record<string, unknown> = {}
const transactionProxy = new Proxy(transactionChain, {
  get: (_target, prop) => {
    if (prop === 'execute') return () => Promise.resolve(undefined)
    if (prop === 'deleteFrom') {
      return (...args: unknown[]) => {
        mockTransactionDeleteFrom(...args)
        return transactionProxy
      }
    }
    if (prop === 'insertInto') {
      return (...args: unknown[]) => {
        mockTransactionInsertInto(...args)
        return transactionProxy
      }
    }
    if (prop === 'values') {
      return (...args: unknown[]) => {
        mockTransactionValues(...args)
        return transactionProxy
      }
    }
    return () => transactionProxy
  },
})

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    transaction: () => ({
      execute: async (callback: (trx: typeof transactionProxy) => Promise<unknown>) =>
        callback(transactionProxy),
    }),
    selectFrom: (...args: unknown[]) => {
      mockSelectFrom(...args)
      return createChain(() => selectResult)
    },
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args)
      return createChain(() => updateResult)
    },
    deleteFrom: (...args: unknown[]) => {
      mockDeleteFrom(...args)
      return createChain(() => deleteResult)
    },
    insertInto: (...args: unknown[]) => {
      mockInsertInto(...args)
      return createChain(() => undefined)
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
  return {
    BidWiseError,
    DatabaseError: class extends BidWiseError {
      constructor(message: string) {
        super('DATABASE', message)
      }
    },
    NotFoundError: class extends BidWiseError {
      constructor(message: string) {
        super('NOT_FOUND', message)
      }
    },
  }
})

import { TraceabilityLinkRepository } from '@main/db/repositories/traceability-link-repo'

describe('TraceabilityLinkRepository @story-2-8', () => {
  let repo: TraceabilityLinkRepository

  beforeEach(() => {
    vi.clearAllMocks()
    selectResult = []
    updateResult = { numUpdatedRows: 1n }
    deleteResult = { numDeletedRows: 1n }
    repo = new TraceabilityLinkRepository()
  })

  describe('replaceAutoByProject', () => {
    it('@p1 should delete only auto links and insert new ones in a transaction', async () => {
      const links = [
        {
          id: 'link-1',
          projectId: 'proj-1',
          requirementId: 'req-1',
          sectionId: 's1',
          sectionTitle: '技术方案',
          coverageStatus: 'covered' as const,
          confidence: 0.9,
          matchReason: 'test reason',
          source: 'auto' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]

      await repo.replaceAutoByProject('proj-1', links)

      expect(mockTransactionDeleteFrom).toHaveBeenCalledWith('traceabilityLinks')
      expect(mockTransactionInsertInto).toHaveBeenCalledWith('traceabilityLinks')
      expect(mockTransactionValues).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            projectId: 'proj-1',
            requirementId: 'req-1',
            sectionId: 's1',
            source: 'auto',
          }),
        ])
      )
    })

    it('@p1 should deduplicate by requirementId+sectionId', async () => {
      const links = [
        {
          id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
          sectionTitle: 'T', coverageStatus: 'covered' as const, confidence: 0.9,
          matchReason: null, source: 'auto' as const,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'link-2', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
          sectionTitle: 'T', coverageStatus: 'partial' as const, confidence: 0.5,
          matchReason: null, source: 'auto' as const,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]

      await repo.replaceAutoByProject('proj-1', links)

      // Should only insert one (first occurrence)
      const insertedValues = mockTransactionValues.mock.calls[0][0]
      expect(insertedValues).toHaveLength(1)
      expect(insertedValues[0].coverageStatus).toBe('covered')
    })

    it('@p2 should handle empty links array without inserting', async () => {
      await repo.replaceAutoByProject('proj-1', [])
      expect(mockTransactionDeleteFrom).toHaveBeenCalled()
      expect(mockTransactionInsertInto).not.toHaveBeenCalled()
    })
  })

  describe('findById', () => {
    it('@p1 should return a link by id', async () => {
      selectResult = {
        id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 0.85,
        matchReason: null, source: 'auto', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }

      const result = await repo.findById('link-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('link-1')
      expect(result!.coverageStatus).toBe('covered')
      expect(mockSelectFrom).toHaveBeenCalledWith('traceabilityLinks')
    })

    it('@p2 should return null when link does not exist', async () => {
      selectResult = undefined

      const result = await repo.findById('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('findByProject', () => {
    it('@p1 should return mapped link objects', async () => {
      selectResult = [
        {
          id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
          sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 0.85,
          matchReason: 'AI匹配', source: 'auto', createdAt: '2026-01-01', updatedAt: '2026-01-01',
        },
      ]

      const result = await repo.findByProject('proj-1')
      expect(result).toHaveLength(1)
      expect(result[0].coverageStatus).toBe('covered')
      expect(result[0].matchReason).toBe('AI匹配')
      expect(mockSelectFrom).toHaveBeenCalledWith('traceabilityLinks')
    })
  })

  describe('create', () => {
    it('@p1 should insert a link and return the model', async () => {
      const link = {
        id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered' as const, confidence: 1.0,
        matchReason: null, source: 'manual' as const,
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }

      const result = await repo.create(link)
      expect(result.source).toBe('manual')
      expect(result.coverageStatus).toBe('covered')
      expect(mockInsertInto).toHaveBeenCalledWith('traceabilityLinks')
    })
  })

  describe('update', () => {
    it('@p1 should update and return the link', async () => {
      selectResult = {
        id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'partial', confidence: 0.85,
        matchReason: null, source: 'manual', createdAt: '2026-01-01', updatedAt: '2026-01-02',
      }

      const result = await repo.update('link-1', { coverageStatus: 'partial' })
      expect(result.coverageStatus).toBe('partial')
      expect(mockUpdateTable).toHaveBeenCalledWith('traceabilityLinks')
    })

    it('@p2 should throw NotFoundError if link does not exist', async () => {
      updateResult = { numUpdatedRows: 0n }
      await expect(repo.update('nonexistent', { coverageStatus: 'covered' })).rejects.toThrow()
    })
  })

  describe('delete', () => {
    it('@p1 should delete a link by id', async () => {
      await repo.delete('link-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('traceabilityLinks')
    })

    it('@p2 should throw NotFoundError if link does not exist', async () => {
      deleteResult = { numDeletedRows: 0n }
      await expect(repo.delete('nonexistent')).rejects.toThrow()
    })
  })

  describe('deleteByProject', () => {
    it('@p1 should delete all links for a project', async () => {
      await repo.deleteByProject('proj-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('traceabilityLinks')
    })
  })

  describe('matchReason persistence', () => {
    it('@p1 should persist matchReason in create', async () => {
      const link = {
        id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered' as const, confidence: 0.85,
        matchReason: '该章节详细描述了数据处理能力', source: 'auto' as const,
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
      }

      const result = await repo.create(link)
      expect(result.matchReason).toBe('该章节详细描述了数据处理能力')
    })
  })
})
