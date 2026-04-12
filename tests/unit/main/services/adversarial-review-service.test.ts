import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockLineupFindByProjectId,
  mockReviewSaveSession,
  mockReviewFindByProjectId,
  mockReviewSaveFindings,
  mockReviewUpdateFinding,
  mockReviewDeleteFindings,
  mockReviewUpdateSessionStatus,
  mockScoringFindByProject,
  mockMandatoryFindByProject,
  mockDocumentLoad,
  mockDocumentGetMetadata,
  mockAiProxyCall,
  mockEnqueue,
  mockExecute,
} = vi.hoisted(() => ({
  mockLineupFindByProjectId: vi.fn(),
  mockReviewSaveSession: vi.fn(),
  mockReviewFindByProjectId: vi.fn(),
  mockReviewSaveFindings: vi.fn(),
  mockReviewUpdateFinding: vi.fn(),
  mockReviewDeleteFindings: vi.fn(),
  mockReviewUpdateSessionStatus: vi.fn(),
  mockScoringFindByProject: vi.fn(),
  mockMandatoryFindByProject: vi.fn(),
  mockDocumentLoad: vi.fn(),
  mockDocumentGetMetadata: vi.fn(),
  mockAiProxyCall: vi.fn(),
  mockEnqueue: vi.fn(),
  mockExecute: vi.fn(),
}))

vi.mock('@main/db/repositories/adversarial-review-repo', () => ({
  AdversarialReviewRepository: class {
    saveSession = mockReviewSaveSession
    findSessionByProjectId = mockReviewFindByProjectId
    saveFindings = mockReviewSaveFindings
    updateFinding = mockReviewUpdateFinding
    deleteFindingsBySessionId = mockReviewDeleteFindings
    updateSessionStatus = mockReviewUpdateSessionStatus
  },
}))

vi.mock('@main/db/repositories/adversarial-lineup-repo', () => ({
  AdversarialLineupRepository: class {
    findByProjectId = mockLineupFindByProjectId
  },
}))

vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    findByProject = mockScoringFindByProject
  },
}))

vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    findByProject = mockMandatoryFindByProject
  },
}))

vi.mock('@main/services/document-service', () => ({
  documentService: {
    load: (...args: unknown[]) => mockDocumentLoad(...args),
    getMetadata: (...args: unknown[]) => mockDocumentGetMetadata(...args),
  },
}))

vi.mock('@main/services/ai-proxy', () => ({
  aiProxy: {
    call: (...args: unknown[]) => mockAiProxyCall(...args),
  },
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
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

vi.mock('@main/utils/abort', async () => {
  const actual = await vi.importActual<typeof import('@main/utils/abort')>('@main/utils/abort')
  return {
    ...actual,
    throwIfAborted: vi.fn(),
  }
})

import { adversarialReviewService } from '@main/services/adversarial-review-service'

const confirmedLineup = {
  id: 'lineup-1',
  projectId: 'proj-1',
  roles: [
    {
      id: 'role-1',
      name: '合规审查官',
      perspective: '合规视角',
      attackFocus: ['资质', '格式'],
      intensity: 'high' as const,
      isProtected: true,
      description: '合规角色',
      sortOrder: 0,
    },
    {
      id: 'role-2',
      name: '技术专家',
      perspective: '技术视角',
      attackFocus: ['架构', '性能'],
      intensity: 'medium' as const,
      isProtected: false,
      description: '技术角色',
      sortOrder: 1,
    },
  ],
  status: 'confirmed' as const,
  generationSource: 'llm' as const,
  warningMessage: null,
  generatedAt: '2026-01-01T00:00:00Z',
  confirmedAt: '2026-01-01T00:01:00Z',
}

describe('adversarialReviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockLineupFindByProjectId.mockResolvedValue(confirmedLineup)
    mockDocumentLoad.mockResolvedValue({ projectId: 'proj-1', content: '# 方案内容\n这是测试方案' })
    mockDocumentGetMetadata.mockResolvedValue({
      projectId: 'proj-1',
      sectionIndex: [],
    })
    mockScoringFindByProject.mockResolvedValue(null)
    mockMandatoryFindByProject.mockResolvedValue([])
    mockEnqueue.mockResolvedValue('task-1')
    mockReviewSaveSession.mockResolvedValue({
      id: 'session-1',
      projectId: 'proj-1',
      lineupId: 'lineup-1',
      status: 'running',
      findings: [],
      roleResults: [],
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: null,
    })
  })

  describe('startExecution', () => {
    it('should reject when lineup is not confirmed', async () => {
      mockLineupFindByProjectId.mockResolvedValue({
        ...confirmedLineup,
        status: 'generated',
      })

      await expect(adversarialReviewService.startExecution('proj-1')).rejects.toMatchObject({
        message: expect.stringContaining('确认对抗阵容'),
      })
    })

    it('should reject when lineup does not exist', async () => {
      mockLineupFindByProjectId.mockResolvedValue(null)

      await expect(adversarialReviewService.startExecution('proj-1')).rejects.toMatchObject({
        message: expect.stringContaining('确认对抗阵容'),
      })
    })

    it('should reject when proposal is empty', async () => {
      mockDocumentLoad.mockResolvedValue({ content: '' })

      await expect(adversarialReviewService.startExecution('proj-1')).rejects.toMatchObject({
        message: expect.stringContaining('方案内容为空'),
      })
    })

    it('should enqueue task and return taskId', async () => {
      mockExecute.mockResolvedValue(undefined)

      const result = await adversarialReviewService.startExecution('proj-1')

      expect(result.taskId).toBe('task-1')
      expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ category: 'ai' }))
    })

    it('should call task-queue execute with the enqueued taskId', async () => {
      mockExecute.mockResolvedValue(undefined)

      await adversarialReviewService.startExecution('proj-1')

      expect(mockExecute).toHaveBeenCalledWith('task-1', expect.any(Function))
    })
  })

  describe('getReview', () => {
    it('should return review session from repository', async () => {
      const session = {
        id: 'session-1',
        projectId: 'proj-1',
        lineupId: 'lineup-1',
        status: 'completed',
        findings: [],
        roleResults: [],
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: '2026-01-01T00:05:00Z',
      }
      mockReviewFindByProjectId.mockResolvedValue(session)

      const result = await adversarialReviewService.getReview('proj-1')

      expect(result).toEqual(session)
    })

    it('should return null when no session exists', async () => {
      mockReviewFindByProjectId.mockResolvedValue(null)

      const result = await adversarialReviewService.getReview('proj-1')

      expect(result).toBeNull()
    })
  })

  describe('handleFinding', () => {
    it('should update finding to accepted and clear rebuttalReason', async () => {
      const updated = { id: 'f1', status: 'accepted', rebuttalReason: null }
      mockReviewUpdateFinding.mockResolvedValue(updated)

      const result = await adversarialReviewService.handleFinding('f1', 'accepted')

      expect(mockReviewUpdateFinding).toHaveBeenCalledWith('f1', {
        status: 'accepted',
        rebuttalReason: null,
      })
      expect(result.status).toBe('accepted')
    })

    it('should update finding to rejected with reason', async () => {
      const updated = { id: 'f1', status: 'rejected', rebuttalReason: '不适用' }
      mockReviewUpdateFinding.mockResolvedValue(updated)

      const result = await adversarialReviewService.handleFinding('f1', 'rejected', '不适用')

      expect(mockReviewUpdateFinding).toHaveBeenCalledWith('f1', {
        status: 'rejected',
        rebuttalReason: '不适用',
      })
      expect(result.status).toBe('rejected')
    })

    it('should reject when rejecting without reason', async () => {
      await expect(
        adversarialReviewService.handleFinding('f1', 'rejected', '')
      ).rejects.toMatchObject({
        message: expect.stringContaining('反驳理由不能为空'),
      })
    })

    it('should reject when rejecting with whitespace-only reason', async () => {
      await expect(
        adversarialReviewService.handleFinding('f1', 'rejected', '   ')
      ).rejects.toMatchObject({
        message: expect.stringContaining('反驳理由不能为空'),
      })
    })

    it('should update finding to needs-decision', async () => {
      const updated = { id: 'f1', status: 'needs-decision', rebuttalReason: null }
      mockReviewUpdateFinding.mockResolvedValue(updated)

      const result = await adversarialReviewService.handleFinding('f1', 'needs-decision')

      expect(result.status).toBe('needs-decision')
    })
  })

  describe('retryRole', () => {
    it('should reject when session does not exist', async () => {
      mockReviewFindByProjectId.mockResolvedValue(null)

      await expect(adversarialReviewService.retryRole('proj-1', 'role-1')).rejects.toMatchObject({
        message: expect.stringContaining('会话不存在'),
      })
    })

    it('should reject when role is not in failed state', async () => {
      mockReviewFindByProjectId.mockResolvedValue({
        id: 'session-1',
        projectId: 'proj-1',
        roleResults: [{ roleId: 'role-1', status: 'success', findingCount: 3 }],
        findings: [],
      })

      await expect(adversarialReviewService.retryRole('proj-1', 'role-1')).rejects.toMatchObject({
        message: expect.stringContaining('未处于失败状态'),
      })
    })

    it('should enqueue retry task for failed role', async () => {
      mockReviewFindByProjectId.mockResolvedValue({
        id: 'session-1',
        projectId: 'proj-1',
        roleResults: [{ roleId: 'role-1', status: 'failed', findingCount: 0, error: 'timeout' }],
        findings: [],
      })
      mockExecute.mockResolvedValue(undefined)

      const result = await adversarialReviewService.retryRole('proj-1', 'role-1')

      expect(result.taskId).toBe('task-1')
      expect(mockEnqueue).toHaveBeenCalled()
    })
  })
})
