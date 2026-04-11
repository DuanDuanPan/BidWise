import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useReviewTaskMonitor } from '@modules/review/hooks/useReviewTaskMonitor'
import {
  createProjectState,
  getReviewProjectState,
  useReviewStore,
} from '@renderer/stores/reviewStore'

const messageError = vi.fn()
const messageSuccess = vi.fn()
const messageWarning = vi.fn()
let progressListener:
  | ((event: { taskId: string; progress: number; message?: string }) => void)
  | null = null

vi.mock('antd', () => ({
  message: {
    error: (...args: unknown[]) => messageError(...args),
    success: (...args: unknown[]) => messageSuccess(...args),
    warning: (...args: unknown[]) => messageWarning(...args),
  },
}))

function makeTaskStatus(
  status: 'failed' | 'cancelled',
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 'task-1',
    category: 'ai',
    status,
    priority: 'normal',
    progress: 55,
    input: '{}',
    retryCount: 0,
    maxRetries: 0,
    createdAt: '2026-04-12T00:00:00.000Z',
    updatedAt: '2026-04-12T00:00:01.000Z',
    completedAt: '2026-04-12T00:00:02.000Z',
    ...overrides,
  }
}

function stubApi(taskStatus: Record<string, unknown>): void {
  vi.stubGlobal('api', {
    onTaskProgress: vi.fn().mockImplementation((callback) => {
      progressListener = callback
      return () => {
        progressListener = null
      }
    }),
    taskGetStatus: vi.fn().mockResolvedValue({
      success: true,
      data: taskStatus,
    }),
    reviewGetLineup: vi.fn(),
    reviewGenerateRoles: vi.fn(),
    reviewUpdateRoles: vi.fn(),
    reviewConfirmLineup: vi.fn(),
    complianceCheck: vi.fn(),
  })
}

describe('useReviewTaskMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    progressListener = null
    messageError.mockReset()
    messageSuccess.mockReset()
    messageWarning.mockReset()
  })

  afterEach(() => {
    useReviewStore.setState({ projects: {} })
    vi.useRealTimers()
    cleanup()
  })

  it('reconciles a failed terminal progress event immediately even when progress is below 100', async () => {
    stubApi(makeTaskStatus('failed', { error: 'Provider 超时' }))
    useReviewStore.setState({
      projects: {
        'proj-1': createProjectState({
          lineupTaskId: 'task-1',
          lineupLoading: true,
          lineupProgress: 25,
          lineupMessage: '正在生成...',
        }),
      },
    })

    renderHook(() => useReviewTaskMonitor())

    await act(async () => {
      progressListener?.({ taskId: 'task-1', progress: 55, message: 'failed' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.taskGetStatus).toHaveBeenCalledWith({ taskId: 'task-1' })
    const projectState = getReviewProjectState(useReviewStore.getState(), 'proj-1')
    expect(projectState.lineupLoading).toBe(false)
    expect(projectState.lineupTaskId).toBeNull()
    expect(projectState.lineupError).toBe('Provider 超时')
    expect(messageError).toHaveBeenCalledWith({
      content: '对抗角色生成失败：Provider 超时',
      duration: 0,
    })
  })

  it('reconciles a cancelled terminal progress event immediately even when progress is below 100', async () => {
    stubApi(makeTaskStatus('cancelled', { error: 'Task cancelled' }))
    useReviewStore.setState({
      projects: {
        'proj-1': createProjectState({
          lineupTaskId: 'task-1',
          lineupLoading: true,
          lineupProgress: 40,
          lineupMessage: '正在生成...',
        }),
      },
    })

    renderHook(() => useReviewTaskMonitor())

    await act(async () => {
      progressListener?.({ taskId: 'task-1', progress: 40, message: 'cancelled' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(window.api.taskGetStatus).toHaveBeenCalledWith({ taskId: 'task-1' })
    const projectState = getReviewProjectState(useReviewStore.getState(), 'proj-1')
    expect(projectState.lineupLoading).toBe(false)
    expect(projectState.lineupTaskId).toBeNull()
    expect(projectState.lineupError).toBe('对抗角色生成已取消')
    expect(messageError).not.toHaveBeenCalled()
  })
})
