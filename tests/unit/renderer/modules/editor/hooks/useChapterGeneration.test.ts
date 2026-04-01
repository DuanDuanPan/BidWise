import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup, act, waitFor } from '@testing-library/react'
import { useChapterGeneration } from '@modules/editor/hooks/useChapterGeneration'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

describe('@story-3-4 useChapterGeneration', () => {
  let progressListener:
    | ((event: { taskId: string; progress: number; message?: string }) => void)
    | null = null

  const mockTarget: ChapterHeadingLocator = {
    title: '系统架构设计',
    level: 2,
    occurrenceIndex: 0,
  }

  beforeEach(() => {
    progressListener = null

    vi.stubGlobal('api', {
      chapterGenerate: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-gen-1' },
      }),
      chapterRegenerate: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-regen-1' },
      }),
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-gen-1',
          status: 'completed',
          result: { content: '# Generated Content' },
        },
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [],
      }),
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('@p0 should start generation and track queued status', async () => {
    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    expect(window.api.chapterGenerate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      target: mockTarget,
    })

    const status = result.current.getStatus(mockTarget)
    expect(status).toBeDefined()
    expect(status!.taskId).toBe('task-gen-1')
  })

  it('@p0 should handle generation failure from IPC', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterGenerate: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: '章节未找到' },
      }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('failed')
    expect(status!.error).toBe('章节未找到')
  })

  it('@p0 should update phase on progress events', async () => {
    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    act(() => {
      progressListener?.({ taskId: 'task-gen-1', progress: 25, message: 'matching-assets' })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('matching-assets')
    expect(status!.progress).toBe(25)
  })

  it('@p0 should fetch result on completion progress event', async () => {
    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('completed')
      expect(status!.generatedContent).toBe('# Generated Content')
    })
  })

  it('@p0 should start regeneration with additional context', async () => {
    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startRegeneration('proj-1', mockTarget, '更多技术细节')
    })

    expect(window.api.chapterRegenerate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      target: mockTarget,
      additionalContext: '更多技术细节',
    })
  })

  it('@p0 should dismiss error and remove status', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterGenerate: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: '失败' },
      }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    expect(result.current.getStatus(mockTarget)!.phase).toBe('failed')

    act(() => {
      result.current.dismissError(mockTarget)
    })

    expect(result.current.getStatus(mockTarget)).toBeUndefined()
  })

  it('@p1 should restore active tasks on mount', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-1',
            status: 'running',
            progress: 50,
            input: JSON.stringify({
              target: mockTarget,
              baselineDigest: 'abc123',
            }),
          },
        ],
      }),
    })

    const { result } = renderHook(() => useChapterGeneration())

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.taskId).toBe('task-restored-1')
      expect(status!.progress).toBe(50)
    })
  })

  it('@p1 should retry by starting a new generation', async () => {
    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.retry('proj-1', mockTarget)
    })

    expect(window.api.chapterGenerate).toHaveBeenCalledTimes(1)
  })

  it('@p1 should handle failed status from agentStatus on completion', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-gen-1',
          status: 'failed',
          error: { message: 'Provider 超时' },
        },
      }),
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    const { result } = renderHook(() => useChapterGeneration())

    await act(async () => {
      await result.current.startGeneration('proj-1', mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100 })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('failed')
      expect(status!.error).toBe('Provider 超时')
    })
  })
})
