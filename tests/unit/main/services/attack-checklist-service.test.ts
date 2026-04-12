import { beforeEach, describe, it, expect, vi } from 'vitest'

const {
  mockFindByProjectId,
  mockSaveChecklist,
  mockSaveItems,
  mockDeleteItemsByChecklistId,
  mockUpdateItemStatus,
  mockUpdateChecklistStatus,
  mockEnqueue,
  mockTaskExecute,
} = vi.hoisted(() => ({
  mockFindByProjectId: vi.fn(),
  mockSaveChecklist: vi.fn(),
  mockSaveItems: vi.fn(),
  mockDeleteItemsByChecklistId: vi.fn(),
  mockUpdateItemStatus: vi.fn(),
  mockUpdateChecklistStatus: vi.fn(),
  mockEnqueue: vi.fn().mockReturnValue(Promise.resolve('task-1')),
  mockTaskExecute: vi.fn().mockReturnValue(Promise.resolve(undefined)),
}))

vi.mock('@main/db/repositories/attack-checklist-repo', () => {
  return {
    AttackChecklistRepository: class {
      findByProjectId = mockFindByProjectId
      saveChecklist = mockSaveChecklist
      saveItems = mockSaveItems
      deleteItemsByChecklistId = mockDeleteItemsByChecklistId
      updateItemStatus = mockUpdateItemStatus
      updateChecklistStatus = mockUpdateChecklistStatus
    },
  }
})

vi.mock('@main/db/repositories/project-repo', () => {
  return {
    ProjectRepository: class {
      findById = vi
        .fn()
        .mockResolvedValue({ id: 'proj-1', proposalType: '技术标', industry: '金融' })
    },
  }
})

vi.mock('@main/db/repositories/requirement-repo', () => {
  return {
    RequirementRepository: class {
      findByProject = vi.fn().mockResolvedValue([{ description: '需求1' }])
    },
  }
})

vi.mock('@main/db/repositories/scoring-model-repo', () => {
  return {
    ScoringModelRepository: class {
      findByProject = vi.fn().mockResolvedValue({
        criteria: [{ category: '技术', maxScore: 50, weight: 0.5 }],
      })
    },
  }
})

vi.mock('@main/db/repositories/mandatory-item-repo', () => {
  return {
    MandatoryItemRepository: class {
      findByProject = vi.fn().mockResolvedValue([])
    },
  }
})

vi.mock('@main/db/repositories/strategy-seed-repo', () => {
  return {
    StrategySeedRepository: class {
      findByProject = vi.fn().mockResolvedValue([])
    },
  }
})

vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: vi.fn().mockResolvedValue({ taskId: 'inner-task-1' }),
    getAgentStatus: vi.fn().mockResolvedValue({
      status: 'completed',
      result: { content: '[]' },
      progress: 100,
    }),
  },
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockTaskExecute(...args),
  },
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    getMetadata: vi.fn().mockResolvedValue({ sectionIndex: [] }),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: vi.fn(),
  isAbortError: vi.fn().mockReturnValue(false),
}))

vi.mock('@shared/constants', () => ({
  ErrorCode: {
    ADVERSARIAL_GENERATION_FAILED: 'ADVERSARIAL_GENERATION_FAILED',
    TASK_CANCELLED: 'TASK_CANCELLED',
  },
}))

import { attackChecklistService } from '@main/services/attack-checklist-service'

describe('AttackChecklistService @story-7-5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByProjectId.mockResolvedValue(null)
    mockSaveChecklist.mockResolvedValue({
      id: 'cl-1',
      projectId: 'proj-1',
      status: 'generating',
      items: [],
      generationSource: 'llm',
      warningMessage: null,
      generatedAt: '',
      createdAt: '',
      updatedAt: '',
    })
  })

  describe('generate', () => {
    it('should enqueue a task and return taskId', async () => {
      const result = await attackChecklistService.generate('proj-1')

      expect(result).toEqual({ taskId: 'task-1' })
      expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ category: 'ai' }))
    })

    it('should create new checklist record when none exists', async () => {
      mockFindByProjectId.mockResolvedValue(null)

      await attackChecklistService.generate('proj-1')

      expect(mockSaveChecklist).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          status: 'generating',
          generationSource: 'llm',
        })
      )
    })

    it('should delete old items when regenerating', async () => {
      mockFindByProjectId.mockResolvedValue({
        id: 'existing-cl',
        projectId: 'proj-1',
        status: 'generated',
        items: [{ id: 'old-item' }],
      })

      await attackChecklistService.generate('proj-1')

      expect(mockDeleteItemsByChecklistId).toHaveBeenCalledWith('existing-cl')
    })
  })

  describe('getChecklist', () => {
    it('should return checklist from repository', async () => {
      const mockChecklist = {
        id: 'cl-1',
        projectId: 'proj-1',
        status: 'generated' as const,
        items: [],
        generationSource: 'llm' as const,
        warningMessage: null,
        generatedAt: '2026-01-01T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      mockFindByProjectId.mockResolvedValue(mockChecklist)

      const result = await attackChecklistService.getChecklist('proj-1')
      expect(result).toEqual(mockChecklist)
    })

    it('should return null when no checklist exists', async () => {
      mockFindByProjectId.mockResolvedValue(null)

      const result = await attackChecklistService.getChecklist('proj-1')
      expect(result).toBeNull()
    })
  })

  describe('updateItemStatus', () => {
    it('should delegate to repository', async () => {
      const mockItem = {
        id: 'item-1',
        checklistId: 'cl-1',
        category: '合规性',
        attackAngle: '攻击',
        severity: 'critical' as const,
        defenseSuggestion: '防御',
        targetSection: null,
        targetSectionLocator: null,
        status: 'addressed' as const,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      mockUpdateItemStatus.mockResolvedValue(mockItem)

      const result = await attackChecklistService.updateItemStatus('item-1', 'addressed')
      expect(result).toEqual(mockItem)
      expect(mockUpdateItemStatus).toHaveBeenCalledWith('item-1', 'addressed')
    })
  })
})
