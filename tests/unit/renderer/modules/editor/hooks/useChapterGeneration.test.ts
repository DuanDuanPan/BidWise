import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup, act, waitFor } from '@testing-library/react'
import { createHash } from 'crypto'
import { useChapterGeneration } from '@modules/editor/hooks/useChapterGeneration'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

// Mock useDocumentStore for conflict detection
const mockDocumentContent = { current: '' }
vi.mock('@renderer/stores', () => ({
  useDocumentStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ content: mockDocumentContent.current })
    ),
    {
      getState: () => ({ content: mockDocumentContent.current }),
    }
  ),
}))

describe('@story-3-4 useChapterGeneration', () => {
  let progressListener:
    | ((event: { taskId: string; progress: number; message?: string }) => void)
    | null = null

  const mockTarget: ChapterHeadingLocator = {
    title: '系统架构设计',
    level: 2,
    occurrenceIndex: 0,
  }

  const PROJECT_ID = 'proj-1'

  beforeEach(() => {
    progressListener = null
    mockDocumentContent.current = '## 系统架构设计\n\n> 请描述系统架构\n'

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
      documentLoad: vi.fn().mockImplementation(async () => ({
        success: true,
        data: { content: mockDocumentContent.current },
      })),
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('@p0 should start generation and track queued status', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    expect(window.api.chapterGenerate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      target: mockTarget,
    })

    const status = result.current.getStatus(mockTarget)
    expect(status).toBeDefined()
    expect(status!.taskId).toBe('task-gen-1')
    expect(status!.operationType).toBe('generate')
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

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('failed')
    expect(status!.error).toBe('章节未找到')
  })

  it('@p0 should update phase on progress events', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    act(() => {
      progressListener?.({ taskId: 'task-gen-1', progress: 25, message: 'matching-assets' })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('matching-assets')
    expect(status!.progress).toBe(25)
  })

  it('@p0 should fetch result on completion progress event', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
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

  it('@p0 should detect conflict when section content changed during generation', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    // Simulate user editing the section while AI is generating
    mockDocumentContent.current = '## 系统架构设计\n\n用户手动编辑的内容\n'

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('conflicted')
      expect(status!.generatedContent).toBe('# Generated Content')
    })
  })

  it('@p0 should start regeneration with additional context', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startRegeneration(mockTarget, '更多技术细节')
    })

    expect(window.api.chapterRegenerate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      target: mockTarget,
      additionalContext: '更多技术细节',
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.operationType).toBe('regenerate')
    expect(status!.additionalContext).toBe('更多技术细节')
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

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    expect(result.current.getStatus(mockTarget)!.phase).toBe('failed')

    act(() => {
      result.current.dismissError(mockTarget)
    })

    expect(result.current.getStatus(mockTarget)).toBeUndefined()
  })

  it('@p1 should restore active tasks on mount scoped to current project', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-restored-1',
          status: 'running',
        },
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-1',
            status: 'running',
            progress: 50,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              baselineDigest: 'abc123',
            }),
          },
          {
            id: 'task-other-project',
            status: 'running',
            progress: 30,
            input: JSON.stringify({
              projectId: 'other-project',
              target: { title: '其他章节', level: 2, occurrenceIndex: 0 },
            }),
          },
        ],
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.taskId).toBe('task-restored-1')
      expect(status!.progress).toBe(50)
    })

    // Other project's task should NOT be restored
    const otherStatus = result.current.getStatus({
      title: '其他章节',
      level: 2,
      occurrenceIndex: 0,
    })
    expect(otherStatus).toBeUndefined()
  })

  it('@p1 should map pending tasks to queued phase on restore', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-pending-1',
          status: 'pending',
        },
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-pending-1',
            status: 'pending',
            progress: 0,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
            }),
          },
        ],
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.phase).toBe('queued')
    })
  })

  it('@p1 should detect conflicts for restored tasks using baselineDigest', async () => {
    const baselineSectionContent = '\n> 请描述系统架构\n'
    const baselineDigest = createHash('sha256')
      .update(baselineSectionContent)
      .digest('hex')
      .slice(0, 16)

    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-conflict',
            status: 'running',
            progress: 75,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              baselineDigest,
            }),
          },
        ],
      }),
      agentStatus: vi
        .fn()
        .mockResolvedValueOnce({
          success: true,
          data: {
            taskId: 'task-restored-conflict',
            status: 'running',
          },
        })
        .mockResolvedValue({
          success: true,
          data: {
            taskId: 'task-restored-conflict',
            status: 'completed',
            result: { content: '# Restored Content' },
          },
        }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.taskId).toBe('task-restored-conflict')
    })

    mockDocumentContent.current = '## 系统架构设计\n\n用户手动编辑的内容\n'

    await act(async () => {
      progressListener?.({ taskId: 'task-restored-conflict', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('conflicted')
      expect(status!.generatedContent).toBe('# Restored Content')
    })
  })

  it('@p1 should restore completed tasks that still need editor injection', async () => {
    const baselineSectionContent = '\n> 请描述系统架构\n'
    const baselineDigest = createHash('sha256')
      .update(baselineSectionContent)
      .digest('hex')
      .slice(0, 16)

    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-completed',
            status: 'completed',
            progress: 100,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              baselineDigest,
            }),
          },
        ],
      }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-restored-completed',
          status: 'completed',
          result: { content: '# Completed While Away' },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.phase).toBe('completed')
      expect(status!.generatedContent).toBe('# Completed While Away')
    })
  })

  it('@p1 should restore completed tasks as conflicted when the document changed since baseline', async () => {
    const baselineSectionContent = '\n> 请描述系统架构\n'
    const baselineDigest = createHash('sha256')
      .update(baselineSectionContent)
      .digest('hex')
      .slice(0, 16)

    mockDocumentContent.current = '## 系统架构设计\n\n用户手动编辑的内容\n'

    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-conflicted-completed',
            status: 'completed',
            progress: 100,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              baselineDigest,
            }),
          },
        ],
      }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-restored-conflicted-completed',
          status: 'completed',
          result: { content: '# Completed While Away' },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.phase).toBe('conflicted')
      expect(status!.generatedContent).toBe('# Completed While Away')
    })
  })

  it('@p1 should restore running tasks that already completed as conflicted when the document changed since baseline', async () => {
    const baselineSectionContent = '\n> 请描述系统架构\n'
    const baselineDigest = createHash('sha256')
      .update(baselineSectionContent)
      .digest('hex')
      .slice(0, 16)

    mockDocumentContent.current = '## 系统架构设计\n\n用户手动编辑的内容\n'

    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-running-now-complete',
            status: 'running',
            progress: 80,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              baselineDigest,
            }),
          },
        ],
      }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-restored-running-now-complete',
          status: 'completed',
          result: { content: '# Completed While Away' },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.phase).toBe('conflicted')
      expect(status!.generatedContent).toBe('# Completed While Away')
    })
  })

  it('@p1 should retry regeneration using regenerate path', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    // First start a regeneration that fails
    vi.stubGlobal('api', {
      ...window.api,
      chapterRegenerate: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'ERR', message: 'Provider 超时' },
      }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    await act(async () => {
      await result.current.startRegeneration(mockTarget, '更多细节')
    })

    expect(result.current.getStatus(mockTarget)!.phase).toBe('failed')
    expect(result.current.getStatus(mockTarget)!.operationType).toBe('regenerate')

    // Now set up a successful regenerate for retry
    vi.stubGlobal('api', {
      ...window.api,
      chapterRegenerate: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-retry-1' },
      }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    await act(async () => {
      await result.current.retry(mockTarget)
    })

    // Should have called chapterRegenerate, not chapterGenerate
    expect(window.api.chapterRegenerate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      target: mockTarget,
      additionalContext: '更多细节',
    })
  })

  it('@p1 should retry generation using generate path', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.retry(mockTarget)
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

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
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

  it('@p1 should handle failed task progress notifications without a 100 event', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-gen-1',
          status: 'failed',
          error: { message: 'Mock AI: forced error for E2E testing' },
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

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 50, message: 'failed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('failed')
      expect(status!.error).toBe('Mock AI: forced error for E2E testing')
    })
  })

  it('@p0 should expose currentProjectId', () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))
    expect(result.current.currentProjectId).toBe(PROJECT_ID)
  })
})
