import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useAnalysisStore,
  getAnalysisProjectState,
  findAnalysisProjectIdByTaskId,
} from '@renderer/stores/analysisStore'
import type { ApiResponse } from '@shared/ipc-types'
import type {
  GenerateMatrixResult,
  TraceabilityMatrix,
  TraceabilityStats,
  TraceabilityLink,
  ImportAddendumResult,
} from '@shared/analysis-types'

function mockApi(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('api', {
    analysisGenerateMatrix: vi.fn<() => Promise<ApiResponse<GenerateMatrixResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'matrix-task-1' } }),
    analysisGetMatrix: vi.fn<() => Promise<ApiResponse<TraceabilityMatrix | null>>>()
      .mockResolvedValue({ success: true, data: null }),
    analysisGetMatrixStats: vi.fn<() => Promise<ApiResponse<TraceabilityStats | null>>>()
      .mockResolvedValue({ success: true, data: null }),
    analysisCreateLink: vi.fn<() => Promise<ApiResponse<TraceabilityLink>>>()
      .mockResolvedValue({ success: true, data: {} as TraceabilityLink }),
    analysisUpdateLink: vi.fn<() => Promise<ApiResponse<TraceabilityLink>>>()
      .mockResolvedValue({ success: true, data: { projectId: 'proj-1' } as TraceabilityLink }),
    analysisDeleteLink: vi.fn<() => Promise<ApiResponse<void>>>()
      .mockResolvedValue({ success: true, data: undefined }),
    analysisImportAddendum: vi.fn<() => Promise<ApiResponse<ImportAddendumResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'addendum-task-1' } }),
    analysisGetRequirements: vi.fn().mockResolvedValue({ success: true, data: null }),
    ...overrides,
  })
}

describe('analysisStore traceability @story-2-8', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ projects: {} })
    mockApi()
  })

  describe('generateMatrix', () => {
    it('@p1 should set matrixGenerationTaskId on success', async () => {
      await useAnalysisStore.getState().generateMatrix('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.matrixGenerationTaskId).toBe('matrix-task-1')
      expect(state.matrixGenerationLoading).toBe(false)
    })

    it('@p1 should set error on failure', async () => {
      mockApi({
        analysisGenerateMatrix: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'MATRIX_GENERATION_FAILED', message: '生成失败' },
        }),
      })

      await useAnalysisStore.getState().generateMatrix('proj-1')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.matrixGenerationError).toBe('生成失败')
      expect(state.matrixGenerationTaskId).toBeNull()
    })

    it('@p2 should guard against concurrent generation', async () => {
      // Set existing task
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            matrixGenerationTaskId: 'existing-task',
          },
        },
      })

      await useAnalysisStore.getState().generateMatrix('proj-1')
      // Should not have called the API
      expect(window.api.analysisGenerateMatrix).not.toHaveBeenCalled()
    })
  })

  describe('importAddendum', () => {
    it('@p1 should set addendumImportTaskId on success', async () => {
      await useAnalysisStore.getState().importAddendum('proj-1', { content: '补遗内容' })
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.addendumImportTaskId).toBe('addendum-task-1')
    })

    it('@p1 should preserve the last meaningful addendum progress message', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            addendumImportTaskId: 'addendum-task-1',
            addendumImportMessage: '追溯映射更新失败，请手动重新生成矩阵',
          },
        },
      })

      useAnalysisStore.getState().updateAddendumImportProgress('proj-1', 100)
      let state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.addendumImportMessage).toBe('追溯映射更新失败，请手动重新生成矩阵')

      useAnalysisStore.getState().updateAddendumImportProgress('proj-1', 100, '')
      state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.addendumImportMessage).toBe('追溯映射更新失败，请手动重新生成矩阵')
    })

    it('@p1 should keep the backend completion message when refreshing addendum artifacts', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            addendumImportTaskId: 'addendum-task-1',
            addendumImportMessage: '追溯映射更新失败，请手动重新生成矩阵',
          },
        },
      })

      await useAnalysisStore.getState().setAddendumImportCompleted('proj-1')

      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.addendumImportTaskId).toBeNull()
      expect(state.addendumImportMessage).toBe('追溯映射更新失败，请手动重新生成矩阵')
    })
  })

  describe('findAnalysisProjectIdByTaskId', () => {
    it('@p1 should find project by matrixGenerationTaskId', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            matrixGenerationTaskId: 'matrix-task-1',
          },
        },
      })

      const result = findAnalysisProjectIdByTaskId(useAnalysisStore.getState(), 'matrix-task-1')
      expect(result).toBe('proj-1')
    })

    it('@p1 should find project by addendumImportTaskId', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            addendumImportTaskId: 'addendum-task-1',
          },
        },
      })

      const result = findAnalysisProjectIdByTaskId(useAnalysisStore.getState(), 'addendum-task-1')
      expect(result).toBe('proj-1')
    })
  })

  describe('setError with matrix/addendum kinds', () => {
    it('@p1 should set matrixGenerationError for matrix kind', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            matrixGenerationTaskId: 'task-1',
          },
        },
      })

      useAnalysisStore.getState().setError('proj-1', '生成失败', 'matrix')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.matrixGenerationError).toBe('生成失败')
      expect(state.matrixGenerationTaskId).toBeNull()
      expect(state.matrixGenerationLoading).toBe(false)
    })

    it('@p1 should set addendumImportError for addendum kind', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            ...getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1'),
            addendumImportTaskId: 'task-1',
          },
        },
      })

      useAnalysisStore.getState().setError('proj-1', '导入失败', 'addendum')
      const state = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(state.addendumImportError).toBe('导入失败')
      expect(state.addendumImportTaskId).toBeNull()
    })
  })
})
