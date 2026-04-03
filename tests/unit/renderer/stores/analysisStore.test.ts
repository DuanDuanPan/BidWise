import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAnalysisStore, getAnalysisProjectState } from '@renderer/stores/analysisStore'
import type { ApiResponse } from '@shared/ipc-types'
import type { ImportTenderResult, ParsedTender } from '@shared/analysis-types'
import type { AnalysisProjectState } from '@renderer/stores/analysisStore'

const mockParsedTender: ParsedTender = {
  meta: {
    originalFileName: 'test.pdf',
    format: 'pdf',
    fileSize: 1024,
    pageCount: 5,
    importedAt: '2026-03-21T00:00:00.000Z',
    parseCompletedAt: '2026-03-21T00:01:00.000Z',
  },
  sections: [{ id: 'sec-1', title: '总则', content: '内容', pageStart: 1, pageEnd: 2, level: 1 }],
  rawText: '总则\n内容',
  totalPages: 5,
  hasScannedContent: false,
}

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    analysisImportTender: vi
      .fn<() => Promise<ApiResponse<ImportTenderResult>>>()
      .mockResolvedValue({ success: true, data: { taskId: 'task-1' } }),
    analysisGetTender: vi
      .fn<() => Promise<ApiResponse<ParsedTender | null>>>()
      .mockResolvedValue({ success: true, data: mockParsedTender }),
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
    fogMap: null,
    fogMapSummary: null,
    fogMapTaskId: null,
    fogMapProgress: 0,
    fogMapMessage: '',
    fogMapLoading: false,
    fogMapError: null,
    ...overrides,
  }
}

describe('analysisStore', () => {
  beforeEach(() => {
    useAnalysisStore.setState({
      projects: {},
    })
    mockApi()
  })

  describe('importTender', () => {
    it('should set importTaskId and loading state', async () => {
      await useAnalysisStore.getState().importTender('proj-1', '/test.pdf')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.importTaskId).toBe('task-1')
      expect(projectState.loading).toBe(false)
      expect(projectState.error).toBeNull()
    })

    it('should set error on API failure', async () => {
      mockApi({
        analysisImportTender: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'TENDER_IMPORT', message: '导入失败' },
        }),
      })

      await useAnalysisStore.getState().importTender('proj-1', '/bad.pdf')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.error).toBe('导入失败')
      expect(projectState.loading).toBe(false)
    })
  })

  describe('updateParseProgress', () => {
    it('should update progress and message', () => {
      useAnalysisStore.getState().updateParseProgress('proj-1', 50, '提取文档文本...')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.parseProgress).toBe(50)
      expect(projectState.parseMessage).toBe('提取文档文本...')
    })
  })

  describe('setParseCompleted', () => {
    it('should set parsed result and clear loading', () => {
      useAnalysisStore.getState().setParseCompleted('proj-1', mockParsedTender)

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.parsedTender).toEqual(mockParsedTender)
      expect(projectState.tenderMeta).toEqual(mockParsedTender.meta)
      expect(projectState.importTaskId).toBeNull()
      expect(projectState.parseProgress).toBe(100)
      expect(projectState.loading).toBe(false)
    })
  })

  describe('fetchTenderResult', () => {
    it('should load existing parsed result', async () => {
      await useAnalysisStore.getState().fetchTenderResult('proj-1')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.parsedTender).toEqual(mockParsedTender)
      expect(projectState.tenderMeta).toEqual(mockParsedTender.meta)
      expect(projectState.loading).toBe(false)
    })

    it('should handle null result (no tender imported)', async () => {
      mockApi({
        analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
      })

      await useAnalysisStore.getState().fetchTenderResult('proj-1')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.parsedTender).toBeNull()
      expect(projectState.tenderMeta).toBeNull()
    })

    it('should preserve another project active import when loading a different project result', async () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            importTaskId: 'task-1',
            parseProgress: 50,
            parseMessage: '识别文档结构...',
            taskStatus: 'running',
          }),
        },
      })
      mockApi({
        analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
      })

      await useAnalysisStore.getState().fetchTenderResult('proj-2')

      const runningProject = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      const otherProject = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-2')

      expect(runningProject.importTaskId).toBe('task-1')
      expect(runningProject.parseProgress).toBe(50)
      expect(runningProject.parseMessage).toBe('识别文档结构...')
      expect(otherProject.parsedTender).toBeNull()
    })
  })

  describe('setError', () => {
    it('should set error and clear loading', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({ loading: true }),
        },
      })
      useAnalysisStore.getState().setError('proj-1', '解析失败')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.error).toBe('解析失败')
      expect(projectState.loading).toBe(false)
    })

    it('should clear extraction task state on extraction failure', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            extractionTaskId: 'extract-1',
            extractionLoading: true,
            taskStatus: 'completed',
          }),
        },
      })

      useAnalysisStore.getState().setError('proj-1', '抽取失败', 'extraction')

      const projectState = getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')
      expect(projectState.error).toBe('抽取失败')
      expect(projectState.extractionTaskId).toBeNull()
      expect(projectState.extractionLoading).toBe(false)
      expect(projectState.taskStatus).toBe('completed')
    })
  })

  describe('reset', () => {
    it('should clear only the requested project state', () => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': makeEmptyProjectState({
            parsedTender: mockParsedTender,
            importTaskId: 'task-1',
            parseProgress: 50,
            loading: true,
            error: 'some error',
          }),
          'proj-2': makeEmptyProjectState({
            importTaskId: 'task-2',
          }),
        },
      })

      useAnalysisStore.getState().reset('proj-1')

      expect(getAnalysisProjectState(useAnalysisStore.getState(), 'proj-1')).toEqual(
        makeEmptyProjectState()
      )
      expect(getAnalysisProjectState(useAnalysisStore.getState(), 'proj-2').importTaskId).toBe(
        'task-2'
      )
    })
  })
})
