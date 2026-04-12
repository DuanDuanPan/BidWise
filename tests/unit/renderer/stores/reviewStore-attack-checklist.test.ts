import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock window.api
const mockReviewGenerateAttackChecklist = vi.fn()
const mockReviewGetAttackChecklist = vi.fn()
const mockReviewUpdateChecklistItemStatus = vi.fn()

vi.stubGlobal('window', {
  api: {
    reviewGenerateAttackChecklist: mockReviewGenerateAttackChecklist,
    reviewGetAttackChecklist: mockReviewGetAttackChecklist,
    reviewUpdateChecklistItemStatus: mockReviewUpdateChecklistItemStatus,
    complianceCheck: vi.fn(),
    reviewGenerateRoles: vi.fn(),
    reviewGetLineup: vi.fn(),
    reviewUpdateRoles: vi.fn(),
    reviewConfirmLineup: vi.fn(),
    reviewStartExecution: vi.fn(),
    reviewGetReview: vi.fn(),
    reviewHandleFinding: vi.fn(),
    reviewRetryRole: vi.fn(),
    onTaskProgress: vi.fn(() => vi.fn()),
    taskGetStatus: vi.fn(),
  },
})

import {
  useReviewStore,
  createProjectState,
  findReviewProjectIdByTaskId,
  getReviewProjectState,
} from '@renderer/stores/reviewStore'

describe('reviewStore attack-checklist @story-7-5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReviewStore.setState({ projects: {} })
  })

  describe('createProjectState', () => {
    it('includes attack checklist initial values', () => {
      const state = createProjectState()
      expect(state.attackChecklist).toBeNull()
      expect(state.attackChecklistLoaded).toBe(false)
      expect(state.attackChecklistLoading).toBe(false)
      expect(state.attackChecklistError).toBeNull()
      expect(state.attackChecklistTaskId).toBeNull()
      expect(state.attackChecklistProgress).toBe(0)
      expect(state.attackChecklistMessage).toBeNull()
    })
  })

  describe('findReviewProjectIdByTaskId', () => {
    it('finds project by attackChecklistTaskId', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ attackChecklistTaskId: 'task-abc' }),
        },
      })

      const result = findReviewProjectIdByTaskId(useReviewStore.getState(), 'task-abc')
      expect(result).toEqual({ projectId: 'proj-1', taskKind: 'attack-checklist' })
    })
  })

  describe('startAttackChecklistGeneration', () => {
    it('sets loading state and stores taskId on success', async () => {
      mockReviewGenerateAttackChecklist.mockResolvedValue({
        success: true,
        data: { taskId: 'task-123' },
      })

      await useReviewStore.getState().startAttackChecklistGeneration('proj-1')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklistTaskId).toBe('task-123')
      expect(state.attackChecklistLoading).toBe(true)
    })

    it('sets error on API failure', async () => {
      mockReviewGenerateAttackChecklist.mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: '生成失败' },
      })

      await useReviewStore.getState().startAttackChecklistGeneration('proj-1')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklistError).toBe('生成失败')
      expect(state.attackChecklistLoading).toBe(false)
    })
  })

  describe('loadAttackChecklist', () => {
    it('stores checklist data on success', async () => {
      const mockChecklist = {
        id: 'cl-1',
        projectId: 'proj-1',
        status: 'generated',
        items: [{ id: 'item-1', status: 'unaddressed' }],
        generationSource: 'llm',
        warningMessage: null,
      }
      mockReviewGetAttackChecklist.mockResolvedValue({
        success: true,
        data: mockChecklist,
      })

      const result = await useReviewStore.getState().loadAttackChecklist('proj-1')

      expect(result).toBe(true)
      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklist).toEqual(mockChecklist)
      expect(state.attackChecklistLoaded).toBe(true)
      expect(state.attackChecklistLoading).toBe(false)
    })

    it('returns false when no checklist exists', async () => {
      mockReviewGetAttackChecklist.mockResolvedValue({
        success: true,
        data: null,
      })

      const result = await useReviewStore.getState().loadAttackChecklist('proj-1')
      expect(result).toBe(false)
    })
  })

  describe('updateChecklistItemStatus', () => {
    it('performs optimistic update then syncs with server', async () => {
      // Pre-populate store with checklist
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({
            attackChecklist: {
              id: 'cl-1',
              projectId: 'proj-1',
              status: 'generated',
              items: [
                {
                  id: 'item-1',
                  checklistId: 'cl-1',
                  category: '合规',
                  attackAngle: '攻击',
                  severity: 'critical',
                  defenseSuggestion: '防御',
                  targetSection: null,
                  targetSectionLocator: null,
                  status: 'unaddressed',
                  sortOrder: 0,
                  createdAt: '',
                  updatedAt: '',
                },
              ],
              generationSource: 'llm',
              warningMessage: null,
              generatedAt: '',
              createdAt: '',
              updatedAt: '',
            },
          }),
        },
      })

      const serverItem = {
        id: 'item-1',
        checklistId: 'cl-1',
        category: '合规',
        attackAngle: '攻击',
        severity: 'critical',
        defenseSuggestion: '防御',
        targetSection: null,
        targetSectionLocator: null,
        status: 'addressed',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '2026-01-02',
      }

      mockReviewUpdateChecklistItemStatus.mockResolvedValue({
        success: true,
        data: serverItem,
      })

      await useReviewStore.getState().updateChecklistItemStatus('proj-1', 'item-1', 'addressed')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklist!.items[0].status).toBe('addressed')
    })
  })

  describe('setAttackChecklistProgress', () => {
    it('updates progress and message', () => {
      useReviewStore.getState().setAttackChecklistProgress('proj-1', 50, '正在生成...')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklistProgress).toBe(50)
      expect(state.attackChecklistMessage).toBe('正在生成...')
    })
  })

  describe('setAttackChecklistTaskError', () => {
    it('clears loading and sets error', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({
            attackChecklistLoading: true,
            attackChecklistTaskId: 't',
          }),
        },
      })

      useReviewStore.getState().setAttackChecklistTaskError('proj-1', '失败了')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklistLoading).toBe(false)
      expect(state.attackChecklistError).toBe('失败了')
      expect(state.attackChecklistTaskId).toBeNull()
    })
  })

  describe('clearAttackChecklistError', () => {
    it('clears error', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': createProjectState({ attackChecklistError: '错误' }),
        },
      })

      useReviewStore.getState().clearAttackChecklistError('proj-1')

      const state = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(state.attackChecklistError).toBeNull()
    })
  })
})
