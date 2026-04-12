import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSelectFrom,
  mockInsertInto,
  mockUpdateTable,
  mockDeleteFrom,
  mockExecute,
  mockExecuteTakeFirst,
  mockExecuteTakeFirstOrThrow,
  mockValues,
} = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([])
  const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
  const mockExecuteTakeFirstOrThrow = vi.fn()
  const mockValues = vi.fn()

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const chain = () => ({
    selectAll: (..._args: unknown[]) => chain(),
    select: (..._args: unknown[]) => chain(),
    where: (..._args: unknown[]) => chain(),
    orderBy: (..._args: unknown[]) => chain(),
    set: (..._args: unknown[]) => chain(),
    values: (...args: unknown[]) => {
      mockValues(...args)
      return chain()
    },
    execute: mockExecute,
    executeTakeFirst: mockExecuteTakeFirst,
    executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
  })

  return {
    mockSelectFrom: vi.fn(() => chain()),
    mockInsertInto: vi.fn(() => chain()),
    mockUpdateTable: vi.fn(() => chain()),
    mockDeleteFrom: vi.fn(() => chain()),
    mockExecute,
    mockExecuteTakeFirst,
    mockExecuteTakeFirstOrThrow,
    mockValues,
  }
})

vi.mock('@main/db/client', () => ({
  getDb: () => ({
    selectFrom: mockSelectFrom,
    insertInto: mockInsertInto,
    updateTable: mockUpdateTable,
    deleteFrom: mockDeleteFrom,
  }),
}))

import { AdversarialReviewRepository } from '@main/db/repositories/adversarial-review-repo'

describe('AdversarialReviewRepository', () => {
  let repo: AdversarialReviewRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new AdversarialReviewRepository()
  })

  describe('saveSession', () => {
    it('should insert new session when none exists for project', async () => {
      // No existing session
      mockExecuteTakeFirst.mockResolvedValueOnce(null)
      // After insert, return the session
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'session-1',
        projectId: 'proj-1',
        lineupId: 'lineup-1',
        status: 'running',
        roleResults: '[]',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: null,
      })
      // Return empty findings
      mockExecute.mockResolvedValueOnce(undefined) // insert
      mockExecute.mockResolvedValueOnce([]) // findings query

      const result = await repo.saveSession({
        projectId: 'proj-1',
        lineupId: 'lineup-1',
        status: 'running',
        roleResults: [],
        startedAt: '2026-01-01T00:00:00Z',
      })

      expect(result.projectId).toBe('proj-1')
      expect(result.status).toBe('running')
    })

    it('should upsert when session already exists for project', async () => {
      // Existing session found
      mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'existing-id' })
      // Execute the update
      mockExecute.mockResolvedValueOnce(undefined)
      // Return updated session
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'existing-id',
        projectId: 'proj-1',
        lineupId: 'lineup-2',
        status: 'completed',
        roleResults: '[]',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:05:00Z',
      })
      mockExecute.mockResolvedValueOnce([]) // findings query

      const result = await repo.saveSession({
        projectId: 'proj-1',
        lineupId: 'lineup-2',
        status: 'completed',
        roleResults: [],
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:05:00Z',
      })

      expect(result.id).toBe('existing-id')
      expect(result.status).toBe('completed')
    })
  })

  describe('findSessionByProjectId', () => {
    it('should return null when no session exists', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce(null)

      const result = await repo.findSessionByProjectId('proj-1')
      expect(result).toBeNull()
    })

    it('should return session with findings', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'session-1',
        projectId: 'proj-1',
        lineupId: 'lineup-1',
        status: 'completed',
        roleResults: JSON.stringify([
          { roleId: 'r1', roleName: '合规', status: 'success', findingCount: 1 },
        ]),
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:05:00Z',
      })
      mockExecute.mockResolvedValueOnce([
        {
          id: 'f1',
          sessionId: 'session-1',
          roleId: 'r1',
          roleName: '合规',
          severity: 'critical',
          sectionRef: '第1章',
          sectionLocator: null,
          content: '发现问题',
          suggestion: null,
          reasoning: null,
          status: 'pending',
          rebuttalReason: null,
          contradictionGroupId: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const result = await repo.findSessionByProjectId('proj-1')
      expect(result).not.toBeNull()
      expect(result!.findings).toHaveLength(1)
      expect(result!.roleResults).toHaveLength(1)
      expect(result!.findings[0].severity).toBe('critical')
    })
  })

  describe('updateFinding', () => {
    it('should update finding status and rebuttalReason', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 1n })
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'f1',
        sessionId: 'session-1',
        roleId: 'r1',
        roleName: '合规',
        severity: 'major',
        sectionRef: null,
        sectionLocator: null,
        content: 'test',
        suggestion: null,
        reasoning: null,
        status: 'rejected',
        rebuttalReason: '不适用',
        contradictionGroupId: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:01:00Z',
      })

      const result = await repo.updateFinding('f1', {
        status: 'rejected',
        rebuttalReason: '不适用',
      })

      expect(result.status).toBe('rejected')
      expect(result.rebuttalReason).toBe('不适用')
    })

    it('should throw when finding does not exist', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 0n })

      await expect(
        repo.updateFinding('nonexistent', { status: 'accepted', rebuttalReason: null })
      ).rejects.toMatchObject({ message: expect.stringContaining('不存在') })
    })
  })

  describe('deleteFindingsBySessionId', () => {
    it('should delete all findings for a session', async () => {
      mockExecute.mockResolvedValueOnce(undefined)
      await repo.deleteFindingsBySessionId('session-1')
      expect(mockDeleteFrom).toHaveBeenCalled()
    })
  })

  describe('JSON serialization', () => {
    it('should serialize sectionLocator to JSON on save', async () => {
      mockExecute.mockResolvedValueOnce(undefined) // insert

      await repo.saveFindings([
        {
          id: 'f1',
          sessionId: 's1',
          roleId: 'r1',
          roleName: '合规',
          severity: 'critical',
          sectionRef: '第1章',
          sectionLocator: { title: '第1章 概述', level: 1, occurrenceIndex: 0 },
          content: 'test',
          suggestion: null,
          reasoning: null,
          status: 'pending',
          rebuttalReason: null,
          contradictionGroupId: null,
          sortOrder: 0,
        },
      ])

      expect(mockValues).toHaveBeenCalled()
      const insertedValues = mockValues.mock.calls[0][0]
      expect(typeof insertedValues[0].sectionLocator).toBe('string')
      expect(JSON.parse(insertedValues[0].sectionLocator)).toEqual({
        title: '第1章 概述',
        level: 1,
        occurrenceIndex: 0,
      })
    })

    it('should deserialize sectionLocator from JSON on read', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'session-1',
        projectId: 'proj-1',
        lineupId: 'lineup-1',
        status: 'completed',
        roleResults: '[]',
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: null,
      })
      mockExecute.mockResolvedValueOnce([
        {
          id: 'f1',
          sessionId: 'session-1',
          roleId: 'r1',
          roleName: '合规',
          severity: 'major',
          sectionRef: '第2章',
          sectionLocator: JSON.stringify({ title: '第2章 系统架构', level: 1, occurrenceIndex: 0 }),
          content: 'test',
          suggestion: null,
          reasoning: null,
          status: 'pending',
          rebuttalReason: null,
          contradictionGroupId: null,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const session = await repo.findSessionByProjectId('proj-1')
      expect(session!.findings[0].sectionLocator).toEqual({
        title: '第2章 系统架构',
        level: 1,
        occurrenceIndex: 0,
      })
    })
  })
})
