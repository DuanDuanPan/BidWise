import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScoringModel } from '@shared/analysis-types'

const mockReaddir = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn())
const mockExistsSync = vi.hoisted(() => vi.fn())
const mockApp = vi.hoisted(() => ({
  getAppPath: vi.fn().mockReturnValue('/app'),
  getPath: vi.fn().mockReturnValue('/user-data'),
}))

vi.mock('electron', () => ({ app: mockApp }))
vi.mock('fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))
vi.mock('fs', () => ({
  existsSync: (p: string) => mockExistsSync(p),
}))

const mockDocumentService = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  getMetadata: vi.fn(),
  saveSync: vi.fn(),
  updateMetadata: vi.fn(),
}))
vi.mock('@main/services/document-service', () => ({
  documentService: mockDocumentService,
}))

const mockScoringExtractor = vi.hoisted(() => ({
  getScoringModel: vi.fn(),
}))
vi.mock('@main/services/document-parser', () => ({
  scoringExtractor: mockScoringExtractor,
}))

const mockProjectService = vi.hoisted(() => ({
  get: vi.fn(),
}))
vi.mock('@main/services/project-service', () => ({
  projectService: mockProjectService,
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { templateService } from '@main/services/template-service'

const SAMPLE_TEMPLATE = {
  id: 'test-template',
  name: '测试模板',
  description: '测试用模板',
  version: '1.0',
  sections: [
    {
      id: 's1',
      title: '项目概述',
      level: 1,
      guidanceText: '概述项目。',
      children: [
        { id: 's1.1', title: '项目背景', level: 2, guidanceText: '背景描述。', children: [] },
      ],
    },
    {
      id: 's2',
      title: '系统架构设计',
      level: 1,
      guidanceText: '架构设计。',
      children: [],
    },
  ],
}

const SAMPLE_SCORING_MODEL: ScoringModel = {
  projectId: 'proj-1',
  totalScore: 100,
  criteria: [
    {
      id: 'c1',
      category: '系统架构设计',
      maxScore: 30,
      weight: 0.3,
      subItems: [{ id: 'sub1', name: '项目概述', maxScore: 10, description: '', sourcePages: [] }],
      reasoning: '',
      status: 'confirmed',
    },
    {
      id: 'c2',
      category: '实施方案',
      maxScore: 20,
      weight: 0.2,
      subItems: [],
      reasoning: '',
      status: 'confirmed',
    },
  ],
  extractedAt: '2026-03-30T00:00:00.000Z',
  confirmedAt: '2026-03-30T00:00:00.000Z',
  version: 1,
}

describe('template-service @story-3-3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
  })

  describe('listTemplates', () => {
    it('returns built-in templates', async () => {
      mockExistsSync.mockReturnValue(false) // no company dir
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.includes('/app/resources/templates')) return ['test.template.json']
        return []
      })
      mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_TEMPLATE))

      const result = await templateService.listTemplates()

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        id: 'test-template',
        name: '测试模板',
        description: '测试用模板',
        sectionCount: 2,
        source: 'built-in',
      })
    })

    it('does not throw when company template dir does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.includes('/app/resources/templates')) return ['test.template.json']
        throw new Error('ENOENT')
      })
      mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_TEMPLATE))

      const result = await templateService.listTemplates()
      expect(result).toHaveLength(1)
    })

    it('company templates override built-in with same ID', async () => {
      mockExistsSync.mockImplementation((p: string) =>
        p.includes('/app/company-data/templates/skeletons')
      )
      const companyTemplate = {
        ...SAMPLE_TEMPLATE,
        name: '公司模板',
        description: '公司自定义',
      }
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.includes('templates')) return ['test.template.json']
        return []
      })
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes('company-data')) return JSON.stringify(companyTemplate)
        return JSON.stringify(SAMPLE_TEMPLATE)
      })

      const result = await templateService.listTemplates()
      expect(result).toHaveLength(1)
      expect(result[0].source).toBe('company')
      expect(result[0].name).toBe('公司模板')
    })
  })

  describe('getTemplate', () => {
    it('returns full template definition', async () => {
      mockExistsSync.mockReturnValue(false)
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.includes('/app/resources/templates')) return ['test.template.json']
        return []
      })
      mockReadFile.mockResolvedValue(JSON.stringify(SAMPLE_TEMPLATE))

      const result = await templateService.getTemplate('test-template')
      expect(result.id).toBe('test-template')
      expect(result.sections).toHaveLength(2)
      expect(result.source).toBe('built-in')
    })

    it('throws TEMPLATE_NOT_FOUND for unknown template', async () => {
      mockExistsSync.mockReturnValue(false)
      mockReaddir.mockResolvedValue([])

      await expect(templateService.getTemplate('nonexistent')).rejects.toThrow('模板不存在')
    })
  })

  describe('generateSkeleton', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false)
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.includes('/app/resources/templates')) return ['test.template.json']
        return []
      })
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith('.template.json')) return JSON.stringify(SAMPLE_TEMPLATE)
        return '{}'
      })
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '',
        lastSavedAt: '2026-03-30T00:00:00.000Z',
        version: 1,
      })
      mockDocumentService.save.mockResolvedValue({
        lastSavedAt: '2026-03-30T01:00:00.000Z',
      })
      mockScoringExtractor.getScoringModel.mockResolvedValue(null)
      mockDocumentService.updateMetadata.mockResolvedValue({})
    })

    it('generates skeleton with correct structure', async () => {
      const result = await templateService.generateSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
      })

      expect(result.skeleton).toHaveLength(2)
      expect(result.sectionCount).toBe(2)
      expect(result.markdown).toContain('# 项目概述')
      expect(result.markdown).toContain('## 项目背景')
      expect(result.markdown).toContain('> 概述项目。')
      expect(mockDocumentService.save).toHaveBeenCalled()
    })

    it('throws SKELETON_OVERWRITE_REQUIRED when content exists and overwrite not set', async () => {
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Existing content',
        lastSavedAt: '2026-03-30T00:00:00.000Z',
        version: 1,
      })

      await expect(
        templateService.generateSkeleton({
          projectId: 'proj-1',
          templateId: 'test-template',
        })
      ).rejects.toThrow('需要确认覆盖')
    })

    it('allows overwrite when overwriteExisting is true', async () => {
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Existing',
        lastSavedAt: '2026-03-30T00:00:00.000Z',
        version: 1,
      })

      const result = await templateService.generateSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
        overwriteExisting: true,
      })

      expect(result.skeleton).toHaveLength(2)
    })

    it('applies scoring model weights to matching chapters', async () => {
      mockScoringExtractor.getScoringModel.mockResolvedValue(SAMPLE_SCORING_MODEL)

      const result = await templateService.generateSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
      })

      // "系统架构设计" should match criterion "系统架构设计" exactly
      const archSection = result.skeleton.find((s) => s.title === '系统架构设计')
      expect(archSection?.weightPercent).toBe(30)
      expect(archSection?.isKeyFocus).toBe(true)
      expect(archSection?.scoringCriterionId).toBe('c1')

      // "项目概述" should match subItem "项目概述" exactly
      const overviewSection = result.skeleton.find((s) => s.title === '项目概述')
      expect(overviewSection?.weightPercent).toBe(10)
      expect(overviewSection?.isKeyFocus).toBe(false)
    })

    it('produces no weights when scoring model is null', async () => {
      mockScoringExtractor.getScoringModel.mockResolvedValue(null)

      const result = await templateService.generateSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
      })

      expect(result.sectionWeights).toHaveLength(0)
      for (const section of result.skeleton) {
        expect(section.weightPercent).toBeUndefined()
        expect(section.isKeyFocus).toBe(false)
      }
    })

    it('marks high-weight sections as isKeyFocus', async () => {
      mockScoringExtractor.getScoringModel.mockResolvedValue(SAMPLE_SCORING_MODEL)

      const result = await templateService.generateSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
      })

      const weights = result.sectionWeights
      const highWeight = weights.find((w) => w.weightPercent >= 15)
      expect(highWeight?.isKeyFocus).toBe(true)

      const lowWeight = weights.find((w) => w.weightPercent < 15)
      if (lowWeight) {
        expect(lowWeight.isKeyFocus).toBe(false)
      }
    })
  })

  describe('persistSkeleton', () => {
    beforeEach(() => {
      mockDocumentService.save.mockResolvedValue({
        lastSavedAt: '2026-03-30T02:00:00.000Z',
      })
      mockDocumentService.updateMetadata.mockResolvedValue({})
    })

    it('regenerates markdown and updates metadata', async () => {
      const skeleton = [
        {
          id: 's1',
          title: '第一章',
          level: 1 as const,
          guidanceText: '引导文本',
          isKeyFocus: false,
          children: [],
        },
      ]

      const result = await templateService.persistSkeleton({
        projectId: 'proj-1',
        templateId: 'test-template',
        skeleton,
      })

      expect(result.markdown).toContain('# 第一章')
      expect(result.markdown).toContain('> 引导文本')
      expect(result.sectionCount).toBe(1)
      expect(mockDocumentService.save).toHaveBeenCalledWith('proj-1', result.markdown)
    })
  })
})
