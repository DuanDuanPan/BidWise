import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsertInto = vi.fn()
const mockSelectFrom = vi.fn()
const mockUpdateTable = vi.fn()
const mockSet = vi.fn()

let mockSelectResult: unknown = null

const createSelectChain = (): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (target, prop) => {
      if (prop === 'execute')
        return () => Promise.resolve(mockSelectResult ? [mockSelectResult] : [])
      if (prop === 'executeTakeFirst') return () => Promise.resolve(mockSelectResult)
      if (prop === 'executeTakeFirstOrThrow') {
        return () => {
          if (!mockSelectResult) throw new Error('No result')
          return Promise.resolve(mockSelectResult)
        }
      }
      return () => proxy
    },
  })
  return proxy
}

const createWriteChain = (result: unknown = undefined): Record<string, unknown> => {
  const chain: Record<string, unknown> = {}
  const proxy = new Proxy(chain, {
    get: (target, prop) => {
      if (prop === 'set') {
        return (value: unknown) => {
          mockSet(value)
          return proxy
        }
      }
      if (prop === 'execute') return () => Promise.resolve(result)
      if (prop === 'executeTakeFirst') return () => Promise.resolve(result)
      return () => proxy
    },
  })
  return proxy
}

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    insertInto: (...args: unknown[]) => {
      mockInsertInto(...args)
      return createWriteChain()
    },
    selectFrom: (...args: unknown[]) => {
      mockSelectFrom(...args)
      return createSelectChain()
    },
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args)
      return createWriteChain({ numUpdatedRows: 1n })
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
    constructor(message: string) {
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

import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'

const mockScoringRow = {
  id: 'sm-1',
  projectId: 'proj-1',
  totalScore: 100,
  criteria: JSON.stringify([
    {
      id: 'c-1',
      category: '技术方案',
      maxScore: 60,
      weight: 0.6,
      subItems: [],
      reasoning: '推理依据',
      status: 'extracted',
    },
  ]),
  extractedAt: '2026-03-21T00:00:00.000Z',
  confirmedAt: null,
  version: 1,
  createdAt: '2026-03-21T00:00:00.000Z',
  updatedAt: '2026-03-21T00:00:00.000Z',
}

describe('ScoringModelRepository', () => {
  let repo: ScoringModelRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new ScoringModelRepository()
    mockSelectResult = null
  })

  describe('upsert', () => {
    it('should insert when no existing model', async () => {
      vi.spyOn(repo, 'findByProject').mockResolvedValue({
        projectId: 'proj-1',
        totalScore: 100,
        criteria: [],
        extractedAt: '2026-03-21T00:00:00.000Z',
        confirmedAt: null,
        version: 1,
      })

      const result = await repo.upsert({
        projectId: 'proj-1',
        totalScore: 100,
        criteria: [],
        extractedAt: '2026-03-21T00:00:00.000Z',
        confirmedAt: null,
        version: 1,
      })

      expect(mockInsertInto).toHaveBeenCalledWith('scoringModels')
      expect(result).toBeTruthy()
    })

    it('should update when model exists', async () => {
      mockSelectResult = mockScoringRow
      vi.spyOn(repo, 'findByProject').mockResolvedValue({
        projectId: 'proj-1',
        totalScore: 100,
        criteria: [],
        extractedAt: '2026-03-21T00:00:00.000Z',
        confirmedAt: null,
        version: 1,
      })

      await repo.upsert({
        projectId: 'proj-1',
        totalScore: 100,
        criteria: [],
        extractedAt: '2026-03-21T00:00:00.000Z',
        confirmedAt: null,
        version: 1,
      })

      expect(mockUpdateTable).toHaveBeenCalledWith('scoringModels')
    })
  })

  describe('findByProject', () => {
    it('should return null when no model exists', async () => {
      mockSelectResult = null
      const result = await repo.findByProject('proj-1')
      expect(result).toBeNull()
    })

    it('should return parsed model when found', async () => {
      mockSelectResult = mockScoringRow
      const result = await repo.findByProject('proj-1')
      expect(result).not.toBeNull()
      expect(result?.totalScore).toBe(100)
      expect(result?.criteria).toHaveLength(1)
      expect(result?.criteria[0].category).toBe('技术方案')
    })
  })

  describe('confirm', () => {
    it('should throw NotFoundError when model does not exist', async () => {
      mockSelectResult = null
      await expect(repo.confirm('proj-nonexist')).rejects.toThrow('评分模型不存在')
    })

    it('should set confirmedAt when model exists', async () => {
      mockSelectResult = mockScoringRow
      vi.spyOn(repo, 'findByProject')
        .mockResolvedValueOnce({
          projectId: 'proj-1',
          totalScore: 100,
          criteria: [
            {
              id: 'c-1',
              category: '技术方案',
              maxScore: 60,
              weight: 0.6,
              subItems: [],
              reasoning: '推理依据',
              status: 'extracted',
            },
          ],
          extractedAt: '2026-03-21T00:00:00.000Z',
          confirmedAt: null,
          version: 1,
        })
        .mockResolvedValueOnce({
          projectId: 'proj-1',
          totalScore: 100,
          criteria: [
            {
              id: 'c-1',
              category: '技术方案',
              maxScore: 60,
              weight: 0.6,
              subItems: [],
              reasoning: '推理依据',
              status: 'confirmed',
            },
          ],
          extractedAt: '2026-03-21T00:00:00.000Z',
          confirmedAt: '2026-03-21T01:00:00.000Z',
          version: 1,
        })

      const result = await repo.confirm('proj-1')
      expect(result.confirmedAt).toBeTruthy()
      expect(mockUpdateTable).toHaveBeenCalledWith('scoringModels')
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmedAt: expect.any(String),
          criteria: JSON.stringify([
            {
              id: 'c-1',
              category: '技术方案',
              maxScore: 60,
              weight: 0.6,
              subItems: [],
              reasoning: '推理依据',
              status: 'confirmed',
            },
          ]),
        })
      )
    })
  })
})
