import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks (hoisted so vi.mock factories can reference them) ───

const mockLoad = vi.hoisted(() => vi.fn())
const mockGetMetadata = vi.hoisted(() => vi.fn())
const mockUpdateMetadata = vi.hoisted(() => vi.fn())
const mockExecute = vi.hoisted(() => vi.fn())
const mockExecuteWithCallback = vi.hoisted(() => vi.fn())
const mockBatchOrcGet = vi.hoisted(() => vi.fn())
const mockBatchOrcPrepareRetry = vi.hoisted(() => vi.fn())
const mockBatchOrcResetRetryCount = vi.hoisted(() => vi.fn())
const mockBatchOrcMarkRunning = vi.hoisted(() => vi.fn())
const mockBatchOrcOnSectionComplete = vi.hoisted(() => vi.fn())
const mockBatchOrcOnSectionFailed = vi.hoisted(() => vi.fn())
const mockBatchOrcDelete = vi.hoisted(() => vi.fn())
const mockBatchOrcGetRetryCount = vi.hoisted(() => vi.fn())
const mockBatchOrcIncrementRetryCount = vi.hoisted(() => vi.fn())
const mockBatchOrcMarkRetrying = vi.hoisted(() => vi.fn())
const mockProgressEmit = vi.hoisted(() => vi.fn())
const mockTaskQueueDelete = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockFindRequirements = vi.hoisted(() => vi.fn())
const mockFindScoringModel = vi.hoisted(() => vi.fn())
const mockFindMandatoryItems = vi.hoisted(() => vi.fn())
const mockFindBySection = vi.hoisted(() => vi.fn())
const mockGetProjectWritingStyle = vi.hoisted(() => vi.fn())
const mockChapterSummaryList = vi.hoisted(() => vi.fn())
const mockChapterSummaryEnqueue = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock-user-data'),
  },
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: (...args: unknown[]) => mockLoad(...args),
    getMetadata: (...args: unknown[]) => mockGetMetadata(...args),
    updateMetadata: (...args: unknown[]) => mockUpdateMetadata(...args),
  },
}))

vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockExecute(...args),
    executeWithCallback: (...args: unknown[]) => mockExecuteWithCallback(...args),
  },
  batchOrchestrationManager: {
    get: (...args: unknown[]) => mockBatchOrcGet(...args),
    prepareRetry: (...args: unknown[]) => mockBatchOrcPrepareRetry(...args),
    resetRetryCount: (...args: unknown[]) => mockBatchOrcResetRetryCount(...args),
    markRunning: (...args: unknown[]) => mockBatchOrcMarkRunning(...args),
    onSectionComplete: (...args: unknown[]) => mockBatchOrcOnSectionComplete(...args),
    onSectionFailed: (...args: unknown[]) => mockBatchOrcOnSectionFailed(...args),
    delete: (...args: unknown[]) => mockBatchOrcDelete(...args),
    getRetryCount: (...args: unknown[]) => mockBatchOrcGetRetryCount(...args),
    incrementRetryCount: (...args: unknown[]) => mockBatchOrcIncrementRetryCount(...args),
    markRetrying: (...args: unknown[]) => mockBatchOrcMarkRetrying(...args),
  },
}))

vi.mock('@main/services/task-queue/progress-emitter', () => ({
  progressEmitter: {
    emit: (...args: unknown[]) => mockProgressEmit(...args),
  },
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    delete: (...args: unknown[]) => mockTaskQueueDelete(...args),
  },
}))

vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindRequirements
  },
}))

vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    findByProject = mockFindScoringModel
  },
}))

vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    findByProject = mockFindMandatoryItems
  },
}))

vi.mock('@main/db/repositories/traceability-link-repo', () => ({
  TraceabilityLinkRepository: class {
    findBySection = mockFindBySection
  },
}))

vi.mock('@main/services/writing-style-service', () => ({
  writingStyleService: {
    getProjectWritingStyle: (...args: unknown[]) => mockGetProjectWritingStyle(...args),
  },
  serializeStyleForPrompt: (style: { name: string }) => `文风：${style.name}`,
}))

vi.mock('@main/services/chapter-summary-store', () => ({
  chapterSummaryStore: {
    list: (...args: unknown[]) => mockChapterSummaryList(...args),
  },
}))

vi.mock('@main/services/chapter-summary-service', () => ({
  chapterSummaryService: {
    enqueueExtraction: (...args: unknown[]) => mockChapterSummaryEnqueue(...args),
  },
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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
  class ValidationError extends BidWiseError {
    constructor(message: string) {
      super('VALIDATION_ERROR', message)
      this.name = 'ValidationError'
    }
  }
  return { BidWiseError, ValidationError }
})

import { chapterGenerationService } from '@main/services/chapter-generation-service'

const PROPOSAL_MD = `# 投标技术方案

## 项目概述

> 请介绍项目背景和目标

## 系统架构设计

> 请设计系统整体架构

## 实施计划

第一阶段：需求调研
第二阶段：系统开发
`

const PROPOSAL_WITH_CONTENT_MD = `# 投标技术方案

## 项目概述

> 请介绍项目背景和目标

## 系统架构设计

本方案采用微服务架构，基于 Spring Cloud 生态体系。

## 实施计划

第一阶段：需求调研
`

describe('@story-3-4 chapterGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoad.mockResolvedValue({ content: PROPOSAL_MD })
    mockGetMetadata.mockResolvedValue({ sectionIndex: [] })
    mockFindRequirements.mockResolvedValue([])
    mockFindScoringModel.mockResolvedValue(null)
    mockFindMandatoryItems.mockResolvedValue([])
    mockFindBySection.mockResolvedValue([])
    mockGetProjectWritingStyle.mockResolvedValue({
      id: 'general',
      name: '通用文风',
      toneGuidance: '专业、清晰',
      vocabularyRules: [],
      forbiddenWords: [],
      sentencePatterns: [],
      source: 'built-in',
    })
    mockChapterSummaryList.mockResolvedValue([])
    mockChapterSummaryEnqueue.mockResolvedValue({ taskId: 'task-sum-stub' })
    mockExecute.mockResolvedValue({ taskId: 'task-gen-1' })
  })

  describe('generateChapter', () => {
    it('@p0 should locate target heading and dispatch to orchestrator', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.generateChapter('proj-1', target)

      expect(result).toEqual({ taskId: 'task-gen-1' })
      expect(mockExecute).toHaveBeenCalledTimes(1)
      const request = mockExecute.mock.calls[0][0]
      expect(request.agentType).toBe('generate')
      expect(request.context.chapterTitle).toBe('系统架构设计')
      expect(request.context.chapterLevel).toBe(2)
      expect(request.options.timeoutMs).toBe(1_800_000)
      expect(request.options.maxRetries).toBe(0)
    })

    it('@p0 should throw when target heading is not found', async () => {
      const target = { title: '不存在的章节', level: 2 as const, occurrenceIndex: 0 }

      await expect(chapterGenerationService.generateChapter('proj-1', target)).rejects.toThrow(
        '章节未找到'
      )
    })

    it('@p0 should reject generation for non-empty chapters', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_CONTENT_MD })
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await expect(chapterGenerationService.generateChapter('proj-1', target)).rejects.toThrow(
        '已有内容'
      )
    })

    it('@p0 should allow generation for guidance-only chapters', async () => {
      const target = { title: '项目概述', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.generateChapter('proj-1', target)
      expect(result).toEqual({ taskId: 'task-gen-1' })
    })

    it('@p1 should extract guidance text from blockquotes', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.guidanceText).toBe('请设计系统整体架构')
    })

    it('@p1 should include adjacent chapter summaries', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.adjacentChaptersBefore).toContain('项目概述')
      expect(request.context.adjacentChaptersAfter).toContain('实施计划')
    })

    it('@p1 should not use parent headings as adjacent chapter summaries', async () => {
      const target = { title: '项目概述', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.adjacentChaptersBefore).toBeUndefined()
      expect(request.context.adjacentChaptersAfter).toContain('系统架构设计')
    })

    it('@p1 should include requirements when available', async () => {
      mockFindRequirements.mockResolvedValue([
        { category: '技术', priority: '高', description: '支持高并发' },
      ])
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.requirements).toContain('支持高并发')
    })

    it('@p1 should include scoring model weights when available', async () => {
      mockFindScoringModel.mockResolvedValue({
        criteria: [
          {
            category: '技术方案',
            maxScore: 30,
            weight: 0.3,
            subItems: [{ name: '架构设计' }, { name: '安全性' }],
          },
        ],
      })
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.scoringWeights).toContain('技术方案')
      expect(request.context.scoringWeights).toContain('30分')
    })

    it('@p1 should include non-dismissed mandatory items', async () => {
      mockFindMandatoryItems.mockResolvedValue([
        { content: '等保三级', status: 'confirmed' },
        { content: '已废弃条款', status: 'dismissed' },
      ])
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.mandatoryItems).toContain('等保三级')
      expect(request.context.mandatoryItems).not.toContain('已废弃条款')
    })

    it('@p1 should gracefully degrade when seed.json is missing', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.generateChapter('proj-1', target)

      expect(result).toEqual({ taskId: 'task-gen-1' })
      const request = mockExecute.mock.calls[0][0]
      expect(request.context.strategySeed).toBeUndefined()
    })

    it('@p1 should include writing style in context when available', async () => {
      mockGetProjectWritingStyle.mockResolvedValue({
        id: 'military',
        name: '军工文风',
        toneGuidance: '严谨、精确',
        vocabularyRules: [],
        forbiddenWords: [],
        sentencePatterns: [],
        source: 'built-in',
      })
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.writingStyle).toContain('军工文风')
    })

    it('@p1 should propagate writing style config errors (fail-fast)', async () => {
      mockGetProjectWritingStyle.mockRejectedValue(new Error('general 文风模板缺失'))
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await expect(chapterGenerationService.generateChapter('proj-1', target)).rejects.toThrow(
        'general 文风模板缺失'
      )
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it('@p1 should gracefully degrade when requirements fail to load', async () => {
      mockFindRequirements.mockRejectedValue(new Error('DB error'))
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.generateChapter('proj-1', target)
      expect(result).toEqual({ taskId: 'task-gen-1' })
    })

    it('@p1 should include baselineDigest in context', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.baselineDigest).toBeDefined()
      expect(typeof request.context.baselineDigest).toBe('string')
      expect(request.context.baselineDigest.length).toBe(16)
    })

    it('@p1 should enable diagram flow for diagram-heavy chapters', async () => {
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.enableDiagrams).toBe(true)
    })

    it('@p1 should disable diagram flow for text-first chapters', async () => {
      const target = { title: '项目概述', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.enableDiagrams).toBe(false)
    })
  })

  describe('regenerateChapter', () => {
    it('@p0 should allow regeneration of non-empty chapters', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_CONTENT_MD })
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.regenerateChapter(
        'proj-1',
        target,
        '重点突出安全性'
      )

      expect(result).toEqual({ taskId: 'task-gen-1' })
      const request = mockExecute.mock.calls[0][0]
      expect(request.context.additionalContext).toBe('重点突出安全性')
    })

    it('@p0 should throw when target heading is not found', async () => {
      const target = { title: '不存在', level: 2 as const, occurrenceIndex: 0 }

      await expect(
        chapterGenerationService.regenerateChapter('proj-1', target, 'context')
      ).rejects.toThrow('章节未找到')
    })
  })

  describe('requirement filtering via traceability links', () => {
    const PROPOSAL_WITH_MATRIX_MD = `# 投标技术方案

## 系统架构设计

> 请设计系统整体架构

## 需求响应对照表

> 逐条对照招标要求进行响应说明。
`
    const allRequirements = [
      { id: 'r1', category: 'technical', priority: 'high', description: '支持高并发' },
      { id: 'r2', category: 'service', priority: 'medium', description: '提供7×24服务' },
      { id: 'r3', category: 'qualification', priority: 'high', description: 'CMMI 3级' },
    ]

    it('@p1 should filter requirements by traceability links for non-matrix chapters', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_MATRIX_MD })
      mockFindRequirements.mockResolvedValue(allRequirements)
      mockGetMetadata.mockResolvedValue({
        sectionIndex: [
          {
            sectionId: 's3.1',
            title: '系统架构设计',
            level: 2,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
          },
        ],
      })
      mockFindBySection.mockResolvedValue([{ requirementId: 'r1', sectionId: 's3.1' }])
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.requirements).toContain('支持高并发')
      expect(request.context.requirements).not.toContain('7×24服务')
      expect(request.context.requirements).not.toContain('CMMI')
    })

    it('@p1 should pass all requirements for compliance matrix chapters', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_MATRIX_MD })
      mockFindRequirements.mockResolvedValue(allRequirements)
      const target = { title: '需求响应对照表', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.requirements).toContain('支持高并发')
      expect(request.context.requirements).toContain('7×24服务')
      expect(request.context.requirements).toContain('CMMI')
      expect(mockFindBySection).not.toHaveBeenCalled()
    })

    it('@p1 should fallback to all requirements when no traceability links exist', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_MATRIX_MD })
      mockFindRequirements.mockResolvedValue(allRequirements)
      mockGetMetadata.mockResolvedValue({
        sectionIndex: [
          {
            sectionId: 's3.1',
            title: '系统架构设计',
            level: 2,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
          },
        ],
      })
      mockFindBySection.mockResolvedValue([])
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.requirements).toContain('支持高并发')
      expect(request.context.requirements).toContain('7×24服务')
      expect(request.context.requirements).toContain('CMMI')
    })

    it('@p1 should fallback to all requirements when sectionId cannot be resolved', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_MATRIX_MD })
      mockFindRequirements.mockResolvedValue(allRequirements)
      mockGetMetadata.mockResolvedValue({ sectionIndex: [] })
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.requirements).toContain('支持高并发')
      expect(request.context.requirements).toContain('7×24服务')
    })

    it('@p1 should fallback gracefully when traceability link query fails', async () => {
      mockLoad.mockResolvedValue({ content: PROPOSAL_WITH_MATRIX_MD })
      mockFindRequirements.mockResolvedValue(allRequirements)
      mockGetMetadata.mockResolvedValue({
        sectionIndex: [
          {
            sectionId: 's3.1',
            title: '系统架构设计',
            level: 2,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '系统架构设计', level: 2, occurrenceIndex: 0 },
          },
        ],
      })
      mockFindBySection.mockRejectedValue(new Error('DB error'))
      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      const result = await chapterGenerationService.generateChapter('proj-1', target)
      expect(result).toEqual({ taskId: 'task-gen-1' })
      const request = mockExecute.mock.calls[0][0]
      // Should fallback to all requirements
      expect(request.context.requirements).toContain('支持高并发')
      expect(request.context.requirements).toContain('7×24服务')
    })
  })

  describe('heading extraction', () => {
    it('@p1 should handle fenced code blocks without false heading matches', async () => {
      const mdWithFence = `## 真正的标题

> 指导

## 另一个真标题

\`\`\`
## 代码注释中的假标题
\`\`\`
`
      mockLoad.mockResolvedValue({ content: mdWithFence })
      // The code fence heading should NOT be treated as a real heading
      // "真正的标题" is guidance-only, "另一个真标题" has code content
      const target = { title: '真正的标题', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.chapterTitle).toBe('真正的标题')
      // Adjacent after should point to 另一个真标题, not the fake heading in code fence
      expect(request.context.adjacentChaptersAfter).toContain('另一个真标题')
    })

    it('@p1 should handle occurrenceIndex for duplicate heading titles', async () => {
      const mdWithDupes = `## 概述

> 第一个

## 技术方案

> 内容

## 概述

> 第二个
`
      mockLoad.mockResolvedValue({ content: mdWithDupes })
      const target = { title: '概述', level: 2 as const, occurrenceIndex: 1 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.chapterTitle).toBe('概述')
    })

    it('@p1 should match headings with inline markdown formatting', async () => {
      mockLoad.mockResolvedValue({
        content: `## **系统架构设计**

> 请设计系统整体架构
`,
      })

      const target = { title: '系统架构设计', level: 2 as const, occurrenceIndex: 0 }

      await chapterGenerationService.generateChapter('proj-1', target)

      const request = mockExecute.mock.calls[0][0]
      expect(request.context.chapterTitle).toBe('系统架构设计')
      expect(request.context.guidanceText).toBe('请设计系统整体架构')
    })
  })
})

describe('@story-3-11 chapterGenerationService — batch retry/skip', () => {
  const mockOrch = {
    id: 'batch-1',
    projectId: 'proj-1',
    parentTarget: { title: '系统设计', level: 2, occurrenceIndex: 0 },
    skeleton: {
      parentTitle: '系统设计',
      parentLevel: 2,
      sections: [
        { title: '功能', level: 3, dimensions: [] },
        { title: '接口', level: 3, dimensions: [] },
        { title: '安全', level: 3, dimensions: [] },
      ],
      dimensionChecklist: [],
      confirmedAt: '2026-04-16T00:00:00.000Z',
    },
    sectionId: 'sec-1',
    sections: [
      {
        index: 0,
        section: { title: '功能', level: 3, dimensions: [] },
        state: 'completed',
        taskId: 't0',
        content: '功能内容',
        retryCount: 0,
      },
      {
        index: 1,
        section: { title: '接口', level: 3, dimensions: [] },
        state: 'failed',
        taskId: 't1',
        error: 'timeout',
        retryCount: 3,
      },
      {
        index: 2,
        section: { title: '安全', level: 3, dimensions: [] },
        state: 'pending',
        taskId: null,
        retryCount: 0,
      },
    ],
    contextBase: { projectId: 'proj-1' },
    createdAt: '2026-04-16T00:00:00.000Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockBatchOrcGet.mockReturnValue(mockOrch)
    mockExecuteWithCallback.mockResolvedValue({ taskId: 'task-retry-1' })
  })

  describe('batchRetrySection', () => {
    it('@p0 should reset retry count and dispatch failed section', async () => {
      mockBatchOrcPrepareRetry.mockReturnValue({
        section: { title: '接口', level: 3, dimensions: [] },
        previousSections: [{ title: '功能', markdown: '功能内容' }],
        contextBase: { projectId: 'proj-1' },
      })

      const result = await chapterGenerationService.batchRetrySection('proj-1', 'batch-1', 1)

      expect(result.taskId).toBe('task-retry-1')
      expect(result.batchId).toBe('batch-1')
      expect(result.sectionIndex).toBe(1)
      expect(mockBatchOrcResetRetryCount).toHaveBeenCalledWith('batch-1', 1)
      expect(mockBatchOrcPrepareRetry).toHaveBeenCalledWith('batch-1', 1)
      expect(mockBatchOrcMarkRunning).toHaveBeenCalledWith('batch-1', 1, 'task-retry-1')
    })

    it('@p0 should throw when batch not found', async () => {
      mockBatchOrcGet.mockReturnValue(undefined)

      await expect(
        chapterGenerationService.batchRetrySection('proj-1', 'nonexistent', 1)
      ).rejects.toThrow('BatchOrchestration not found')
    })

    it('@p0 should throw when project ID mismatches', async () => {
      await expect(
        chapterGenerationService.batchRetrySection('wrong-project', 'batch-1', 1)
      ).rejects.toThrow('Project ID does not match')
    })

    it('@p1 should throw when section not found in prepareRetry', async () => {
      mockBatchOrcPrepareRetry.mockReturnValue(undefined)

      await expect(
        chapterGenerationService.batchRetrySection('proj-1', 'batch-1', 99)
      ).rejects.toThrow('Section 99 not found')
    })

    it('@p0 @story-3-11 should auto-detect first failed section when sectionIndex omitted', async () => {
      mockBatchOrcPrepareRetry.mockReturnValue({
        section: { title: '接口', level: 3, dimensions: [] },
        previousSections: [],
        contextBase: { projectId: 'proj-1' },
      })

      const result = await chapterGenerationService.batchRetrySection('proj-1', 'batch-1')

      // mockOrch.sections[1] has state: 'failed' → auto-detected index 1
      expect(result.sectionIndex).toBe(1)
      expect(mockBatchOrcResetRetryCount).toHaveBeenCalledWith('batch-1', 1)
      expect(mockBatchOrcPrepareRetry).toHaveBeenCalledWith('batch-1', 1)
    })
  })

  describe('batchSkipSection', () => {
    it('@p0 should write placeholder and continue chain', async () => {
      mockBatchOrcOnSectionComplete.mockReturnValue({
        assembledSnapshot: '# mock assembled',
        completedCount: 2,
        totalCount: 3,
        allDone: false,
        failedSections: [],
        nextSection: {
          index: 2,
          section: { title: '安全', level: 3, dimensions: [] },
          previousSections: [],
        },
      })
      mockExecuteWithCallback.mockResolvedValue({ taskId: 'task-next-1' })

      const result = await chapterGenerationService.batchSkipSection('proj-1', 'batch-1', 1)

      expect(result.skippedSectionIndex).toBe(1)
      expect(result.nextTaskId).toBe('task-next-1')
      expect(result.nextSectionIndex).toBe(2)
      expect(result.assembledSnapshot).toBe('# mock assembled')
      expect(mockBatchOrcOnSectionComplete).toHaveBeenCalledWith(
        'batch-1',
        1,
        '> [已跳过 - 请手动补充]'
      )
      // Skipped section's failed task must be purged so stale error does not rehydrate on relaunch
      expect(mockTaskQueueDelete).toHaveBeenCalledWith('t1')
    })

    it('@p0 should complete batch when skipping the last section', async () => {
      mockBatchOrcOnSectionComplete.mockReturnValue({
        assembledSnapshot: '# all done',
        completedCount: 3,
        totalCount: 3,
        allDone: true,
        failedSections: [],
      })

      const result = await chapterGenerationService.batchSkipSection('proj-1', 'batch-1', 1)

      expect(result.nextTaskId).toBeUndefined()
      expect(mockBatchOrcDelete).toHaveBeenCalledWith('batch-1')
      // Terminal skip purges every section taskId so restart starts clean
      expect(mockTaskQueueDelete).toHaveBeenCalledWith('t1')
      expect(mockTaskQueueDelete).toHaveBeenCalledWith('t0')
      expect(mockProgressEmit).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'batch-complete' })
      )
    })

    it('@p0 should throw when batch not found', async () => {
      mockBatchOrcGet.mockReturnValue(undefined)

      await expect(
        chapterGenerationService.batchSkipSection('proj-1', 'nonexistent', 1)
      ).rejects.toThrow('BatchOrchestration not found')
    })
  })

  describe('_onBatchSectionDone auto-retry failure fallback', () => {
    it('@p1 emits batch-section-failed when prepareRetry cannot rebuild context', async () => {
      vi.useFakeTimers()
      mockBatchOrcGetRetryCount.mockReturnValue(0)
      mockBatchOrcIncrementRetryCount.mockReturnValue(1)
      mockBatchOrcOnSectionFailed.mockReturnValue({
        assembledSnapshot: '# partial snapshot',
        completedCount: 1,
        totalCount: 3,
        allDone: false,
        failedSections: [{ index: 1, title: '接口', error: 'timeout' }],
      })
      mockBatchOrcPrepareRetry.mockReturnValue(undefined)

      try {
        await chapterGenerationService._onBatchSectionDone('batch-1', 1, 'task-failed-1', {
          status: 'failed',
          error: 'timeout',
        })

        expect(mockProgressEmit).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            taskId: 'task-failed-1',
            message: 'batch-section-retrying',
            payload: expect.objectContaining({
              kind: 'batch-section-retrying',
              batchId: 'batch-1',
              sectionIndex: 1,
              retryCount: 1,
              retryInSeconds: 5,
            }),
          })
        )

        await vi.advanceTimersByTimeAsync(5_000)

        expect(mockBatchOrcOnSectionFailed).toHaveBeenNthCalledWith(
          2,
          'batch-1',
          1,
          '自动重试失败：无法准备重试上下文'
        )
        expect(mockProgressEmit).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            taskId: 'task-failed-1',
            message: 'batch-section-failed',
            payload: expect.objectContaining({
              kind: 'batch-section-failed',
              batchId: 'batch-1',
              sectionIndex: 1,
              error: '自动重试失败：无法准备重试上下文',
            }),
          })
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('@p1 emits batch-section-failed when auto-retry dispatch throws', async () => {
      vi.useFakeTimers()
      mockBatchOrcGetRetryCount.mockReturnValue(0)
      mockBatchOrcIncrementRetryCount.mockReturnValue(1)
      mockBatchOrcOnSectionFailed.mockReturnValue({
        assembledSnapshot: '# partial snapshot',
        completedCount: 1,
        totalCount: 3,
        allDone: false,
        failedSections: [{ index: 1, title: '接口', error: 'timeout' }],
      })
      mockBatchOrcPrepareRetry.mockReturnValue({
        section: { title: '接口', level: 3, dimensions: [] },
        previousSections: [{ title: '功能', markdown: '功能内容' }],
        contextBase: { projectId: 'proj-1' },
      })
      const dispatchSpy = vi
        .spyOn(chapterGenerationService, '_dispatchBatchSingleSection')
        .mockRejectedValue(new Error('dispatch boom'))

      try {
        await chapterGenerationService._onBatchSectionDone('batch-1', 1, 'task-failed-2', {
          status: 'failed',
          error: 'timeout',
        })

        await vi.advanceTimersByTimeAsync(5_000)

        expect(dispatchSpy).toHaveBeenCalledWith(
          'batch-1',
          1,
          { title: '接口', level: 3, dimensions: [] },
          [{ title: '功能', markdown: '功能内容' }],
          { projectId: 'proj-1' }
        )
        expect(mockBatchOrcOnSectionFailed).toHaveBeenNthCalledWith(
          2,
          'batch-1',
          1,
          '自动重试失败：dispatch boom'
        )
        expect(mockProgressEmit).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            taskId: 'task-failed-2',
            message: 'batch-section-failed',
            payload: expect.objectContaining({
              kind: 'batch-section-failed',
              batchId: 'batch-1',
              sectionIndex: 1,
              error: '自动重试失败：dispatch boom',
            }),
          })
        )
        expect(mockBatchOrcMarkRunning).not.toHaveBeenCalled()
      } finally {
        dispatchSpy.mockRestore()
        vi.useRealTimers()
      }
    })
  })
})

// ── Story 3.12: global summary context wiring ──────────────────────────────

const MULTI_CHAPTER_MD = `# 投标技术方案

## 1 项目概述

本项目旨在为客户提供数字化平台解决方案。

## 2 系统架构设计

> 请设计系统整体架构

### 2.1 总体设计

分层架构：接入层 / 服务层 / 数据层。

### 2.2 数据流

数据从采集到消费的全链路。

## 3 实施计划

第一阶段：需求调研
第二阶段：系统开发

## 5 部署方案

采用 Kubernetes 多集群部署。
`

describe('@story-3-12 chapterGenerationService — generatedChaptersContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoad.mockResolvedValue({ content: MULTI_CHAPTER_MD })
    mockGetMetadata.mockResolvedValue({ sectionIndex: [] })
    mockFindRequirements.mockResolvedValue([])
    mockFindScoringModel.mockResolvedValue(null)
    mockFindMandatoryItems.mockResolvedValue([])
    mockFindBySection.mockResolvedValue([])
    mockGetProjectWritingStyle.mockResolvedValue({
      id: 'general',
      name: '通用文风',
      toneGuidance: '专业、清晰',
      vocabularyRules: [],
      forbiddenWords: [],
      sentencePatterns: [],
      source: 'built-in',
    })
    mockChapterSummaryList.mockResolvedValue([])
    mockChapterSummaryEnqueue.mockResolvedValue({ taskId: 'task-sum-stub' })
    mockExecute.mockResolvedValue({ taskId: 'task-gen-1' })
  })

  it('@p0 injects four-group context ordered by tree distance', async () => {
    const target = { title: '2 系统架构设计', level: 2 as const, occurrenceIndex: 0 }
    await chapterGenerationService.regenerateChapter('proj-1', target, '')

    const request = mockExecute.mock.calls[0][0]
    const ctx = request.context.generatedChaptersContext
    expect(ctx).toBeDefined()
    // Descendants: 2.1 and 2.2 (level 3 under target)
    expect(ctx.descendants.map((s: { headingTitle: string }) => s.headingTitle)).toEqual(
      expect.arrayContaining(['2.1 总体设计', '2.2 数据流'])
    )
    // Siblings: 1 项目概述 / 3 实施计划 / 5 部署方案
    expect(ctx.siblings.map((s: { headingTitle: string }) => s.headingTitle)).toEqual(
      expect.arrayContaining(['1 项目概述', '3 实施计划', '5 部署方案'])
    )
    // No ancestors beyond root
    expect(ctx.ancestors.length).toBeLessThanOrEqual(1)
  })

  it('@p0 hydrates from cache when lineHash matches', async () => {
    // Pre-populate sidecar with a summary matching the current direct body of "1 项目概述".
    const { createContentDigest } = await import('@shared/chapter-markdown')
    const directBody1 = '\n本项目旨在为客户提供数字化平台解决方案。\n'
    const entry = {
      headingKey: '2:1 项目概述:0',
      headingTitle: '1 项目概述',
      headingLevel: 2 as const,
      occurrenceIndex: 0,
      lineHash: createContentDigest(directBody1),
      summary: '{"key_commitments":["平台承诺"]}',
      generatedAt: '2026-04-17T10:00:00.000Z',
      provider: 'claude',
      model: 'claude-opus-4-7',
    }
    mockChapterSummaryList.mockResolvedValue([entry])

    const target = { title: '2 系统架构设计', level: 2 as const, occurrenceIndex: 0 }
    await chapterGenerationService.regenerateChapter('proj-1', target, '')

    const request = mockExecute.mock.calls[0][0]
    const ctx = request.context.generatedChaptersContext
    const overview = [...ctx.siblings, ...ctx.descendants, ...ctx.ancestors, ...ctx.others].find(
      (s: { headingTitle: string }) => s.headingTitle === '1 项目概述'
    )
    expect(overview).toBeDefined()
    expect(overview.source).toBe('cache')
    expect(overview.summary).toContain('key_commitments')
  })

  it('@p0 falls back to direct-body truncation on hash mismatch', async () => {
    const entry = {
      headingKey: '2:1 项目概述:0',
      headingTitle: '1 项目概述',
      headingLevel: 2 as const,
      occurrenceIndex: 0,
      lineHash: 'stale-hash',
      summary: 'cached but stale',
      generatedAt: '2026-04-17T10:00:00.000Z',
      provider: 'claude',
      model: 'claude-opus-4-7',
    }
    mockChapterSummaryList.mockResolvedValue([entry])

    const target = { title: '2 系统架构设计', level: 2 as const, occurrenceIndex: 0 }
    await chapterGenerationService.regenerateChapter('proj-1', target, '')

    const ctx = mockExecute.mock.calls[0][0].context.generatedChaptersContext
    const overview = ctx.siblings.find(
      (s: { headingTitle: string }) => s.headingTitle === '1 项目概述'
    )
    expect(overview.source).toBe('fallback')
    expect(overview.summary).toContain('本项目旨在')
  })

  it('@p0 caps top-N at 8 candidates by distance', async () => {
    const longMd = [
      '# root',
      ...Array.from({ length: 20 }, (_, i) => `## ch${i}\n\ncontent ${i}`),
    ].join('\n\n')
    mockLoad.mockResolvedValue({ content: longMd })

    const target = { title: 'ch5', level: 2 as const, occurrenceIndex: 0 }
    // target chapter already has content — regenerateChapter skips empty-check
    await chapterGenerationService.regenerateChapter('proj-1', target, '')

    const ctx = mockExecute.mock.calls[0][0].context.generatedChaptersContext
    const total =
      ctx.ancestors.length + ctx.siblings.length + ctx.descendants.length + ctx.others.length
    expect(total).toBe(8)
  })

  it('@p1 returns undefined when all other chapters have empty direct bodies', async () => {
    mockLoad.mockResolvedValue({
      content: '# root\n\n## only target\n\n> guidance only, no body\n',
    })

    const target = { title: 'only target', level: 2 as const, occurrenceIndex: 0 }
    await chapterGenerationService.generateChapter('proj-1', target)

    const ctx = mockExecute.mock.calls[0][0].context.generatedChaptersContext
    expect(ctx).toBeUndefined()
  })
})

// ── Story 3.12: batch sub-chapter summary trigger ──────────────────────────

describe('@story-3-12 _onBatchSectionDone does NOT enqueue sub-chapter summary from main', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChapterSummaryEnqueue.mockResolvedValue({ taskId: 'task-sum-stub' })
  })

  it('@p0 leaves summary extraction to the renderer (post-save snapshot has correct occurrenceIndex)', async () => {
    // Main-process enqueue was removed because the document is not yet
    // written at this point — the renderer fires enqueueExtraction after the
    // batch-complete replaceSection lands, using the post-save document to
    // resolve the true occurrenceIndex for duplicate-title siblings.
    mockBatchOrcGet.mockReturnValue({
      id: 'batch-1',
      projectId: 'proj-1',
      sections: [
        {
          index: 0,
          section: { title: '子章节A', level: 3, dimensions: [] },
          state: 'running',
        },
      ],
      contextBase: {},
    })
    mockBatchOrcOnSectionComplete.mockReturnValue({
      allDone: true,
      assembledSnapshot: '',
      completedCount: 1,
      totalCount: 1,
      failedSections: [],
    })

    await (
      chapterGenerationService as unknown as {
        _onBatchSectionDone: (
          batchId: string,
          idx: number,
          taskId: string,
          result: { status: 'completed'; content: string }
        ) => Promise<void>
      }
    )._onBatchSectionDone('batch-1', 0, 'task-x', {
      status: 'completed',
      content: 'body',
    })

    expect(mockChapterSummaryEnqueue).not.toHaveBeenCalled()
  })
})
