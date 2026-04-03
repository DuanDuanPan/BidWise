import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup, act } from '@testing-library/react'
import { useAnalysisTaskMonitor } from '@modules/analysis/hooks/useAnalysis'
import { EMPTY_ANALYSIS_PROJECT_STATE, useAnalysisStore } from '@renderer/stores/analysisStore'
import type { FogMapSummary, ParsedTender } from '@shared/analysis-types'
import type { AnalysisProjectState } from '@renderer/stores/analysisStore'

const messageSuccess = vi.fn()
const messageError = vi.fn()

vi.mock('antd', () => ({
  message: {
    success: (...args: unknown[]) => messageSuccess(...args),
    error: (...args: unknown[]) => messageError(...args),
  },
}))

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

function makeProjectState(overrides: Partial<AnalysisProjectState> = {}): AnalysisProjectState {
  return {
    ...EMPTY_ANALYSIS_PROJECT_STATE,
    ...overrides,
  }
}

describe('useAnalysisTaskMonitor', () => {
  let progressListener:
    | ((event: { taskId: string; progress: number; message?: string }) => void)
    | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    progressListener = null
    messageSuccess.mockReset()
    messageError.mockReset()

    useAnalysisStore.setState({
      projects: {
        'proj-1': makeProjectState({
          importTaskId: 'task-1',
          parseProgress: 0,
          taskStatus: 'running',
        }),
      },
    })

    vi.stubGlobal('api', {
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskGetStatus: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'task-1',
            category: 'import',
            status: 'running',
            priority: 'normal',
            progress: 100,
            input: '{}',
            retryCount: 0,
            maxRetries: 0,
            createdAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:00.000Z',
          },
        })
        .mockResolvedValue({
          success: true,
          data: {
            id: 'task-1',
            category: 'import',
            status: 'completed',
            priority: 'normal',
            progress: 100,
            input: '{}',
            retryCount: 0,
            maxRetries: 0,
            createdAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:01.000Z',
            completedAt: '2026-03-21T00:00:02.000Z',
          },
        }),
      analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: mockParsedTender }),
      analysisGetFogMap: vi.fn().mockResolvedValue({ success: true, data: null }),
      analysisGetFogMapSummary: vi.fn().mockResolvedValue({ success: true, data: null }),
      analysisImportTender: vi.fn(),
      taskCancel: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('waits for completed task status before fetching result when progress reaches 100', async () => {
    renderHook(() => useAnalysisTaskMonitor())

    expect(progressListener).not.toBeNull()

    act(() => {
      progressListener?.({ taskId: 'task-1', progress: 100, message: '解析完成' })
    })

    await Promise.resolve()

    expect(window.api.analysisGetTender).not.toHaveBeenCalled()
    expect(messageSuccess).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.analysisGetTender).toHaveBeenCalledWith({ projectId: 'proj-1' })
    expect(messageSuccess).toHaveBeenCalledWith('招标文件解析完成')
  })

  it('polls active import tasks even when no workspace-specific project is mounted', async () => {
    renderHook(() => useAnalysisTaskMonitor())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000)
    })

    expect(window.api.taskGetStatus).toHaveBeenCalledWith({ taskId: 'task-1' })
  })

  it('ignores fog-map completion when the task is invalidated while status polling is in flight', async () => {
    let resolveStatus: ((value: unknown) => void) | null = null
    const statusPromise = new Promise((resolve) => {
      resolveStatus = resolve
    })
    const staleSummary: FogMapSummary = {
      total: 1,
      clear: 1,
      ambiguous: 0,
      risky: 0,
      confirmed: 0,
      fogClearingPercentage: 100,
    }

    vi.stubGlobal('api', {
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskGetStatus: vi.fn().mockReturnValue(statusPromise),
      analysisGetTender: vi.fn(),
      analysisGetFogMap: vi.fn().mockResolvedValue({
        success: true,
        data: [{ id: 'stale-certainty' }],
      }),
      analysisGetFogMapSummary: vi.fn().mockResolvedValue({ success: true, data: staleSummary }),
      taskCancel: vi.fn(),
    })

    useAnalysisStore.setState({
      projects: {
        'proj-1': makeProjectState({
          fogMapTaskId: 'fog-task-1',
          fogMapProgress: 100,
        }),
      },
    })

    renderHook(() => useAnalysisTaskMonitor())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(window.api.taskGetStatus).toHaveBeenCalledWith({ taskId: 'fog-task-1' })

    act(() => {
      useAnalysisStore.getState().setError('proj-1', '抽取失败', 'extraction')
    })

    await act(async () => {
      resolveStatus?.({
        success: true,
        data: {
          id: 'fog-task-1',
          category: 'import',
          status: 'completed',
          priority: 'normal',
          progress: 100,
          input: '{}',
          retryCount: 0,
          maxRetries: 0,
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:01.000Z',
          completedAt: '2026-03-21T00:00:02.000Z',
        },
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.analysisGetFogMap).not.toHaveBeenCalled()
    expect(window.api.analysisGetFogMapSummary).not.toHaveBeenCalled()
    expect(messageSuccess).not.toHaveBeenCalled()
  })
})
