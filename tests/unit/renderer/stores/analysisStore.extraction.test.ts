import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAnalysisStore, getAnalysisProjectState } from '@renderer/stores/analysisStore'
import type { ApiResponse } from '@shared/ipc-types'
import type { ExtractionTaskResult, RequirementItem, ScoringModel } from '@shared/analysis-types'

const mockRequirements: RequirementItem[] = [
  {
    id: 'req-1',
    sequenceNumber: 1,
    description: '系统支持分布式架构',
    sourcePages: [23],
    category: 'technical',
    priority: 'high',
    status: 'extracted',
  },
]

const mockScoringModel: ScoringModel = {
  projectId: 'proj-1',
  totalScore: 100,
  criteria: [
    {
      id: 'c-1',
      category: '技术方案',
      maxScore: 60,
      weight: 0.6,
      subItems: [],
      reasoning: '推理依据',
      status: 'extracted',
    },
  ],
  extractedAt: '2026-03-21T00:00:00.000Z',
  confirmedAt: null,
  version: 1,
}

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    analysisImportTender: vi.fn().mockResolvedValue({ success: true, data: { taskId: 'task-1' } }),
    analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
    analysisExtractRequirements: vi
      .fn<() => Promise<ApiResponse<ExtractionTaskResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'ext-task-1' } }),
    analysisGetRequirements: vi
      .fn<() => Promise<ApiResponse<RequirementItem[] | null>>>()
      .mockResolvedValue({ success: true, data: mockRequirements }),
    analysisGetScoringModel: vi
      .fn<() => Promise<ApiResponse<ScoringModel | null>>>()
      .mockResolvedValue({ success: true, data: mockScoringModel }),
    analysisUpdateRequirement: vi
      .fn<() => Promise<ApiResponse<RequirementItem>>>()
      .mockResolvedValue({
        success: true,
        data: { ...mockRequirements[0], description: '更新后' },
      }),
    analysisUpdateScoringModel: vi
      .fn<() => Promise<ApiResponse<ScoringModel>>>()
      .mockResolvedValue({ success: true, data: mockScoringModel }),
    analysisConfirmScoringModel: vi
      .fn<() => Promise<ApiResponse<ScoringModel>>>()
      .mockResolvedValue({
        success: true,
        data: { ...mockScoringModel, confirmedAt: '2026-03-21T01:00:00.000Z' },
      }),
    ...overrides,
  })
}

describe('analysisStore — extraction actions (Story 2.5)', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ projects: {} })
    mockApi()
  })

  describe('extractRequirements', () => {
    it('should set extractionTaskId on success', async () => {
      await useAnalysisStore.getState().extractRequirements('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.extractionTaskId).toBe('ext-task-1')
      expect(state.extractionLoading).toBe(false)
    })

    it('should set error on failure', async () => {
      mockApi({
        analysisExtractRequirements: vi
          .fn()
          .mockResolvedValue({ success: false, error: { code: 'ERR', message: '失败' } }),
      })
      await useAnalysisStore.getState().extractRequirements('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.error).toBe('失败')
      expect(state.extractionTaskId).toBeNull()
    })
  })

  describe('fetchRequirements', () => {
    it('should set requirements on success', async () => {
      await useAnalysisStore.getState().fetchRequirements('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.requirements).toEqual(mockRequirements)
    })

    it('should preserve extracted empty requirements state', async () => {
      mockApi({
        analysisGetRequirements: vi
          .fn<() => Promise<ApiResponse<RequirementItem[] | null>>>()
          .mockResolvedValue({ success: true, data: [] }),
      })

      await useAnalysisStore.getState().fetchRequirements('proj-1')

      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.requirements).toEqual([])
    })
  })

  describe('fetchScoringModel', () => {
    it('should set scoringModel on success', async () => {
      await useAnalysisStore.getState().fetchScoringModel('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.scoringModel).toEqual(mockScoringModel)
    })
  })

  describe('confirmScoringModel', () => {
    it('should update scoring model with confirmedAt', async () => {
      await useAnalysisStore.getState().confirmScoringModel('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.scoringModel?.confirmedAt).toBeTruthy()
    })
  })

  describe('save failures', () => {
    it('should throw when requirement update fails', async () => {
      mockApi({
        analysisUpdateRequirement: vi
          .fn<() => Promise<ApiResponse<RequirementItem>>>()
          .mockResolvedValue({
            success: false,
            error: { code: 'ERR', message: '需求保存失败' },
          }),
      })

      await expect(
        useAnalysisStore.getState().updateRequirement('req-1', { description: '更新后' })
      ).rejects.toThrow('需求保存失败')
    })

    it('should throw when scoring criterion update fails', async () => {
      mockApi({
        analysisUpdateScoringModel: vi
          .fn<() => Promise<ApiResponse<ScoringModel>>>()
          .mockResolvedValue({
            success: false,
            error: { code: 'ERR', message: '评分项保存失败' },
          }),
      })

      await expect(
        useAnalysisStore
          .getState()
          .updateScoringCriterion('proj-1', 'c-1', { reasoning: '更新后的推理依据' })
      ).rejects.toThrow('评分项保存失败')
    })
  })

  describe('updateExtractionProgress', () => {
    it('should update extraction progress and message', () => {
      useAnalysisStore.getState().updateExtractionProgress('proj-1', 50, '正在分析...')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.extractionProgress).toBe(50)
      expect(state.extractionMessage).toBe('正在分析...')
    })
  })

  describe('setExtractionCompleted', () => {
    it('should set results and clear extraction state', () => {
      useAnalysisStore.getState().setExtractionCompleted('proj-1', {
        requirements: mockRequirements,
        scoringModel: mockScoringModel,
      })
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.requirements).toEqual(mockRequirements)
      expect(state.scoringModel).toEqual(mockScoringModel)
      expect(state.extractionTaskId).toBeNull()
      expect(state.extractionProgress).toBe(100)
      expect(state.extractionLoading).toBe(false)
    })
  })
})
