import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockApi = vi.hoisted(() => ({
  complianceCheck: vi.fn(),
  reviewGenerateRoles: vi.fn(),
  reviewGetLineup: vi.fn(),
  reviewUpdateRoles: vi.fn(),
  reviewConfirmLineup: vi.fn(),
  reviewStartExecution: vi.fn(),
  reviewGetReview: vi.fn(),
  reviewHandleFinding: vi.fn(),
  reviewRetryRole: vi.fn(),
}))

vi.stubGlobal('window', { api: mockApi })

import {
  useReviewStore,
  createProjectState,
  getReviewProjectState,
  findReviewProjectIdByTaskId,
} from '@renderer/stores/reviewStore'

describe('reviewStore — review execution domain @story-7-3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.setState({ projects: {} })
  })

  describe('createProjectState', () => {
    it('should include review execution fields with correct defaults', () => {
      const state = createProjectState()
      expect(state.reviewSession).toBeNull()
      expect(state.reviewLoaded).toBe(false)
      expect(state.reviewLoading).toBe(false)
      expect(state.reviewError).toBeNull()
      expect(state.reviewTaskId).toBeNull()
      expect(state.reviewProgress).toBe(0)
      expect(state.reviewMessage).toBeNull()
    })
  })

  describe('findReviewProjectIdByTaskId', () => {
    it('should find project by reviewTaskId', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ reviewTaskId: 'task-review-1' }),
        },
      })

      const result = findReviewProjectIdByTaskId(useReviewStore.getState(), 'task-review-1')
      expect(result).toEqual({ projectId: 'proj-1', taskKind: 'review' })
    })

    it('should find project by lineupTaskId', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ lineupTaskId: 'task-lineup-1' }),
        },
      })

      const result = findReviewProjectIdByTaskId(useReviewStore.getState(), 'task-lineup-1')
      expect(result).toEqual({ projectId: 'proj-1', taskKind: 'lineup' })
    })

    it('should return undefined when task not found', () => {
      const result = findReviewProjectIdByTaskId(useReviewStore.getState(), 'nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('startReview', () => {
    it('should set loading state and store taskId on success', async () => {
      mockApi.reviewStartExecution.mockResolvedValue({
        success: true,
        data: { taskId: 'task-review-1' },
      })

      await useReviewStore.getState().startReview('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewTaskId).toBe('task-review-1')
      expect(ps.reviewLoading).toBe(true)
    })

    it('should set error on IPC failure', async () => {
      mockApi.reviewStartExecution.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION', message: '请先确认阵容' },
      })

      await useReviewStore.getState().startReview('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewError).toBe('请先确认阵容')
      expect(ps.reviewLoading).toBe(false)
    })
  })

  describe('loadReview', () => {
    it('should load review session and set reviewLoaded', async () => {
      const session = {
        id: 'session-1',
        projectId: 'proj-1',
        status: 'completed',
        findings: [],
        roleResults: [],
      }
      mockApi.reviewGetReview.mockResolvedValue({ success: true, data: session })

      const hasSession = await useReviewStore.getState().loadReview('proj-1')

      expect(hasSession).toBe(true)
      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewSession).toEqual(session)
      expect(ps.reviewLoaded).toBe(true)
      expect(ps.reviewLoading).toBe(false)
    })

    it('should return false when no session exists', async () => {
      mockApi.reviewGetReview.mockResolvedValue({ success: true, data: null })

      const hasSession = await useReviewStore.getState().loadReview('proj-1')

      expect(hasSession).toBe(false)
    })
  })

  describe('handleFinding', () => {
    it('should optimistically update finding status', async () => {
      const finding = {
        id: 'f1',
        sessionId: 's1',
        roleId: 'r1',
        roleName: '合规',
        severity: 'major' as const,
        sectionRef: null,
        sectionLocator: null,
        content: 'test finding',
        suggestion: null,
        reasoning: null,
        status: 'pending' as const,
        rebuttalReason: null,
        contradictionGroupId: null,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({
            reviewSession: {
              id: 's1',
              projectId: 'proj-1',
              lineupId: 'l1',
              status: 'completed',
              findings: [finding],
              roleResults: [],
              startedAt: '2026-01-01T00:00:00Z',
              completedAt: '2026-01-01T00:05:00Z',
            },
          }),
        },
      })

      mockApi.reviewHandleFinding.mockResolvedValue({
        success: true,
        data: { ...finding, status: 'accepted' },
      })

      await useReviewStore.getState().handleFinding('proj-1', 'f1', 'accepted')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewSession!.findings[0].status).toBe('accepted')
    })
  })

  describe('retryRole', () => {
    it('should set loading state and store retry taskId', async () => {
      mockApi.reviewRetryRole.mockResolvedValue({
        success: true,
        data: { taskId: 'task-retry-1' },
      })

      await useReviewStore.getState().retryRole('proj-1', 'role-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewTaskId).toBe('task-retry-1')
      expect(ps.reviewLoading).toBe(true)
    })
  })

  describe('refreshReviewSession', () => {
    it('should update reviewSession without clearing task state', async () => {
      const session = {
        id: 'session-1',
        projectId: 'proj-1',
        lineupId: 'l1',
        status: 'running',
        findings: [],
        roleResults: [{ roleId: 'r1', roleName: '合规', status: 'running', findingCount: 0 }],
        startedAt: '2026-01-01T00:00:00Z',
        completedAt: null,
      }
      mockApi.reviewGetReview.mockResolvedValue({ success: true, data: session })

      // Set up initial state with taskId and loading
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({
            reviewTaskId: 'task-1',
            reviewLoading: true,
            reviewProgress: 30,
            reviewMessage: '攻击中…',
          }),
        },
      })

      await useReviewStore.getState().refreshReviewSession('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      // Session is populated
      expect(ps.reviewSession).toEqual(session)
      expect(ps.reviewSession!.roleResults).toHaveLength(1)
      // Task tracking state is preserved
      expect(ps.reviewTaskId).toBe('task-1')
      expect(ps.reviewLoading).toBe(true)
      expect(ps.reviewProgress).toBe(30)
      expect(ps.reviewMessage).toBe('攻击中…')
    })

    it('should not update state when response has no data', async () => {
      mockApi.reviewGetReview.mockResolvedValue({ success: true, data: null })

      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ reviewTaskId: 'task-1', reviewLoading: true }),
        },
      })

      await useReviewStore.getState().refreshReviewSession('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewSession).toBeNull()
    })
  })

  describe('updateReviewProgress', () => {
    it('should update progress and message', () => {
      useReviewStore.getState().updateReviewProgress('proj-1', 50, '角色 1/3 完成…')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewProgress).toBe(50)
      expect(ps.reviewMessage).toBe('角色 1/3 完成…')
    })
  })

  describe('clearReviewError', () => {
    it('should clear review error', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ reviewError: '一些错误' }),
        },
      })

      useReviewStore.getState().clearReviewError('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewError).toBeNull()
    })
  })

  describe('reset', () => {
    it('should reset review state along with all other state', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({
            reviewSession: {
              id: 's1',
              projectId: 'proj-1',
              lineupId: 'l1',
              status: 'completed' as const,
              findings: [],
              roleResults: [],
              startedAt: '2026-01-01T00:00:00Z',
              completedAt: null,
            },
            reviewLoaded: true,
            reviewTaskId: 'task-1',
          }),
        },
      })

      useReviewStore.getState().reset('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.reviewSession).toBeNull()
      expect(ps.reviewLoaded).toBe(false)
      expect(ps.reviewTaskId).toBeNull()
    })
  })
})
