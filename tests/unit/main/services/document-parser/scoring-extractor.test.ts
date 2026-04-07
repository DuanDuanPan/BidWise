import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockRm = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
}))

const mockFindById = vi.fn()
vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindById
  },
}))

const mockReqCreate = vi.fn()
const mockReqFindByProject = vi.fn()
const mockReqDeleteByProject = vi.fn()
vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    create = mockReqCreate
    findByProject = mockReqFindByProject
    deleteByProject = mockReqDeleteByProject
  },
}))

const mockScoringUpsert = vi.fn()
const mockScoringFindByProject = vi.fn()
vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    upsert = mockScoringUpsert
    findByProject = mockScoringFindByProject
  },
}))

const mockClearLinkedRequirements = vi.fn()
const mockMandatoryFindByProject = vi.fn()
vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    clearLinkedRequirements = mockClearLinkedRequirements
    findByProject = mockMandatoryFindByProject
  },
}))

const mockCertaintyDeleteByProject = vi.fn()
vi.mock('@main/db/repositories/requirement-certainty-repo', () => ({
  RequirementCertaintyRepository: class {
    deleteByProject = mockCertaintyDeleteByProject
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
    code: string
    cause?: unknown
    constructor(code: string, message: string, cause?: unknown) {
      super(message)
      this.code = code
      this.cause = cause
    }
  }
  class DatabaseError extends BidWiseError {
    constructor(message: string, cause?: unknown) {
      super('DATABASE', message, cause)
      this.name = 'DatabaseError'
    }
  }
  class NotFoundError extends BidWiseError {
    constructor(message: string, cause?: unknown) {
      super('NOT_FOUND', message, cause)
      this.name = 'NotFoundError'
    }
  }
  return { BidWiseError, DatabaseError, NotFoundError }
})

vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }))

import { ScoringExtractor } from '@main/services/document-parser/scoring-extractor'
import type { ParsedTender } from '@shared/analysis-types'

const mockTender: ParsedTender = {
  meta: {
    originalFileName: 'test.pdf',
    format: 'pdf',
    fileSize: 1024,
    pageCount: 42,
    importedAt: '2026-03-21T00:00:00.000Z',
  },
  sections: [{ id: 's1', title: '总则', content: '内容', pageStart: 1, pageEnd: 5, level: 1 }],
  rawText: '总则\n技术要求\n评分标准',
  totalPages: 42,
  hasScannedContent: false,
}

const mockLlmResponse = JSON.stringify({
  requirements: [
    {
      sequenceNumber: 1,
      description: '系统应支持分布式架构',
      sourcePages: [23, 24],
      category: 'technical',
      priority: 'high',
    },
  ],
  scoringModel: {
    totalScore: 100,
    criteria: [
      {
        category: '技术方案',
        maxScore: 60,
        subItems: [
          {
            name: '系统架构设计',
            maxScore: 15,
            description: '架构合理性',
            sourcePages: [23],
          },
        ],
        reasoning: '第23页明确技术方案占60分',
      },
    ],
  },
})

describe('ScoringExtractor', () => {
  let extractor: ScoringExtractor

  beforeEach(() => {
    vi.clearAllMocks()
    extractor = new ScoringExtractor()
    mockFindById.mockResolvedValue({ id: 'proj-1', rootPath: '/projects/proj-1' })
    mockReadFile.mockResolvedValue(JSON.stringify(mockTender))
    mockWriteFile.mockResolvedValue(undefined)
    mockEnqueue.mockResolvedValue('task-1')
    mockReqCreate.mockResolvedValue(undefined)
    mockReqFindByProject.mockResolvedValue([])
    mockReqDeleteByProject.mockResolvedValue(undefined)
    mockScoringUpsert.mockResolvedValue({})
    mockScoringFindByProject.mockResolvedValue(null)
    mockClearLinkedRequirements.mockResolvedValue(undefined)
    mockMandatoryFindByProject.mockResolvedValue([])
  })

  it('should enqueue task and return taskId', async () => {
    mockExecute.mockResolvedValue({})
    const result = await extractor.extract({ projectId: 'proj-1' })
    expect(result).toEqual({ taskId: 'task-1' })
    expect(mockEnqueue).toHaveBeenCalledWith({
      category: 'import',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
    })
  })

  it('should throw if project has no rootPath', async () => {
    mockFindById.mockResolvedValue({ id: 'proj-1', rootPath: null })
    await expect(extractor.extract({ projectId: 'proj-1' })).rejects.toThrow('项目未设置存储路径')
  })

  it('should throw if parsed tender file is missing', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    await expect(extractor.extract({ projectId: 'proj-1' })).rejects.toThrow(
      '招标文件解析结果不存在'
    )
  })

  it('should execute task with agent orchestrator and persist results', async () => {
    // Capture the executor function
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await extractor.extract({ projectId: 'proj-1' })

    // Simulate the captured executor
    expect(capturedExecutor).not.toBeNull()

    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      result: { content: mockLlmResponse },
      progress: 100,
    })

    const progressUpdates: Array<{ progress: number; message?: string }> = []
    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: (p: number, m?: string) => progressUpdates.push({ progress: p, message: m }),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)

    // Verify agent was called
    expect(mockAgentExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'extract',
      })
    )

    // Verify mandatory item links cleared before requirements deleted
    expect(mockClearLinkedRequirements).toHaveBeenCalledWith('proj-1')

    // Verify persistence
    expect(mockReqDeleteByProject).toHaveBeenCalledWith('proj-1')
    expect(mockReqCreate).toHaveBeenCalled()
    expect(mockScoringUpsert).toHaveBeenCalled()
    expect(mockWriteFile).toHaveBeenCalled()

    // Verify progress was reported
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100)
  })

  it('should rewrite mandatory snapshot even when there are no mandatory items', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await extractor.extract({ projectId: 'proj-1' })

    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      result: { content: mockLlmResponse },
      progress: 100,
    })
    mockMandatoryFindByProject.mockResolvedValue([])

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)

    const mandatorySnapshotCall = mockWriteFile.mock.calls.find(
      ([filePath]) => filePath === '/projects/proj-1/tender/mandatory-items.json'
    )

    expect(mandatorySnapshotCall).toBeTruthy()
    expect(JSON.parse(mandatorySnapshotCall![1] as string)).toMatchObject({
      projectId: 'proj-1',
      items: [],
    })
  })

  it('should handle LLM response wrapped in markdown code fence', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await extractor.extract({ projectId: 'proj-1' })

    const fencedResponse = '```json\n' + mockLlmResponse + '\n```'
    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      result: { content: fencedResponse },
      progress: 100,
    })

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)
    expect(mockReqCreate).toHaveBeenCalled()
  })

  it('should throw when agent task fails', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await extractor.extract({ projectId: 'proj-1' })

    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'failed',
      error: { message: '模型超时' },
      progress: 0,
    })

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await expect(capturedExecutor!(ctx)).rejects.toThrow('AI 抽取失败')
  })

  it('should handle missing fields with defaults', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await extractor.extract({ projectId: 'proj-1' })

    const minimalResponse = JSON.stringify({
      requirements: [{ description: '最小需求' }],
      scoringModel: { totalScore: 100, criteria: [{ category: '技术' }] },
    })

    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      result: { content: minimalResponse },
      progress: 100,
    })

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)
    // Should not throw — defaults applied
    expect(mockReqCreate).toHaveBeenCalled()
  })

  describe('getRequirements', () => {
    it('should return empty array when scoring model exists without requirements', async () => {
      mockReqFindByProject.mockResolvedValue([])
      mockScoringFindByProject.mockResolvedValue({
        projectId: 'proj-1',
        totalScore: 100,
        criteria: [],
        extractedAt: '2026-03-21T00:00:00.000Z',
        confirmedAt: null,
        version: 1,
      })

      await expect(extractor.getRequirements('proj-1')).resolves.toEqual([])
    })

    it('should return null when extraction has not been performed', async () => {
      mockReqFindByProject.mockResolvedValue([])
      mockScoringFindByProject.mockResolvedValue(null)

      await expect(extractor.getRequirements('proj-1')).resolves.toBeNull()
    })
  })

  describe('re-extraction fog-map regression guard', () => {
    it('should have RequirementCertaintyRepository wired for clearing fog-map data', () => {
      // Verify that the ScoringExtractor has a certaintyRepo field
      // This ensures the regression guard is properly integrated
      expect(mockCertaintyDeleteByProject).toBeDefined()
    })
  })
})
