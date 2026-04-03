import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAccess = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRm = vi.fn()
vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

const mockFindProjectById = vi.fn()
vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindProjectById
  },
}))

const mockFindRequirementsByProject = vi.fn()
vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindRequirementsByProject
  },
}))

const mockFindScoringModelByProject = vi.fn()
vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    findByProject = mockFindScoringModelByProject
  },
}))

const mockFindMandatoryItemsByProject = vi.fn()
vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    findByProject = mockFindMandatoryItemsByProject
  },
}))

const mockCertaintyReplaceByProject = vi.fn()
const mockCertaintyFindByProject = vi.fn()
const mockCertaintyConfirmItem = vi.fn()
const mockCertaintyBatchConfirm = vi.fn()
const mockCertaintyDeleteByProject = vi.fn()
const mockCertaintyFindProjectId = vi.fn()
vi.mock('@main/db/repositories/requirement-certainty-repo', () => ({
  RequirementCertaintyRepository: class {
    replaceByProject = mockCertaintyReplaceByProject
    findByProject = mockCertaintyFindByProject
    confirmItem = mockCertaintyConfirmItem
    batchConfirm = mockCertaintyBatchConfirm
    deleteByProject = mockCertaintyDeleteByProject
    findProjectId = mockCertaintyFindProjectId
  },
}))

const mockEnqueue = vi.fn()
const mockExecute = vi.fn()
vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

const mockAgentExecute = vi.fn()
const mockGetAgentStatus = vi.fn()
vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockAgentExecute(...args),
    getAgentStatus: (...args: unknown[]) => mockGetAgentStatus(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
      this.name = 'BidWiseError'
    }
  }
  return { BidWiseError }
})

import { FogMapClassifier } from '@main/services/document-parser/fog-map-classifier'

describe('FogMapClassifier', () => {
  let classifier: FogMapClassifier

  const mockProject = {
    id: 'proj-1',
    name: '测试项目',
    rootPath: '/projects/proj-1',
  }

  const mockRequirements = [
    {
      id: 'req-1',
      sequenceNumber: 1,
      description: '系统应支持分布式架构',
      sourcePages: [1, 2],
      category: 'technical',
      priority: 'high',
      status: 'extracted',
    },
    {
      id: 'req-2',
      sequenceNumber: 2,
      description: '系统应具备良好的可扩展性',
      sourcePages: [3],
      category: 'technical',
      priority: 'medium',
      status: 'extracted',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    classifier = new FogMapClassifier()
    mockFindProjectById.mockResolvedValue(mockProject)
    mockFindRequirementsByProject.mockResolvedValue(mockRequirements)
    mockFindScoringModelByProject.mockResolvedValue(null)
    mockFindMandatoryItemsByProject.mockResolvedValue([])
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockEnqueue.mockResolvedValue('task-1')
    mockExecute.mockResolvedValue(undefined)
    mockCertaintyReplaceByProject.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generate', () => {
    it('should throw FOG_MAP_NO_REQUIREMENTS when no requirements exist', async () => {
      mockFindRequirementsByProject.mockResolvedValue([])

      await expect(classifier.generate({ projectId: 'proj-1' })).rejects.toThrow(
        '请先完成需求结构化抽取后再生成迷雾地图'
      )
    })

    it('should throw when project has no rootPath', async () => {
      mockFindProjectById.mockResolvedValue({ id: 'proj-1', rootPath: null })

      await expect(classifier.generate({ projectId: 'proj-1' })).rejects.toThrow(
        '项目未设置存储路径'
      )
    })

    it('should enqueue task and return taskId', async () => {
      const result = await classifier.generate({ projectId: 'proj-1' })

      expect(result).toEqual({ taskId: 'task-1' })
      expect(mockEnqueue).toHaveBeenCalledWith({
        category: 'import',
        input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      })
      expect(mockExecute).toHaveBeenCalledWith('task-1', expect.any(Function))
    })

    it('should gracefully degrade when scoringModel/mandatoryItems are missing', async () => {
      mockFindScoringModelByProject.mockRejectedValue(new Error('not found'))
      mockFindMandatoryItemsByProject.mockRejectedValue(new Error('not found'))

      const result = await classifier.generate({ projectId: 'proj-1' })
      expect(result.taskId).toBe('task-1')
    })

    it('should abort before persisting stale certainties when cancellation happens mid-run', async () => {
      mockExecute.mockImplementation(async (_taskId, executor) => executor)
      mockAgentExecute.mockResolvedValue({ taskId: 'agent-task-1' })

      const controller = new AbortController()
      mockGetAgentStatus.mockImplementation(async () => {
        controller.abort(new Error('Task cancelled'))
        return {
          status: 'completed',
          progress: 100,
          result: {
            content:
              '[{"requirementId":"req-1","certaintyLevel":"clear","reason":"明确","suggestion":"无需补充确认"}]',
          },
        }
      })

      await classifier.generate({ projectId: 'proj-1' })
      const executor = mockExecute.mock.calls[0]?.[1] as
        | ((ctx: {
            taskId: string
            input: unknown
            signal: AbortSignal
            updateProgress: (progress: number, message?: string) => void
            setCheckpoint: (data: unknown) => Promise<void>
            checkpoint?: unknown
          }) => Promise<unknown>)
        | undefined

      expect(executor).toBeTypeOf('function')

      await expect(
        executor!({
          taskId: 'task-1',
          input: { projectId: 'proj-1' },
          signal: controller.signal,
          updateProgress: vi.fn(),
          setCheckpoint: vi.fn().mockResolvedValue(undefined),
          checkpoint: undefined,
        })
      ).rejects.toMatchObject({ name: 'AbortError' })

      expect(mockCertaintyReplaceByProject).not.toHaveBeenCalled()
      expect(mockWriteFile).not.toHaveBeenCalled()
    })
  })

  describe('getFogMap', () => {
    it('should return null when never generated', async () => {
      mockCertaintyFindByProject.mockResolvedValue([])
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const result = await classifier.getFogMap('proj-1')
      expect(result).toBeNull()
    })

    it('should return empty array when generated but 0 items', async () => {
      mockCertaintyFindByProject.mockResolvedValue([])
      mockAccess.mockResolvedValue(undefined)

      const result = await classifier.getFogMap('proj-1')
      expect(result).toEqual([])
    })

    it('should JOIN certainties with requirements', async () => {
      mockCertaintyFindByProject.mockResolvedValue([
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'clear',
          reason: '描述具体',
          suggestion: '无需补充确认',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ])
      mockFindRequirementsByProject.mockResolvedValue(mockRequirements)

      const result = await classifier.getFogMap('proj-1')
      expect(result).toHaveLength(1)
      expect(result![0].requirement.id).toBe('req-1')
      expect(result![0].requirement.sequenceNumber).toBe(1)
      expect(result![0].certaintyLevel).toBe('clear')
    })

    it('should filter out certainties with missing requirements', async () => {
      mockCertaintyFindByProject.mockResolvedValue([
        {
          id: 'cert-1',
          requirementId: 'nonexistent',
          certaintyLevel: 'ambiguous',
          reason: 'test',
          suggestion: 'test',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ])
      mockFindRequirementsByProject.mockResolvedValue(mockRequirements)

      const result = await classifier.getFogMap('proj-1')
      expect(result).toHaveLength(0)
    })
  })

  describe('getSummary', () => {
    it('should return null when never generated', async () => {
      mockCertaintyFindByProject.mockResolvedValue([])
      mockAccess.mockRejectedValue(new Error('ENOENT'))

      const result = await classifier.getSummary('proj-1')
      expect(result).toBeNull()
    })

    it('should compute correct fogClearingPercentage', async () => {
      mockCertaintyFindByProject.mockResolvedValue([
        { certaintyLevel: 'clear', confirmed: false },
        { certaintyLevel: 'ambiguous', confirmed: true },
        { certaintyLevel: 'ambiguous', confirmed: false },
        { certaintyLevel: 'risky', confirmed: false },
      ])

      const result = await classifier.getSummary('proj-1')
      expect(result).toEqual({
        total: 4,
        clear: 1,
        ambiguous: 2,
        risky: 1,
        confirmed: 1,
        fogClearingPercentage: 50, // (1 clear + 1 confirmed) / 4 = 50%
      })
    })
  })

  describe('confirmCertainty', () => {
    it('should confirm item and sync snapshot', async () => {
      const confirmed = {
        id: 'cert-1',
        requirementId: 'req-1',
        certaintyLevel: 'ambiguous',
        reason: 'test',
        suggestion: 'test',
        confirmed: true,
        confirmedAt: '2026-04-01T00:00:00Z',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      }
      mockCertaintyConfirmItem.mockResolvedValue(confirmed)
      mockCertaintyFindProjectId.mockResolvedValue('proj-1')
      mockCertaintyFindByProject.mockResolvedValue([confirmed])

      const result = await classifier.confirmCertainty('cert-1')
      expect(result.confirmed).toBe(true)
      expect(mockCertaintyConfirmItem).toHaveBeenCalledWith('cert-1')
    })
  })

  describe('batchConfirm', () => {
    it('should batch confirm and sync snapshot', async () => {
      mockCertaintyBatchConfirm.mockResolvedValue(undefined)
      mockCertaintyFindByProject.mockResolvedValue([])

      await classifier.batchConfirm('proj-1')
      expect(mockCertaintyBatchConfirm).toHaveBeenCalledWith('proj-1')
    })
  })
})
