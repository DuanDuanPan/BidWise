import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useAnalysisStore,
  getAnalysisProjectState,
  findAnalysisProjectIdByTaskId,
} from '@renderer/stores/analysisStore'
import type { ApiResponse } from '@shared/ipc-types'
import type { GenerateSeedsResult, StrategySeed, StrategySeedSummary } from '@shared/analysis-types'
import type { AnalysisProjectState } from '@renderer/stores/analysisStore'

const mockSeed: StrategySeed = {
  id: 'seed-1',
  title: '数据安全需求',
  reasoning: '客户在多次沟通中强调数据保护是核心关注点',
  suggestion: '在方案中突出数据加密、审计日志等能力',
  sourceExcerpt: '我们非常关注数据安全',
  confidence: 0.85,
  status: 'pending',
  createdAt: '2026-04-01T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
}

const mockSeedConfirmed: StrategySeed = {
  ...mockSeed,
  id: 'seed-2',
  title: '国产化替代诉求',
  status: 'confirmed',
}

const mockSeedAdjusted: StrategySeed = {
  ...mockSeed,
  id: 'seed-3',
  title: '快速交付期望',
  status: 'adjusted',
}

const mockSummary: StrategySeedSummary = {
  total: 3,
  confirmed: 1,
  adjusted: 1,
  pending: 1,
}

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    analysisGenerateSeeds: vi
      .fn<() => Promise<ApiResponse<GenerateSeedsResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'seed-task-1' } }),
    analysisGetSeeds: vi.fn<() => Promise<ApiResponse<StrategySeed[] | null>>>().mockResolvedValue({
      success: true,
      data: [mockSeed, mockSeedConfirmed, mockSeedAdjusted],
    }),
    analysisGetSeedSummary: vi
      .fn<() => Promise<ApiResponse<StrategySeedSummary | null>>>()
      .mockResolvedValue({ success: true, data: mockSummary }),
    analysisUpdateSeed: vi.fn<() => Promise<ApiResponse<StrategySeed>>>().mockResolvedValue({
      success: true,
      data: { ...mockSeed, status: 'confirmed', updatedAt: '2026-04-01T11:00:00.000Z' },
    }),
    analysisDeleteSeed: vi
      .fn<() => Promise<ApiResponse<void>>>()
      .mockResolvedValue({ success: true, data: undefined }),
    analysisAddSeed: vi.fn<() => Promise<ApiResponse<StrategySeed>>>().mockResolvedValue({
      success: true,
      data: {
        id: 'seed-4',
        title: '手动添加种子',
        reasoning: '用户手动识别的隐性需求',
        suggestion: '在方案中体现',
        sourceExcerpt: '',
        confidence: 1.0,
        status: 'confirmed',
        createdAt: '2026-04-01T12:00:00.000Z',
        updatedAt: '2026-04-01T12:00:00.000Z',
      },
    }),
    ...overrides,
  })
}

function makeEmptyProjectState(
  overrides: Partial<AnalysisProjectState> = {}
): AnalysisProjectState {
  return {
    tenderMeta: null,
    parsedTender: null,
    importTaskId: null,
    parseProgress: 0,
    parseMessage: '',
    loading: false,
    error: null,
    taskStatus: null,
    requirements: null,
    scoringModel: null,
    extractionTaskId: null,
    extractionProgress: 0,
    extractionMessage: '',
    extractionLoading: false,
    mandatoryItems: null,
    mandatorySummary: null,
    mandatoryDetectionTaskId: null,
    mandatoryDetectionProgress: 0,
    mandatoryDetectionMessage: '',
    mandatoryDetectionLoading: false,
    mandatoryDetectionError: null,
    seeds: null,
    seedSummary: null,
    seedGenerationTaskId: null,
    seedGenerationProgress: 0,
    seedGenerationMessage: '',
    seedGenerationLoading: false,
    seedGenerationError: null,
    ...overrides,
  }
}

describe('analysisStore – strategy seeds', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ projects: {} })
    mockApi()
  })

  describe('generateSeeds', () => {
    it('should set seedGenerationTaskId on success', async () => {
      await useAnalysisStore.getState().generateSeeds('proj-1', '客户沟通材料内容')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationTaskId).toBe('seed-task-1')
      expect(ps.seedGenerationLoading).toBe(false)
      expect(ps.seedGenerationError).toBeNull()
    })

    it('should set error on API failure', async () => {
      mockApi({
        analysisGenerateSeeds: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'SEED_GENERATION_FAILED', message: '生成失败' },
        }),
      })

      await useAnalysisStore.getState().generateSeeds('proj-1', '素材')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationError).toBe('生成失败')
      expect(ps.seedGenerationLoading).toBe(false)
      expect(ps.seedGenerationTaskId).toBeNull()
    })

    it('should set error on exception', async () => {
      mockApi({
        analysisGenerateSeeds: vi.fn().mockRejectedValue(new Error('网络异常')),
      })

      await useAnalysisStore.getState().generateSeeds('proj-1', '素材')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationError).toBe('网络异常')
      expect(ps.seedGenerationLoading).toBe(false)
    })

    it('should guard against concurrent generation', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ seedGenerationTaskId: 'existing-task' }),
        },
      })

      await useAnalysisStore.getState().generateSeeds('proj-1', '素材')

      // Should not have called API
      expect(window.api.analysisGenerateSeeds).not.toHaveBeenCalled()
    })
  })

  describe('fetchSeeds', () => {
    it('should populate seeds from API', async () => {
      await useAnalysisStore.getState().fetchSeeds('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds).toHaveLength(3)
      expect(ps.seeds![0].id).toBe('seed-1')
    })

    it('should handle null response silently', async () => {
      mockApi({
        analysisGetSeeds: vi.fn().mockResolvedValue({ success: true, data: null }),
      })

      await useAnalysisStore.getState().fetchSeeds('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds).toBeNull()
    })
  })

  describe('fetchSeedSummary', () => {
    it('should populate seed summary from API', async () => {
      await useAnalysisStore.getState().fetchSeedSummary('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedSummary).toEqual(mockSummary)
    })
  })

  describe('updateSeed', () => {
    it('should update seed in-place and recompute summary', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seeds: [mockSeed, mockSeedConfirmed, mockSeedAdjusted],
            seedSummary: mockSummary,
          }),
        },
      })

      await useAnalysisStore.getState().updateSeed('seed-1', { status: 'confirmed' })

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds![0].status).toBe('confirmed')
      expect(ps.seedSummary!.confirmed).toBe(2)
      expect(ps.seedSummary!.pending).toBe(0)
    })

    it('should throw on API failure', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ seeds: [mockSeed] }),
        },
      })
      mockApi({
        analysisUpdateSeed: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'NOT_FOUND', message: '种子不存在' },
        }),
      })

      await expect(
        useAnalysisStore.getState().updateSeed('seed-1', { status: 'confirmed' })
      ).rejects.toThrow('种子不存在')
    })
  })

  describe('deleteSeed', () => {
    it('should remove seed and recompute summary', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seeds: [mockSeed, mockSeedConfirmed, mockSeedAdjusted],
            seedSummary: mockSummary,
          }),
        },
      })

      await useAnalysisStore.getState().deleteSeed('seed-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds).toHaveLength(2)
      expect(ps.seeds!.find((s) => s.id === 'seed-1')).toBeUndefined()
      expect(ps.seedSummary!.total).toBe(2)
      expect(ps.seedSummary!.pending).toBe(0)
    })

    it('should throw on API failure', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ seeds: [mockSeed] }),
        },
      })
      mockApi({
        analysisDeleteSeed: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'NOT_FOUND', message: '种子不存在' },
        }),
      })

      await expect(useAnalysisStore.getState().deleteSeed('seed-1')).rejects.toThrow('种子不存在')
    })
  })

  describe('addSeed', () => {
    it('should append new seed and recompute summary', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seeds: [mockSeed],
            seedSummary: { total: 1, confirmed: 0, adjusted: 0, pending: 1 },
          }),
        },
      })

      await useAnalysisStore
        .getState()
        .addSeed('proj-1', '手动添加种子', '用户手动识别的隐性需求', '在方案中体现')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds).toHaveLength(2)
      expect(ps.seeds![1].id).toBe('seed-4')
      expect(ps.seeds![1].status).toBe('confirmed')
      expect(ps.seedSummary!.total).toBe(2)
      expect(ps.seedSummary!.confirmed).toBe(1)
    })

    it('should throw on API failure', async () => {
      mockApi({
        analysisAddSeed: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'DUPLICATE', message: '标题已存在' },
        }),
      })

      await expect(
        useAnalysisStore.getState().addSeed('proj-1', '重复标题', '推理', '建议')
      ).rejects.toThrow('标题已存在')
    })
  })

  describe('updateSeedGenerationProgress', () => {
    it('should update progress and message', () => {
      useAnalysisStore.getState().updateSeedGenerationProgress('proj-1', 50, '生成中...')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationProgress).toBe(50)
      expect(ps.seedGenerationMessage).toBe('生成中...')
    })

    it('should keep previous message when not provided', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ seedGenerationMessage: '正在分析...' }),
        },
      })

      useAnalysisStore.getState().updateSeedGenerationProgress('proj-1', 75)

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationProgress).toBe(75)
      expect(ps.seedGenerationMessage).toBe('正在分析...')
    })
  })

  describe('setSeedGenerationCompleted', () => {
    it('should fetch fresh seeds/summary and clear task state', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seedGenerationTaskId: 'seed-task-1',
            seedGenerationProgress: 95,
            seedGenerationLoading: false,
          }),
        },
      })

      await useAnalysisStore.getState().setSeedGenerationCompleted('proj-1')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seeds).toHaveLength(3)
      expect(ps.seedSummary).toEqual(mockSummary)
      expect(ps.seedGenerationTaskId).toBeNull()
      expect(ps.seedGenerationProgress).toBe(100)
      expect(ps.seedGenerationMessage).toBe('策略种子生成完成')
      expect(ps.seedGenerationError).toBeNull()
    })
  })

  describe('setSeedGenerationError', () => {
    it('should set error and clear task state', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seedGenerationTaskId: 'seed-task-1',
            seedGenerationLoading: false,
          }),
        },
      })

      useAnalysisStore.getState().setSeedGenerationError('proj-1', 'AI 超时')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationError).toBe('AI 超时')
      expect(ps.seedGenerationTaskId).toBeNull()
      expect(ps.seedGenerationLoading).toBe(false)
    })
  })

  describe('setError with seed taskKind', () => {
    it('should set seedGenerationError and clear seed task state', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            seedGenerationTaskId: 'seed-task-1',
            seedGenerationLoading: false,
            error: null,
          }),
        },
      })

      useAnalysisStore.getState().setError('proj-1', '种子生成失败', 'seed')

      const ps = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(ps.seedGenerationError).toBe('种子生成失败')
      expect(ps.seedGenerationTaskId).toBeNull()
      expect(ps.seedGenerationLoading).toBe(false)
      // Seed errors go to seedGenerationError, not the general error field
      expect(ps.error).toBeNull()
    })
  })

  describe('findAnalysisProjectIdByTaskId with seed tasks', () => {
    it('should find project by seed generation task ID', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ importTaskId: 'import-1' }),
          'proj-2': makeEmptyProjectState({ seedGenerationTaskId: 'seed-task-42' }),
        },
      })

      expect(findAnalysisProjectIdByTaskId(useAnalysisStore.getState(), 'seed-task-42')).toBe(
        'proj-2'
      )
    })
  })
})
