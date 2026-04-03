import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindProjectById = vi.fn()
const mockFindRequirementsByProject = vi.fn()
const mockUpdateRequirement = vi.fn()
const mockFindLinksByProject = vi.fn()
const mockFindLinkById = vi.fn()
const mockReplaceAutoByProject = vi.fn()
const mockCreateLink = vi.fn()
const mockUpdateLink = vi.fn()
const mockDeleteLink = vi.fn()
const mockCreateRequirements = vi.fn()
const mockEnqueue = vi.fn()
const mockExecute = vi.fn()
const mockAgentExecute = vi.fn()
const mockGetAgentStatus = vi.fn()
const mockFsAccess = vi.fn()
const mockFsReadFile = vi.fn()
const mockFsWriteFile = vi.fn()

vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockFsAccess(...args),
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
  writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
}))

vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindProjectById
  },
}))

vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindRequirementsByProject
    create = mockCreateRequirements
    update = mockUpdateRequirement
  },
}))

vi.mock('@main/db/repositories/traceability-link-repo', () => ({
  TraceabilityLinkRepository: class {
    findByProject = mockFindLinksByProject
    findById = mockFindLinkById
    replaceAutoByProject = mockReplaceAutoByProject
    create = mockCreateLink
    update = mockUpdateLink
    delete = mockDeleteLink
  },
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockAgentExecute(...args),
    getAgentStatus: (...args: unknown[]) => mockGetAgentStatus(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { BidWiseError }
})

vi.mock('@shared/chapter-markdown', () => ({
  extractMarkdownHeadings: () => [
    { rawTitle: '技术方案', title: '技术方案', level: 2, lineIndex: 0, occurrenceIndex: 0 },
    { rawTitle: '服务保障', title: '服务保障', level: 2, lineIndex: 10, occurrenceIndex: 0 },
  ],
}))

import { TraceabilityMatrixService } from '@main/services/document-parser/traceability-matrix-service'

const NOW = '2026-04-01T09:00:00.000Z'

describe('TraceabilityMatrixService @story-2-8', () => {
  let service: TraceabilityMatrixService

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))

    service = new TraceabilityMatrixService()

    mockFindProjectById.mockResolvedValue({
      id: 'proj-1',
      rootPath: '/tmp/test-project',
    })
    mockFindRequirementsByProject.mockResolvedValue([
      { id: 'req-1', sequenceNumber: 1, description: '数据处理', sourcePages: [], category: 'technical', priority: 'high', status: 'extracted' },
      { id: 'req-2', sequenceNumber: 2, description: '运维服务', sourcePages: [], category: 'service', priority: 'medium', status: 'extracted' },
    ])
    mockFindLinksByProject.mockResolvedValue([])
    mockEnqueue.mockResolvedValue('task-001')
    mockExecute.mockImplementation((_taskId, executor) => {
      return executor({
        taskId: 'task-001',
        signal: new AbortController().signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn(),
      })
    })
    mockFsReadFile.mockRejectedValue(new Error('ENOENT'))
    mockFsAccess.mockRejectedValue(new Error('ENOENT'))
    mockFsWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('generate', () => {
    it('@p1 should enqueue a task and return taskId', async () => {
      // First call: meta.json not found, second call: proposal.md found
      mockFsReadFile
        .mockRejectedValueOnce(new Error('ENOENT')) // meta.json
        .mockResolvedValueOnce('## 技术方案\n\n内容\n\n## 服务保障\n\n内容') // proposal.md
      const result = await service.generate({ projectId: 'proj-1' })
      expect(result.taskId).toBe('task-001')
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'import' })
      )
    })

    it('@p1 should throw when requirements are empty', async () => {
      mockFindRequirementsByProject.mockResolvedValue([])
      await expect(service.generate({ projectId: 'proj-1' })).rejects.toThrow('需求清单为空')
    })

    it('@p1 should throw when project has no rootPath', async () => {
      mockFindProjectById.mockResolvedValue({ id: 'proj-1', rootPath: null })
      await expect(service.generate({ projectId: 'proj-1' })).rejects.toThrow('未设置存储路径')
    })
  })

  describe('getMatrix', () => {
    it('@p1 should return null when never generated', async () => {
      const result = await service.getMatrix('proj-1')
      expect(result).toBeNull()
    })

    it('@p1 should return matrix with correct cell semantics', async () => {
      // Fallback sectionIds use title-based format: heading-{level}-{encodedTitle}-{occurrenceIndex}
      const techSectionId = `heading-2-${encodeURIComponent('技术方案').slice(0, 60)}-0`
      const serviceSectionId = `heading-2-${encodeURIComponent('服务保障').slice(0, 60)}-0`

      // Simulate existing links
      mockFindLinksByProject.mockResolvedValue([
        {
          id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: techSectionId,
          sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 0.9,
          matchReason: '匹配', source: 'auto', createdAt: NOW, updatedAt: NOW,
        },
      ])
      // Provide proposal.md for section loading
      mockFsReadFile
        .mockRejectedValueOnce(new Error('ENOENT')) // meta.json
        .mockResolvedValueOnce('## 技术方案\n\n内容\n\n## 服务保障\n\n内容') // proposal.md
        .mockRejectedValueOnce(new Error('ENOENT')) // snapshot

      const result = await service.getMatrix('proj-1')
      expect(result).not.toBeNull()
      expect(result!.rows).toHaveLength(2)
      expect(result!.columns).toHaveLength(2)

      // req-1 + techSectionId should be covered
      const coveredCell = result!.rows[0].cells.find(c => c.sectionId === techSectionId)
      expect(coveredCell?.cellState).toBe('covered')
      expect(coveredCell?.linkId).toBe('link-1')

      // req-1 + serviceSectionId (no link) should be 'none'
      const noneCell = result!.rows[0].cells.find(c => c.sectionId === serviceSectionId)
      expect(noneCell?.cellState).toBe('none')
      expect(noneCell?.linkId).toBeNull()
    })
  })

  describe('getStats', () => {
    it('@p1 should compute stats at requirement granularity', async () => {
      mockFindLinksByProject.mockResolvedValue([
        {
          id: 'l1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
          sectionTitle: 'T', coverageStatus: 'covered', confidence: 0.9,
          matchReason: null, source: 'auto', createdAt: NOW, updatedAt: NOW,
        },
        {
          id: 'l2', projectId: 'proj-1', requirementId: 'req-2', sectionId: 's1',
          sectionTitle: 'T', coverageStatus: 'partial', confidence: 0.7,
          matchReason: null, source: 'auto', createdAt: NOW, updatedAt: NOW,
        },
      ])

      // Need snapshot for "generated" check
      mockFsAccess.mockResolvedValue(undefined)

      const result = await service.getStats('proj-1')
      expect(result).not.toBeNull()
      expect(result!.totalRequirements).toBe(2)
      expect(result!.coveredCount).toBe(1)
      expect(result!.partialCount).toBe(1)
      expect(result!.uncoveredCount).toBe(0)
      expect(result!.coverageRate).toBe(0.5)
    })

    it('@p1 should count requirement as uncovered when no links exist', async () => {
      // No links for any requirement
      mockFindLinksByProject.mockResolvedValue([
        {
          id: 'l1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
          sectionTitle: 'T', coverageStatus: 'covered', confidence: 0.9,
          matchReason: null, source: 'auto', createdAt: NOW, updatedAt: NOW,
        },
      ])

      mockFsAccess.mockResolvedValue(undefined)

      const result = await service.getStats('proj-1')
      expect(result!.uncoveredCount).toBe(1) // req-2 has no links
    })
  })

  describe('createLink', () => {
    it('@p1 should create a manual link', async () => {
      mockFsReadFile
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce('## 技术方案\n\n内容')
      mockCreateLink.mockResolvedValue({
        id: 'mock-uuid', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 1.0,
        matchReason: null, source: 'manual', createdAt: NOW, updatedAt: NOW,
      })

      const result = await service.createLink({
        projectId: 'proj-1',
        requirementId: 'req-1',
        sectionId: 's1',
        coverageStatus: 'covered',
      })

      expect(result.source).toBe('manual')
      expect(result.confidence).toBe(1.0)
    })
  })

  describe('deleteLink', () => {
    it('@p1 should delete a manual link directly', async () => {
      mockFindLinkById.mockResolvedValue({
        id: 'link-1', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 1.0,
        matchReason: null, source: 'manual', createdAt: NOW, updatedAt: NOW,
      })

      const result = await service.deleteLink('link-1')
      expect(result).toBeNull()
      expect(mockDeleteLink).toHaveBeenCalledWith('link-1')
    })

    it('@p1 should convert auto link to manual+uncovered instead of deleting', async () => {
      mockFindLinkById.mockResolvedValue({
        id: 'link-2', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'covered', confidence: 0.9,
        matchReason: 'AI matched', source: 'auto', createdAt: NOW, updatedAt: NOW,
      })
      mockUpdateLink.mockResolvedValue({
        id: 'link-2', projectId: 'proj-1', requirementId: 'req-1', sectionId: 's1',
        sectionTitle: '技术方案', coverageStatus: 'uncovered', confidence: 0.9,
        matchReason: 'AI matched', source: 'manual', createdAt: NOW, updatedAt: NOW,
      })

      const result = await service.deleteLink('link-2')
      expect(result).not.toBeNull()
      expect(result!.source).toBe('manual')
      expect(result!.coverageStatus).toBe('uncovered')
      expect(mockDeleteLink).not.toHaveBeenCalled()
      expect(mockUpdateLink).toHaveBeenCalledWith('link-2', {
        coverageStatus: 'uncovered',
        source: 'manual',
      })
    })

    it('@p1 should throw when link does not exist', async () => {
      mockFindLinkById.mockResolvedValue(null)
      await expect(service.deleteLink('nonexistent')).rejects.toThrow('不存在')
    })
  })

  describe('importAddendum', () => {
    it('@p1 should throw when both content and filePath are missing', async () => {
      await expect(
        service.importAddendum({ projectId: 'proj-1' })
      ).rejects.toThrow('必须提供')
    })
  })
})
