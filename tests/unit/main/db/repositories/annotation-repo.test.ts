import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSelectFrom = vi.fn()
const mockInsertInto = vi.fn()
const mockUpdateTable = vi.fn()
const mockDeleteFrom = vi.fn()

let selectResult: unknown = []
let selectFirstResult: unknown = undefined
const insertResult: unknown = undefined
let updateResult: unknown = { numUpdatedRows: 1n }
let deleteResult: unknown = { numDeletedRows: 1n }

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

vi.mock('uuid', () => ({ v4: () => 'generated-annotation-id' }))

import { AnnotationRepository } from '@main/db/repositories/annotation-repo'
import { NotFoundError } from '@main/utils/errors'

describe('AnnotationRepository', () => {
  let repo: AnnotationRepository

  beforeEach(() => {
    vi.clearAllMocks()
    selectResult = []
    selectFirstResult = undefined
    updateResult = { numUpdatedRows: 1n }
    deleteResult = { numDeletedRows: 1n }
    repo = new AnnotationRepository()
  })

  describe('create', () => {
    it('inserts a new annotation with generated id and default status', async () => {
      const result = await repo.create({
        projectId: 'proj-1',
        sectionId: 'section-1',
        type: 'human',
        content: 'Test annotation',
        author: 'user-1',
      })

      expect(mockInsertInto).toHaveBeenCalledWith('annotations')
      expect(result.id).toBe('generated-annotation-id')
      expect(result.status).toBe('pending')
      expect(result.projectId).toBe('proj-1')
      expect(result.sectionId).toBe('section-1')
      expect(result.type).toBe('human')
      expect(result.content).toBe('Test annotation')
      expect(result.author).toBe('user-1')
      expect(result.createdAt).toBeTruthy()
      expect(result.updatedAt).toBeTruthy()
    })
  })

  describe('update', () => {
    it('updates content and returns updated record', async () => {
      const updatedRecord = {
        id: 'ann-1',
        projectId: 'proj-1',
        sectionId: 's1',
        type: 'human',
        content: 'updated content',
        author: 'user-1',
        status: 'pending',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-06T00:00:00Z',
      }
      selectFirstResult = updatedRecord

      const result = await repo.update({ id: 'ann-1', content: 'updated content' })

      expect(mockUpdateTable).toHaveBeenCalledWith('annotations')
      expect(result.content).toBe('updated content')
    })

    it('throws NotFoundError when annotation does not exist', async () => {
      updateResult = { numUpdatedRows: 0n }

      await expect(repo.update({ id: 'missing', content: 'x' })).rejects.toThrow(NotFoundError)
    })
  })

  describe('delete', () => {
    it('deletes annotation by id', async () => {
      await repo.delete('ann-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('annotations')
    })

    it('throws NotFoundError when annotation does not exist', async () => {
      deleteResult = { numDeletedRows: 0n }

      await expect(repo.delete('missing')).rejects.toThrow(NotFoundError)
    })
  })

  describe('findById', () => {
    it('returns annotation when found', async () => {
      const record = {
        id: 'ann-1',
        projectId: 'proj-1',
        sectionId: 's1',
        type: 'ai-suggestion',
        content: 'Test',
        author: 'ai',
        status: 'pending',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      }
      selectFirstResult = record

      const result = await repo.findById('ann-1')
      expect(result).toEqual(record)
    })

    it('returns null when not found', async () => {
      selectFirstResult = undefined

      const result = await repo.findById('missing')
      expect(result).toBeNull()
    })
  })

  describe('listByProject', () => {
    it('returns annotations for a project', async () => {
      const records = [
        { id: 'ann-2', projectId: 'proj-1', createdAt: '2026-04-02T00:00:00Z' },
        { id: 'ann-1', projectId: 'proj-1', createdAt: '2026-04-01T00:00:00Z' },
      ]
      selectResult = records

      const result = await repo.listByProject('proj-1')

      expect(mockSelectFrom).toHaveBeenCalledWith('annotations')
      expect(result).toEqual(records)
    })
  })

  describe('listBySection', () => {
    it('returns annotations for a project + section', async () => {
      const records = [{ id: 'ann-1', projectId: 'proj-1', sectionId: 's1' }]
      selectResult = records

      const result = await repo.listBySection('proj-1', 's1')

      expect(mockSelectFrom).toHaveBeenCalledWith('annotations')
      expect(result).toEqual(records)
    })
  })
})
