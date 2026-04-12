import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockSelectFrom,
  mockInsertInto,
  mockUpdateTable,
  mockDeleteFrom,
  mockExecute,
  mockExecuteTakeFirst,
  mockExecuteTakeFirstOrThrow,
  mockValues: _mockValues,
} = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([])
  const mockExecuteTakeFirst = vi.fn().mockResolvedValue(null)
  const mockExecuteTakeFirstOrThrow = vi.fn()
  const mockValues = vi.fn()

  const chain = (): Record<string, (...args: unknown[]) => unknown> => ({
    selectAll: () => chain(),
    select: () => chain(),
    where: () => chain(),
    orderBy: () => chain(),
    set: () => chain(),
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

import { AttackChecklistRepository } from '@main/db/repositories/attack-checklist-repo'

describe('AttackChecklistRepository @story-7-5', () => {
  let repo: AttackChecklistRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new AttackChecklistRepository()
  })

  describe('findByProjectId', () => {
    it('should return null when no checklist exists', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce(null)

      const result = await repo.findByProjectId('proj-1')
      expect(result).toBeNull()
      expect(mockSelectFrom).toHaveBeenCalledWith('attackChecklists')
    })

    it('should return checklist with items when exists', async () => {
      // Return checklist row
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'cl-1',
        projectId: 'proj-1',
        status: 'generated',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      // Return items
      mockExecute.mockResolvedValueOnce([
        {
          id: 'item-1',
          checklistId: 'cl-1',
          category: '合规性',
          attackAngle: '测试攻击',
          severity: 'critical',
          defenseSuggestion: '测试防御',
          targetSection: null,
          targetSectionLocator: null,
          status: 'unaddressed',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const result = await repo.findByProjectId('proj-1')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('cl-1')
      expect(result!.items).toHaveLength(1)
      expect(result!.items[0].severity).toBe('critical')
    })

    it('should parse JSON targetSectionLocator', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({
        id: 'cl-1',
        projectId: 'proj-1',
        status: 'generated',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      mockExecute.mockResolvedValueOnce([
        {
          id: 'item-1',
          checklistId: 'cl-1',
          category: '技术方案',
          attackAngle: '攻击',
          severity: 'major',
          defenseSuggestion: '防御',
          targetSection: '系统架构设计',
          targetSectionLocator: JSON.stringify({
            title: '系统架构设计',
            level: 2,
            occurrenceIndex: 0,
          }),
          status: 'unaddressed',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ])

      const result = await repo.findByProjectId('proj-1')
      expect(result!.items[0].targetSectionLocator).toEqual({
        title: '系统架构设计',
        level: 2,
        occurrenceIndex: 0,
      })
    })
  })

  describe('saveChecklist', () => {
    it('should insert new checklist when none exists', async () => {
      // No existing
      mockExecuteTakeFirst.mockResolvedValueOnce(null)
      // After insert, return it
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'new-id',
        projectId: 'proj-1',
        status: 'generating',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })

      const result = await repo.saveChecklist({
        projectId: 'proj-1',
        status: 'generating',
        generationSource: 'llm',
      })

      expect(mockInsertInto).toHaveBeenCalledWith('attackChecklists')
      expect(result.projectId).toBe('proj-1')
      expect(result.status).toBe('generating')
    })

    it('should update existing checklist when one exists for project', async () => {
      // Existing
      mockExecuteTakeFirst.mockResolvedValueOnce({ id: 'existing-id' })
      // After update, return checklist
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'existing-id',
        projectId: 'proj-1',
        status: 'generated',
        generationSource: 'fallback',
        warningMessage: 'AI 生成失败',
        generatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      })
      // Items query
      mockExecute.mockResolvedValueOnce(undefined) // update
      mockExecute.mockResolvedValueOnce([]) // items

      const result = await repo.saveChecklist({
        projectId: 'proj-1',
        status: 'generated',
        generationSource: 'fallback',
        warningMessage: 'AI 生成失败',
      })

      expect(mockUpdateTable).toHaveBeenCalledWith('attackChecklists')
      expect(result.id).toBe('existing-id')
    })
  })

  describe('saveItems', () => {
    it('should batch insert items', async () => {
      await repo.saveItems([
        {
          id: 'item-1',
          checklistId: 'cl-1',
          category: '合规性',
          attackAngle: '攻击场景',
          severity: 'critical',
          defenseSuggestion: '防御建议',
          targetSection: null,
          targetSectionLocator: null,
          status: 'unaddressed',
          sortOrder: 0,
        },
      ])

      expect(mockInsertInto).toHaveBeenCalledWith('attackChecklistItems')
    })

    it('should skip when items array is empty', async () => {
      await repo.saveItems([])
      expect(mockInsertInto).not.toHaveBeenCalled()
    })
  })

  describe('deleteItemsByChecklistId', () => {
    it('should delete items for a given checklist', async () => {
      await repo.deleteItemsByChecklistId('cl-1')
      expect(mockDeleteFrom).toHaveBeenCalledWith('attackChecklistItems')
    })
  })

  describe('updateItemStatus', () => {
    it('should update item status and return updated item', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 1n })
      mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
        id: 'item-1',
        checklistId: 'cl-1',
        category: '合规性',
        attackAngle: '攻击场景',
        severity: 'critical',
        defenseSuggestion: '防御建议',
        targetSection: null,
        targetSectionLocator: null,
        status: 'addressed',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      })

      const result = await repo.updateItemStatus('item-1', 'addressed')
      expect(result.status).toBe('addressed')
      expect(mockUpdateTable).toHaveBeenCalledWith('attackChecklistItems')
    })

    it('should throw when item does not exist', async () => {
      mockExecuteTakeFirst.mockResolvedValueOnce({ numUpdatedRows: 0n })

      await expect(repo.updateItemStatus('nonexistent', 'addressed')).rejects.toThrow(
        '攻击清单条目不存在'
      )
    })
  })

  describe('updateChecklistStatus', () => {
    it('should update checklist status', async () => {
      await repo.updateChecklistStatus('cl-1', 'generated')
      expect(mockUpdateTable).toHaveBeenCalledWith('attackChecklists')
    })
  })
})
