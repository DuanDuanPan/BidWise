import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AnnotationRecord } from '@shared/annotation-types'

const mocks = vi.hoisted(() => ({
  repoCreate: vi.fn(),
  repoUpdate: vi.fn(),
  repoDelete: vi.fn(),
  repoFindById: vi.fn(),
  repoListByProject: vi.fn(),
  repoListBySection: vi.fn(),
  repoListReplies: vi.fn(),
  updateMetadata: vi.fn(),
}))

vi.mock('@main/db/repositories/annotation-repo', () => ({
  AnnotationRepository: class {
    create = mocks.repoCreate
    update = mocks.repoUpdate
    delete = mocks.repoDelete
    findById = mocks.repoFindById
    listByProject = mocks.repoListByProject
    listBySection = mocks.repoListBySection
    listReplies = mocks.repoListReplies
  },
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    updateMetadata: (...args: unknown[]) => mocks.updateMetadata(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/bidwise-test'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import { annotationService } from '@main/services/annotation-service'

const makeAnnotation = (overrides: Partial<AnnotationRecord> = {}): AnnotationRecord => ({
  id: 'ann-1',
  projectId: 'proj-1',
  sectionId: 'section-1',
  type: 'human',
  content: 'Test annotation',
  author: 'user-1',
  status: 'pending',
  parentId: null,
  assignee: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('annotationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateMetadata.mockResolvedValue({})
    mocks.repoListByProject.mockResolvedValue([])
  })

  describe('create', () => {
    it('creates annotation and syncs to sidecar', async () => {
      const record = makeAnnotation()
      mocks.repoCreate.mockResolvedValue(record)

      const result = await annotationService.create({
        projectId: 'proj-1',
        sectionId: 'section-1',
        type: 'human',
        content: 'Test annotation',
        author: 'user-1',
      })

      expect(result).toEqual(record)
      expect(mocks.repoCreate).toHaveBeenCalled()
      expect(mocks.updateMetadata).toHaveBeenCalledWith('proj-1', expect.any(Function))
    })
  })

  describe('update', () => {
    it('updates annotation and syncs to sidecar', async () => {
      const updated = makeAnnotation({ content: 'Updated content' })
      mocks.repoUpdate.mockResolvedValue(updated)

      const result = await annotationService.update({ id: 'ann-1', content: 'Updated content' })

      expect(result).toEqual(updated)
      expect(mocks.repoUpdate).toHaveBeenCalled()
      expect(mocks.updateMetadata).toHaveBeenCalledWith('proj-1', expect.any(Function))
    })
  })

  describe('delete', () => {
    it('deletes annotation and syncs to sidecar', async () => {
      mocks.repoFindById.mockResolvedValue(makeAnnotation())
      mocks.repoDelete.mockResolvedValue(undefined)

      await annotationService.delete('ann-1')

      expect(mocks.repoDelete).toHaveBeenCalledWith('ann-1')
      expect(mocks.updateMetadata).toHaveBeenCalledWith('proj-1', expect.any(Function))
    })
  })

  describe('list', () => {
    it('lists by project when sectionId is not provided', async () => {
      const records = [makeAnnotation({ id: 'ann-2' }), makeAnnotation({ id: 'ann-1' })]
      mocks.repoListByProject.mockResolvedValue(records)

      const result = await annotationService.list({ projectId: 'proj-1' })

      expect(result).toEqual(records)
      expect(mocks.repoListByProject).toHaveBeenCalledWith('proj-1', { includeReplies: undefined })
    })

    it('lists by section when sectionId is provided', async () => {
      const records = [makeAnnotation({ sectionId: 's1' })]
      mocks.repoListBySection.mockResolvedValue(records)

      const result = await annotationService.list({ projectId: 'proj-1', sectionId: 's1' })

      expect(result).toEqual(records)
      expect(mocks.repoListBySection).toHaveBeenCalledWith('proj-1', 's1', {
        includeReplies: undefined,
      })
    })

    it('returns by createdAt DESC (delegates to repo)', async () => {
      const records = [
        makeAnnotation({ id: 'ann-2', createdAt: '2026-04-02T00:00:00Z' }),
        makeAnnotation({ id: 'ann-1', createdAt: '2026-04-01T00:00:00Z' }),
      ]
      mocks.repoListByProject.mockResolvedValue(records)

      const result = await annotationService.list({ projectId: 'proj-1' })

      expect(result[0].id).toBe('ann-2')
      expect(result[1].id).toBe('ann-1')
    })

    it('honors the E2E annotation list delay when configured', async () => {
      vi.useFakeTimers()
      const originalDelay = process.env.BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS
      process.env.BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS = '25'
      mocks.repoListByProject.mockResolvedValue([makeAnnotation()])

      try {
        const resultPromise = annotationService.list({ projectId: 'proj-1' })

        expect(mocks.repoListByProject).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(25)
        const result = await resultPromise

        expect(result).toHaveLength(1)
        expect(mocks.repoListByProject).toHaveBeenCalledWith('proj-1', {
          includeReplies: undefined,
        })
      } finally {
        if (originalDelay === undefined) {
          delete process.env.BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS
        } else {
          process.env.BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS = originalDelay
        }
        vi.useRealTimers()
      }
    })

    it('throws the forced E2E annotation list error when configured', async () => {
      const originalError = process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE
      process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE = 'forced annotation list error'

      try {
        await expect(annotationService.list({ projectId: 'proj-1' })).rejects.toThrow(
          'forced annotation list error'
        )
        expect(mocks.repoListByProject).not.toHaveBeenCalled()
      } finally {
        if (originalError === undefined) {
          delete process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE
        } else {
          process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE = originalError
        }
      }
    })
  })

  describe('listReplies', () => {
    it('delegates to repo.listReplies', async () => {
      const replies = [
        makeAnnotation({ id: 'reply-1', parentId: 'ann-1' }),
        makeAnnotation({ id: 'reply-2', parentId: 'ann-1' }),
      ]
      mocks.repoListReplies.mockResolvedValue(replies)

      const result = await annotationService.listReplies('ann-1')

      expect(result).toEqual(replies)
      expect(mocks.repoListReplies).toHaveBeenCalledWith('ann-1')
    })
  })

  describe('sidecar sync', () => {
    it('sidecar failure does not block SQLite success on create', async () => {
      const record = makeAnnotation()
      mocks.repoCreate.mockResolvedValue(record)
      mocks.updateMetadata.mockRejectedValue(new Error('disk full'))

      const result = await annotationService.create({
        projectId: 'proj-1',
        sectionId: 'section-1',
        type: 'human',
        content: 'Test',
        author: 'user',
      })

      expect(result).toEqual(record)
    })

    it('syncProjectToSidecar writes full annotation list to sidecar', async () => {
      const records = [makeAnnotation({ id: 'ann-1' }), makeAnnotation({ id: 'ann-2' })]
      mocks.repoListByProject.mockResolvedValue(records)
      mocks.updateMetadata.mockImplementation(
        (_pid: string, updater: (...args: unknown[]) => unknown) => {
          const result = updater({
            version: '1.0',
            projectId: 'proj-1',
            annotations: [],
            scores: [],
            lastSavedAt: '',
          })
          expect(result.annotations).toEqual(records)
          return Promise.resolve(result)
        }
      )

      await annotationService.syncProjectToSidecar('proj-1')

      expect(mocks.repoListByProject).toHaveBeenCalledWith('proj-1', { includeReplies: true })
      expect(mocks.updateMetadata).toHaveBeenCalled()
    })
  })
})
