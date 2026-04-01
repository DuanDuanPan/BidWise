import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelectFrom = vi.fn()
const mockUpdateTable = vi.fn()
const mockDeleteFrom = vi.fn()
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

vi.mock('uuid', () => ({ v4: () => 'generated-seed-id' }))

import { StrategySeedRepository } from '@main/db/repositories/strategy-seed-repo'
import type { StrategySeed } from '@shared/analysis-types'

describe('StrategySeedRepository', () => {
  let repo: StrategySeedRepository

  beforeEach(() => {
    vi.clearAllMocks()
    selectResult = []
    updateResult = { numUpdatedRows: 1n }
    deleteResult = { numDeletedRows: 1n }
    repo = new StrategySeedRepository()
  })

  it('deduplicates titles before replacing a project batch', async () => {
    const seeds: StrategySeed[] = [
      {
        id: 'seed-1',
        title: '数据安全',
        reasoning: '客户强调安全',
        suggestion: '突出国密能力',
        sourceExcerpt: '关注数据安全',
        confidence: 0.9,
        status: 'pending',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'seed-2',
        title: '数据安全',
        reasoning: '重复标题',
        suggestion: '应被去重',
        sourceExcerpt: '重复',
        confidence: 0.5,
        status: 'pending',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'seed-3',
        title: '性能稳定性',
        reasoning: '客户提到竞品性能问题',
        suggestion: '附性能压测',
        sourceExcerpt: '竞品性能问题',
        confidence: 0.82,
        status: 'pending',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ]

    await repo.replaceByProject('proj-1', seeds)

    expect(mockTransactionDeleteFrom).toHaveBeenCalledWith('strategySeeds')
    expect(mockTransactionInsertInto).toHaveBeenCalledWith('strategySeeds')
    expect(mockTransactionValues).toHaveBeenCalledTimes(1)
    expect(mockTransactionValues.mock.calls[0]?.[0] as Array<{ title: string }>).toHaveLength(2)
    expect(
      (mockTransactionValues.mock.calls[0]?.[0] as Array<{ title: string }>).map((row) => row.title)
    ).toEqual(['数据安全', '性能稳定性'])
  })

  it('maps rows when reading seeds for a project', async () => {
    selectResult = [
      {
        id: 'seed-1',
        title: '数据安全',
        reasoning: '客户强调安全',
        suggestion: '突出国密能力',
        sourceExcerpt: '关注数据安全',
        confidence: 0.9,
        status: 'confirmed',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T01:00:00.000Z',
      },
    ]

    const result = await repo.findByProject('proj-1')

    expect(mockSelectFrom).toHaveBeenCalledWith('strategySeeds')
    expect(result).toEqual([
      {
        id: 'seed-1',
        title: '数据安全',
        reasoning: '客户强调安全',
        suggestion: '突出国密能力',
        sourceExcerpt: '关注数据安全',
        confidence: 0.9,
        status: 'confirmed',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T01:00:00.000Z',
      },
    ])
  })

  it('returns whether a duplicate title already exists', async () => {
    selectResult = { id: 'seed-1' }

    await expect(repo.titleExists('proj-1', '数据安全')).resolves.toBe(true)
    expect(mockSelectFrom).toHaveBeenCalledWith('strategySeeds')
  })
})
