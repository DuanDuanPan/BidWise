import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ApiResponse } from '@shared/ipc-types'
import type { FogMapItem, FogMapSummary, RequirementCertainty, GenerateFogMapResult } from '@shared/analysis-types'
import {
  useAnalysisStore,
  getAnalysisProjectState,
  EMPTY_ANALYSIS_PROJECT_STATE,
} from '@renderer/stores/analysisStore'

const messageError = vi.fn()

vi.mock('antd', () => ({
  message: {
    error: (...args: unknown[]) => messageError(...args),
  },
}))

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    analysisGenerateFogMap: vi
      .fn<() => Promise<ApiResponse<GenerateFogMapResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'fog-task-1' } }),
    analysisGetFogMap: vi
      .fn<() => Promise<ApiResponse<FogMapItem[] | null>>>()
      .mockResolvedValue({ success: true, data: null }),
    analysisGetFogMapSummary: vi
      .fn<() => Promise<ApiResponse<FogMapSummary | null>>>()
      .mockResolvedValue({ success: true, data: null }),
    analysisConfirmCertainty: vi
      .fn<() => Promise<ApiResponse<RequirementCertainty>>>()
      .mockResolvedValue({
        success: true,
        data: {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'ambiguous',
          reason: 'test',
          suggestion: 'test',
          confirmed: true,
          confirmedAt: '2026-04-01T00:00:00Z',
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      }),
    analysisBatchConfirmCertainty: vi
      .fn<() => Promise<ApiResponse<void>>>()
      .mockResolvedValue({ success: true, data: undefined }),
    ...overrides,
  } as unknown as typeof window.api)
}

describe('analysisStore — fog map actions', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ projects: {} })
    messageError.mockReset()
    mockApi()
  })

  it('should have fog map defaults in EMPTY_ANALYSIS_PROJECT_STATE', () => {
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMap).toBeNull()
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapSummary).toBeNull()
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapTaskId).toBeNull()
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapProgress).toBe(0)
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapMessage).toBe('')
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapLoading).toBe(false)
    expect(EMPTY_ANALYSIS_PROJECT_STATE.fogMapError).toBeNull()
  })

  describe('generateFogMap', () => {
    it('should set loading state and then taskId on success', async () => {
      await useAnalysisStore.getState().generateFogMap('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMapTaskId).toBe('fog-task-1')
      expect(ps.fogMapLoading).toBe(false)
      expect(ps.fogMapError).toBeNull()
    })

    it('should clear stale fog map data before starting regeneration', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMap: [
              {
                id: 'cert-1',
                requirementId: 'req-1',
                certaintyLevel: 'ambiguous',
                reason: '模糊',
                suggestion: '建议确认',
                confirmed: false,
                confirmedAt: null,
                createdAt: '2026-04-01T00:00:00Z',
                updatedAt: '2026-04-01T00:00:00Z',
                requirement: {
                  id: 'req-1',
                  sequenceNumber: 1,
                  description: '测试需求',
                  sourcePages: [1],
                  category: 'technical',
                  priority: 'high',
                },
              },
            ],
            fogMapSummary: {
              total: 1,
              clear: 0,
              ambiguous: 1,
              risky: 0,
              confirmed: 0,
              fogClearingPercentage: 0,
            },
          },
        },
      })

      await useAnalysisStore.getState().generateFogMap('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMap).toBeNull()
      expect(ps.fogMapSummary).toBeNull()
      expect(ps.fogMapTaskId).toBe('fog-task-1')
    })

    it('should set error on failure', async () => {
      mockApi({
        analysisGenerateFogMap: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'FOG_MAP_NO_REQUIREMENTS', message: '请先完成需求抽取' },
        }),
      } as unknown as Partial<typeof window.api>)

      await useAnalysisStore.getState().generateFogMap('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMapError).toBe('请先完成需求抽取')
      expect(ps.fogMapTaskId).toBeNull()
    })

    it('should not generate if already generating', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: 'existing-task',
          },
        },
      })

      await useAnalysisStore.getState().generateFogMap('proj-1')
      expect(window.api.analysisGenerateFogMap).not.toHaveBeenCalled()
    })

    it('should not generate while requirements extraction is still active', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            extractionTaskId: 'extract-1',
          },
        },
      })

      await useAnalysisStore.getState().generateFogMap('proj-1')

      expect(window.api.analysisGenerateFogMap).not.toHaveBeenCalled()
    })
  })

  describe('fetchFogMap', () => {
    it('should fetch and store fog map data', async () => {
      const mockItems: FogMapItem[] = [
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
          requirement: {
            id: 'req-1',
            sequenceNumber: 1,
            description: '系统应支持分布式架构',
            sourcePages: [1],
            category: 'technical',
            priority: 'high',
          },
        },
      ]
      mockApi({
        analysisGetFogMap: vi.fn().mockResolvedValue({ success: true, data: mockItems }),
      } as unknown as Partial<typeof window.api>)

      await useAnalysisStore.getState().fetchFogMap('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMap).toEqual(mockItems)
    })
  })

  describe('confirmCertainty', () => {
    it('should optimistically update and then call IPC', async () => {
      const mockFogMap: FogMapItem[] = [
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'ambiguous',
          reason: '模糊',
          suggestion: '建议确认',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          requirement: {
            id: 'req-1',
            sequenceNumber: 1,
            description: '测试需求',
            sourcePages: [1],
            category: 'technical',
            priority: 'high',
          },
        },
      ]

      useAnalysisStore.setState({
        projects: {
          'proj-1': { ...EMPTY_ANALYSIS_PROJECT_STATE, fogMap: mockFogMap },
        },
      })

      await useAnalysisStore.getState().confirmCertainty('cert-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      // Item should be confirmed but still in ambiguous group
      expect(ps.fogMap![0].confirmed).toBe(true)
      expect(ps.fogMap![0].certaintyLevel).toBe('ambiguous')
    })

    it('should rollback on IPC failure', async () => {
      const mockFogMap: FogMapItem[] = [
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'risky',
          reason: '风险',
          suggestion: '建议确认',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          requirement: {
            id: 'req-1',
            sequenceNumber: 1,
            description: '测试需求',
            sourcePages: [1],
            category: 'technical',
            priority: 'high',
          },
        },
      ]

      useAnalysisStore.setState({
        projects: {
          'proj-1': { ...EMPTY_ANALYSIS_PROJECT_STATE, fogMap: mockFogMap },
        },
      })

      mockApi({
        analysisConfirmCertainty: vi
          .fn()
          .mockResolvedValue({ success: false, error: { code: 'DB', message: 'fail' } }),
      } as unknown as Partial<typeof window.api>)

      await useAnalysisStore.getState().confirmCertainty('cert-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      // Should rollback to unconfirmed
      expect(ps.fogMap![0].confirmed).toBe(false)
      expect(messageError).toHaveBeenCalledWith('确认失败，请重试')
    })
  })

  describe('batchConfirmCertainty', () => {
    it('should optimistically confirm all items', async () => {
      const mockFogMap: FogMapItem[] = [
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'ambiguous',
          reason: 'r1',
          suggestion: 's1',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          requirement: {
            id: 'req-1',
            sequenceNumber: 1,
            description: 'd1',
            sourcePages: [1],
            category: 'technical',
            priority: 'high',
          },
        },
        {
          id: 'cert-2',
          requirementId: 'req-2',
          certaintyLevel: 'risky',
          reason: 'r2',
          suggestion: 's2',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          requirement: {
            id: 'req-2',
            sequenceNumber: 2,
            description: 'd2',
            sourcePages: [2],
            category: 'technical',
            priority: 'medium',
          },
        },
      ]

      useAnalysisStore.setState({
        projects: {
          'proj-1': { ...EMPTY_ANALYSIS_PROJECT_STATE, fogMap: mockFogMap },
        },
      })

      await useAnalysisStore.getState().batchConfirmCertainty('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMap![0].confirmed).toBe(true)
      expect(ps.fogMap![1].confirmed).toBe(true)
    })

    it('should rollback and notify when batch confirm IPC throws', async () => {
      const mockFogMap: FogMapItem[] = [
        {
          id: 'cert-1',
          requirementId: 'req-1',
          certaintyLevel: 'ambiguous',
          reason: 'r1',
          suggestion: 's1',
          confirmed: false,
          confirmedAt: null,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
          requirement: {
            id: 'req-1',
            sequenceNumber: 1,
            description: 'd1',
            sourcePages: [1],
            category: 'technical',
            priority: 'high',
          },
        },
      ]

      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMap: mockFogMap,
            fogMapSummary: {
              total: 1,
              clear: 0,
              ambiguous: 1,
              risky: 0,
              confirmed: 0,
              fogClearingPercentage: 0,
            },
          },
        },
      })

      mockApi({
        analysisBatchConfirmCertainty: vi.fn().mockRejectedValue(new Error('network down')),
      } as unknown as Partial<typeof window.api>)

      await useAnalysisStore.getState().batchConfirmCertainty('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMap![0].confirmed).toBe(false)
      expect(ps.fogMapSummary).toEqual({
        total: 1,
        clear: 0,
        ambiguous: 1,
        risky: 0,
        confirmed: 0,
        fogClearingPercentage: 0,
      })
      expect(messageError).toHaveBeenCalledWith('确认失败，请重试')
    })
  })

  describe('setFogMapCompleted', () => {
    it('should fetch fresh data and reset generation state', async () => {
      const mockSummary: FogMapSummary = {
        total: 5,
        clear: 2,
        ambiguous: 2,
        risky: 1,
        confirmed: 0,
        fogClearingPercentage: 40,
      }
      mockApi({
        analysisGetFogMap: vi.fn().mockResolvedValue({ success: true, data: [] }),
        analysisGetFogMapSummary: vi
          .fn()
          .mockResolvedValue({ success: true, data: mockSummary }),
      } as unknown as Partial<typeof window.api>)

      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: 'fog-task-1',
            fogMapProgress: 85,
          },
        },
      })

      await useAnalysisStore.getState().setFogMapCompleted('proj-1', 'fog-task-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMapTaskId).toBeNull()
      expect(ps.fogMapProgress).toBe(100)
      expect(ps.fogMapSummary).toEqual(mockSummary)
      expect(ps.fogMapLoading).toBe(false)
    })

    it('should ignore completion payloads for stale task ids', async () => {
      mockApi({
        analysisGetFogMap: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'new-data' }] }),
        analysisGetFogMapSummary: vi.fn().mockResolvedValue({
          success: true,
          data: {
            total: 1,
            clear: 1,
            ambiguous: 0,
            risky: 0,
            confirmed: 0,
            fogClearingPercentage: 100,
          },
        }),
      } as unknown as Partial<typeof window.api>)

      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: 'fog-task-1',
            fogMap: null,
            fogMapSummary: null,
          },
        },
      })

      await useAnalysisStore.getState().setFogMapCompleted('proj-1', 'different-task')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMapTaskId).toBe('fog-task-1')
      expect(ps.fogMap).toBeNull()
      expect(ps.fogMapSummary).toBeNull()
    })
  })

  describe('setFogMapCompleted — staleness guard', () => {
    it('should skip write-back when fogMapTaskId is already null (invalidated)', async () => {
      const mockSummary: FogMapSummary = {
        total: 5,
        clear: 5,
        ambiguous: 0,
        risky: 0,
        confirmed: 0,
        fogClearingPercentage: 100,
      }
      mockApi({
        analysisGetFogMap: vi.fn().mockResolvedValue({ success: true, data: [{ id: 'stale' }] }),
        analysisGetFogMapSummary: vi
          .fn()
          .mockResolvedValue({ success: true, data: mockSummary }),
      } as unknown as Partial<typeof window.api>)

      // Simulate state after extraction failure invalidated fogMapTaskId
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: null,
            fogMap: null,
            fogMapSummary: null,
          },
        },
      })

      await useAnalysisStore.getState().setFogMapCompleted('proj-1', 'fog-task-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      // Stale data should NOT have been written back
      expect(ps.fogMap).toBeNull()
      expect(ps.fogMapSummary).toBeNull()
    })
  })

  describe('setError with fog-map', () => {
    it('should set fogMapError and clear fogMapTaskId', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: 'fog-task-1',
            fogMapLoading: true,
          },
        },
      })

      useAnalysisStore.getState().setError('proj-1', '生成失败', 'fog-map')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.fogMapError).toBe('生成失败')
      expect(ps.fogMapTaskId).toBeNull()
      expect(ps.fogMapLoading).toBe(false)
    })
  })

  describe('setError with extraction — fog map invalidation', () => {
    it('should invalidate fogMapTaskId and fogMapLoading when extraction fails', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...EMPTY_ANALYSIS_PROJECT_STATE,
            fogMapTaskId: 'fog-task-running',
            fogMapLoading: false,
            fogMap: [{ id: 'cert-1' }] as FogMapItem[],
            fogMapSummary: { total: 1, clear: 1, ambiguous: 0, risky: 0, confirmed: 0, fogClearingPercentage: 100 },
          },
        },
      })

      useAnalysisStore.getState().setError('proj-1', '抽取失败', 'extraction')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      // Fog map task must be invalidated
      expect(ps.fogMapTaskId).toBeNull()
      expect(ps.fogMapLoading).toBe(false)
      // Fog map data must be cleared
      expect(ps.fogMap).toBeNull()
      expect(ps.fogMapSummary).toBeNull()
    })
  })
})
