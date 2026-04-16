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
  const mockSkeletonPlan = {
    parentTitle: '系统架构设计',
    parentLevel: 2,
    confirmedAt: '',
    dimensionChecklist: ['functional', 'interface'],
    sections: [
      {
        title: '总体架构',
        level: 3,
        dimensions: ['functional'],
        guidanceHint: '描述总体架构与边界',
      },
      {
        title: '模块设计',
        level: 3,
        dimensions: ['functional', 'interface'],
      },
    ],
  }

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
      taskDelete: vi.fn().mockResolvedValue({ success: true }),
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
      progressListener?.({ taskId: 'task-gen-1', progress: 20, message: 'validating-text' })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('validating-text')
    expect(status!.progress).toBe(20)
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

  it('@p0 should treat a 100% generating progress event as completion', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100, message: 'generating-text' })
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

  it('@p1 should consume chapter stream payload and refresh streamed content', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    act(() => {
      progressListener?.({
        taskId: 'task-gen-1',
        progress: 35,
        message: 'generating-diagrams',
        payload: {
          kind: 'chapter-stream',
          markdown: '正文段落\n\n> [图表生成中] 总体流程 {#diagram-placeholder:ph-1}',
          patch: {
            placeholderId: 'ph-1',
            markdown: '```mermaid\ngraph TD\nA-->B\n```',
          },
        },
      })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('generating-diagrams')
    expect(status!.streamedContent).toContain('图表生成中')
    expect(status!.latestDiagramPatch?.placeholderId).toBe('ph-1')
    expect(status!.streamRevision).toBe(1)
  })

  it('@p0 should not mark streamed AI content as a conflict on completion', async () => {
    const streamedContent = '正文段落\n\n```mermaid\ngraph TD\nA-->B\n```'

    vi.stubGlobal('api', {
      ...window.api,
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-gen-1',
          status: 'completed',
          result: { content: streamedContent },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    act(() => {
      progressListener?.({
        taskId: 'task-gen-1',
        progress: 80,
        message: 'composing',
        payload: {
          kind: 'chapter-stream',
          markdown: streamedContent,
        },
      })
    })

    mockDocumentContent.current = `## 系统架构设计\n\n${streamedContent}\n`

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('completed')
      expect(status!.generatedContent).toBe(streamedContent)
    })
  })

  it('@p0 should treat terminal completion before editor sync as completed rather than conflicted', async () => {
    const streamedContent = '正文段落\n\n```mermaid\ngraph TD\nA-->B\n```'

    vi.stubGlobal('api', {
      ...window.api,
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-gen-1',
          status: 'completed',
          result: { content: streamedContent },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startGeneration(mockTarget)
    })

    act(() => {
      progressListener?.({
        taskId: 'task-gen-1',
        progress: 80,
        message: 'composing',
        payload: {
          kind: 'chapter-stream',
          markdown: streamedContent,
        },
      })
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-gen-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('completed')
      expect(status!.generatedContent).toBe(streamedContent)
    })
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

  it('@p1 should restore completed tasks as completed when the document already contains final AI content', async () => {
    const baselineSectionContent = '\n> 请描述系统架构\n'
    const baselineDigest = createHash('sha256')
      .update(baselineSectionContent)
      .digest('hex')
      .slice(0, 16)
    const finalContent = '### 总体架构\n\nAI 已写入的最终内容'

    mockDocumentContent.current = `## 系统架构设计\n\n${finalContent}\n`

    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-restored-completed-same-content',
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
          taskId: 'task-restored-completed-same-content',
          status: 'completed',
          result: { content: finalContent },
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.phase).toBe('completed')
      expect(status!.generatedContent).toBe(finalContent)
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

  it('@p0 @story-5-4 startSkeletonGenerate sets correct initial status with skeleton-generate operationType and skeleton-generating phase', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1' } }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startSkeletonGenerate(mockTarget)
    })

    expect(window.api.chapterSkeletonGenerate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      target: mockTarget,
    })

    const status = result.current.getStatus(mockTarget)
    expect(status).toBeDefined()
    expect(status!.taskId).toBe('task-skel-1')
    expect(status!.operationType).toBe('skeleton-generate')
    expect(status!.phase).toBe('skeleton-generating')
  })

  it('@p1 @story-5-4 skeleton-generate completion with fallback:true auto-triggers startGeneration', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1' } }),
      chapterGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-gen-fallback-1' } }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-skel-1',
          status: 'completed',
          result: { fallback: true },
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
      await result.current.startSkeletonGenerate(mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-skel-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      expect(window.api.chapterGenerate).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        target: mockTarget,
      })
    })
  })

  it('@p0 @story-5-4 startBatchGenerate sets correct initial status with batch-generate operationType', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1' } }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))
    const sectionId = '2:系统架构设计:0'

    await act(async () => {
      await result.current.startBatchGenerate(mockTarget, sectionId)
    })

    expect(window.api.chapterBatchGenerate).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      target: mockTarget,
      sectionId,
    })

    const status = result.current.getStatus(mockTarget)
    expect(status).toBeDefined()
    expect(status!.taskId).toBe('task-batch-1')
    expect(status!.operationType).toBe('batch-generate')
  })

  it('@p0 @story-5-4 startBatchGenerate should seed the parent section with confirmed skeleton headings immediately', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1', batchId: 'batch-1' } }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: {
          taskId: 'task-skel-1',
          status: 'completed',
          result: {
            content: JSON.stringify({ fallback: false, plan: mockSkeletonPlan }),
          },
        },
      }),
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      taskDelete: vi.fn().mockResolvedValue({ success: true }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startSkeletonGenerate(mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-skel-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      expect(result.current.getStatus(mockTarget)?.phase).toBe('skeleton-ready')
    })

    await act(async () => {
      await result.current.startBatchGenerate(mockTarget, '2:系统架构设计:0')
    })

    const status = result.current.getStatus(mockTarget)
    expect(status).toBeDefined()
    expect(status!.phase).toBe('batch-generating')
    expect(status!.operationType).toBe('batch-generate')
    expect(status!.streamedContent).toContain('### 总体架构')
    expect(status!.streamedContent).toContain('### 模块设计')
    expect(status!.streamedContent).toContain('> [待生成]')
    expect(status!.batchSections).toHaveLength(2)
    expect(status!.batchSections?.[0]?.phase).toBe('generating')
    expect(status!.message).toBe('正在生成子章节 1/2：总体架构')
  })

  it('@p0 @story-5-4 should keep batch phase during child task progress and advance only on batch payloads', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1', batchId: 'batch-1' } }),
      agentStatus: vi.fn().mockImplementation(async (taskId: string) => {
        if (taskId === 'task-skel-1') {
          return {
            success: true,
            data: {
              taskId,
              status: 'completed',
              result: {
                content: JSON.stringify({ fallback: false, plan: mockSkeletonPlan }),
              },
            },
          }
        }
        return {
          success: true,
          data: {
            taskId,
            status: 'completed',
            result: { content: '子章节已完成正文' },
          },
        }
      }),
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      taskList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      taskDelete: vi.fn().mockResolvedValue({ success: true }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await act(async () => {
      await result.current.startSkeletonGenerate(mockTarget)
    })

    await act(async () => {
      progressListener?.({ taskId: 'task-skel-1', progress: 100, message: 'completed' })
    })

    await waitFor(() => {
      expect(result.current.getStatus(mockTarget)?.phase).toBe('skeleton-ready')
    })

    const agentStatusMock = vi.mocked(window.api.agentStatus)
    agentStatusMock.mockClear()

    await act(async () => {
      await result.current.startBatchGenerate(mockTarget, '2:系统架构设计:0')
    })

    const initialSnapshot = result.current.getStatus(mockTarget)?.streamedContent

    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-1',
        progress: 40,
        message: 'generating-text',
        payload: {
          kind: 'chapter-stream',
          markdown: '子章节流式内容',
        },
      })
    })

    let status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('batch-generating')
    expect(status!.streamedContent).toBe(initialSnapshot)
    expect(agentStatusMock).not.toHaveBeenCalled()

    await act(async () => {
      progressListener?.({ taskId: 'task-batch-1', progress: 100, message: 'generating-text' })
    })

    status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('batch-generating')
    expect(status!.generatedContent).toBeUndefined()
    expect(agentStatusMock).not.toHaveBeenCalled()

    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-1',
        progress: 50,
        message: 'batch-section-complete',
        payload: {
          kind: 'batch-section-complete',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionMarkdown: '第一节内容',
          assembledSnapshot: '### 总体架构\n\n第一节内容',
          completedCount: 1,
          totalCount: 2,
          nextTaskId: 'task-batch-2',
          nextSectionIndex: 1,
        },
      })
    })

    status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('batch-generating')
    expect(status!.taskId).toBe('task-batch-2')
    expect(status!.streamedContent).toBe('### 总体架构\n\n第一节内容')
    expect(status!.batchSections?.[0]?.phase).toBe('completed')
    expect(status!.batchSections?.[0]?.content).toBe('第一节内容')
    expect(status!.batchSections?.[1]?.phase).toBe('generating')
    expect(status!.message).toBe('正在生成子章节 2/2：模块设计')
  })
})
