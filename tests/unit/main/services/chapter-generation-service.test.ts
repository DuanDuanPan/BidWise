import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks (hoisted so vi.mock factories can reference them) ───

const mockLoad = vi.hoisted(() => vi.fn())
const mockExecute = vi.hoisted(() => vi.fn())
const mockFindRequirements = vi.hoisted(() => vi.fn())
const mockFindScoringModel = vi.hoisted(() => vi.fn())
const mockFindMandatoryItems = vi.hoisted(() => vi.fn())
const mockGetProjectWritingStyle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock-user-data'),
  },
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: (...args: unknown[]) => mockLoad(...args),
  },
}))

vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockExecute(...args),
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

vi.mock('@main/services/writing-style-service', () => ({
  writingStyleService: {
    getProjectWritingStyle: (...args: unknown[]) => mockGetProjectWritingStyle(...args),
  },
  serializeStyleForPrompt: (style: { name: string }) => `文风：${style.name}`,
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
    mockFindRequirements.mockResolvedValue([])
    mockFindScoringModel.mockResolvedValue(null)
    mockFindMandatoryItems.mockResolvedValue([])
    mockGetProjectWritingStyle.mockResolvedValue({
      id: 'general',
      name: '通用文风',
      toneGuidance: '专业、清晰',
      vocabularyRules: [],
      forbiddenWords: [],
      sentencePatterns: [],
      source: 'built-in',
    })
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
      expect(request.options.timeoutMs).toBe(120_000)
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
