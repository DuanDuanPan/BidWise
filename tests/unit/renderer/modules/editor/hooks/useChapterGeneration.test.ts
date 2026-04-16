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

describe('@story-3-11 useChapterGeneration — batch retry/skip/retrying', () => {
  let progressListener:
    | ((event: { taskId: string; progress: number; message?: string; payload?: unknown }) => void)
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
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
      chapterSkeletonConfirm: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
      chapterBatchGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-batch-1', batchId: 'batch-1' } }),
      chapterBatchRetrySection: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-retry-1', batchId: 'batch-1', sectionIndex: 0 },
      }),
      chapterBatchSkipSection: vi.fn().mockResolvedValue({
        success: true,
        data: {
          batchId: 'batch-1',
          skippedSectionIndex: 0,
          nextTaskId: 'task-next-1',
          nextSectionIndex: 1,
        },
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

  const mockSkeletonPlan = {
    parentTitle: '系统架构设计',
    parentLevel: 2,
    confirmedAt: '',
    dimensionChecklist: ['functional', 'interface'],
    sections: [
      { title: '总体架构', level: 3, dimensions: ['functional'] },
      { title: '模块设计', level: 3, dimensions: ['functional', 'interface'] },
    ],
  }

  /** Helper: start a batch generate with skeleton plan and get it into a failed section state */
  async function setupBatchWithFailedSection(result: {
    current: ReturnType<typeof useChapterGeneration>
  }): Promise<void> {
    // First set skeleton plan so batchSections are populated
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
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
    })

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

    // Simulate section 0 failure (retry budget exhausted)
    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-1',
        progress: 0,
        message: 'batch-section-failed',
        payload: {
          kind: 'batch-section-failed',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionTitle: '总体架构',
          error: 'LLM timeout',
          completedCount: 0,
          totalCount: 2,
        },
      })
    })
  }

  it('@p0 should handle batch-section-retrying payload and clear error', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
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

    // Retrying comes directly (auto-retry triggers before budget exhaustion)
    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-1',
        progress: 0,
        message: 'batch-section-retrying',
        payload: {
          kind: 'batch-section-retrying',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionTitle: '总体架构',
          retryCount: 1,
          maxRetries: 3,
          retryInSeconds: 5,
        },
      })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('batch-generating')
    expect(status!.error).toBeUndefined()
    expect(status!.message).toContain('正在重试')
    expect(status!.message).toContain('1/3')
    expect(status!.batchSections?.[0]?.phase).toBe('retrying')
    expect(status!.batchSections?.[0]?.retryCount).toBe(1)
    expect(status!.batchSections?.[0]?.retryInSeconds).toBe(5)
  })

  it('@p0 should call chapterBatchRetrySection IPC when retry() is called in batch mode', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    const status = result.current.getStatus(mockTarget)
    expect(status!.error).toBe('LLM timeout')
    expect(status!.batchSections?.[0]?.phase).toBe('failed')

    // Retry
    await act(async () => {
      await result.current.retry(mockTarget)
    })

    expect(window.api.chapterBatchRetrySection).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      batchId: 'batch-1',
      sectionIndex: 0,
    })

    const updatedStatus = result.current.getStatus(mockTarget)
    expect(updatedStatus!.phase).toBe('batch-generating')
    expect(updatedStatus!.error).toBeUndefined()
    expect(updatedStatus!.taskId).toBe('task-retry-1')
    expect(updatedStatus!.batchSections?.[0]?.phase).toBe('generating')
    expect(updatedStatus!.locked).toBe(true)
    // Message should reflect retry progress, not stale failure text
    expect(updatedStatus!.message).toContain('正在生成子章节')
    expect(updatedStatus!.message).not.toContain('失败')
  })

  it('@p0 should call chapterBatchSkipSection IPC when dismissError() is called in batch mode', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    // Dismiss (skip)
    await act(async () => {
      result.current.dismissError(mockTarget)
    })

    await waitFor(() => {
      expect(window.api.chapterBatchSkipSection).toHaveBeenCalledWith({
        projectId: PROJECT_ID,
        batchId: 'batch-1',
        sectionIndex: 0,
      })
    })

    await waitFor(() => {
      const updatedStatus = result.current.getStatus(mockTarget)
      expect(updatedStatus!.batchSections?.[0]?.phase).toBe('completed')
      expect(updatedStatus!.batchSections?.[0]?.content).toBe('> [已跳过 - 请手动补充]')
      expect(updatedStatus!.error).toBeUndefined()
      expect(updatedStatus!.batchSections?.[1]?.phase).toBe('generating')
    })
  })

  it('@p0 should clear error on batch-section-complete after retrying', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    // Call retry to register task-retry-1 in taskToLocator
    await act(async () => {
      await result.current.retry(mockTarget)
    })

    // Simulate retry success via batch-section-complete
    await act(async () => {
      progressListener?.({
        taskId: 'task-retry-1',
        progress: 50,
        message: 'batch-section-complete',
        payload: {
          kind: 'batch-section-complete',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionMarkdown: '重试后的内容',
          assembledSnapshot: '### 总体架构\n\n重试后的内容',
          completedCount: 1,
          totalCount: 2,
          nextTaskId: 'task-batch-2',
          nextSectionIndex: 1,
        },
      })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.error).toBeUndefined()
    expect(status!.batchSections?.[0]?.phase).toBe('completed')
  })

  it('@p1 should restore skeleton-batch-single tasks as batch-generate operationType', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockImplementation((callback) => {
        progressListener = callback
        return () => {
          progressListener = null
        }
      }),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-batch-single-1', status: 'failed', error: { message: '超时' } },
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-batch-single-1',
            status: 'failed',
            progress: 30,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              mode: 'skeleton-batch-single',
              batchId: 'batch-restored-1',
            }),
          },
        ],
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.operationType).toBe('batch-generate')
      expect(status!.batchId).toBe('batch-restored-1')
    })

    // Verify taskId is routed — auto-retry handoff payload on old taskId should be accepted
    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-single-1',
        progress: 0,
        message: 'batch-section-retrying',
        payload: {
          kind: 'batch-section-retrying',
          batchId: 'batch-restored-1',
          sectionIndex: 0,
          sectionTitle: '功能设计',
          retryCount: 1,
          maxRetries: 3,
          retryInSeconds: 0,
          newTaskId: 'task-auto-retry-after-restore',
        },
      })
    })

    const updated = result.current.getStatus(mockTarget)
    // If routing works, taskId should be updated to the new one from the handoff
    expect(updated!.taskId).toBe('task-auto-retry-after-restore')
    expect(updated!.error).toBeUndefined()
  })

  it('@p1 should call retry IPC without sectionIndex when batchSections missing', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    // Start batch — batchSections are pending/generating, none failed
    await act(async () => {
      await result.current.startBatchGenerate(mockTarget, '2:系统架构设计:0')
    })

    await act(async () => {
      await result.current.retry(mockTarget)
    })

    // batchId exists, no failed section → calls retry IPC without sectionIndex (service auto-detects)
    expect(window.api.chapterBatchRetrySection).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      batchId: 'batch-1',
      sectionIndex: undefined,
    })
  })

  it('@p0 auto-retry retrying payload with newTaskId registers new task for routing', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
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

    // Simulate auto-retry dispatch handoff with newTaskId
    await act(async () => {
      progressListener?.({
        taskId: 'task-batch-1',
        progress: 0,
        message: 'batch-section-retrying',
        payload: {
          kind: 'batch-section-retrying',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionTitle: '总体架构',
          retryCount: 1,
          maxRetries: 3,
          retryInSeconds: 0,
          newTaskId: 'task-auto-retry-1',
        },
      })
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.taskId).toBe('task-auto-retry-1')
    expect(status!.batchSections?.[0]?.phase).toBe('generating')
    expect(status!.batchSections?.[0]?.taskId).toBe('task-auto-retry-1')

    // Verify new taskId is routed — send a batch-section-complete on it
    await act(async () => {
      progressListener?.({
        taskId: 'task-auto-retry-1',
        progress: 50,
        message: 'batch-section-complete',
        payload: {
          kind: 'batch-section-complete',
          batchId: 'batch-1',
          sectionIndex: 0,
          sectionMarkdown: '重试成功的内容',
          assembledSnapshot: '### 总体架构\n\n重试成功的内容',
          completedCount: 1,
          totalCount: 2,
          nextTaskId: 'task-batch-2',
          nextSectionIndex: 1,
        },
      })
    })

    const updated = result.current.getStatus(mockTarget)
    expect(updated!.batchSections?.[0]?.phase).toBe('completed')
    expect(updated!.batchSections?.[0]?.content).toBe('重试成功的内容')
  })

  it('@p0 manualEdit clears status without triggering skip IPC', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    const statusBefore = result.current.getStatus(mockTarget)
    expect(statusBefore!.error).toBe('LLM timeout')

    act(() => {
      result.current.manualEdit(mockTarget)
    })

    // Status should be completely cleared — user is now editing manually
    expect(result.current.getStatus(mockTarget)).toBeUndefined()
    // Skip IPC should NOT have been called
    expect(window.api.chapterBatchSkipSection).not.toHaveBeenCalled()
    // Task record should be deleted so re-entry doesn't resurrect it
    expect(window.api.taskDelete).toHaveBeenCalled()
  })

  it('@p0 skip terminal case transitions to completed phase', async () => {
    // Set up skip to return no nextTaskId (terminal)
    vi.stubGlobal('api', {
      ...window.api,
      chapterSkeletonGenerate: vi
        .fn()
        .mockResolvedValue({ success: true, data: { taskId: 'task-skel-1' } }),
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
      chapterBatchSkipSection: vi.fn().mockResolvedValue({
        success: true,
        data: {
          batchId: 'batch-1',
          skippedSectionIndex: 0,
          // No nextTaskId — this is the last section
          assembledSnapshot: '### 总体架构\n\n> [已跳过 - 请手动补充]\n\n### 模块设计\n\n模块内容',
        },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    // Trigger skip (dismissError in batch mode)
    await act(async () => {
      result.current.dismissError(mockTarget)
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status!.phase).toBe('completed')
      expect(status!.locked).toBe(false)
      expect(status!.error).toBeUndefined()
      // generatedContent should be set for EditorView terminal replacement
      expect(status!.generatedContent).toContain('已跳过')
      expect(status!.streamedContent).toContain('已跳过')
    })
  })

  it('@p0 skip mid-batch updates streamedContent from assembledSnapshot', async () => {
    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await setupBatchWithFailedSection(result)

    // Trigger skip (dismissError in batch mode) — mock has nextTaskId (mid-batch)
    await act(async () => {
      result.current.dismissError(mockTarget)
    })

    await waitFor(() => {
      expect(window.api.chapterBatchSkipSection).toHaveBeenCalled()
    })

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      // Default mock returns nextTaskId → mid-batch path
      expect(status!.phase).toBe('batch-generating')
      expect(status!.locked).toBe(true)
    })
  })

  it('@p0 retry on re-entry (no batchSections) calls IPC without sectionIndex', async () => {
    // Simulate restore: batch-generate task with batchId but no batchSections
    vi.stubGlobal('api', {
      ...window.api,
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      agentStatus: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-batch-single-1', status: 'failed', error: { message: '超时' } },
      }),
      taskList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'task-batch-single-1',
            status: 'failed',
            progress: 30,
            input: JSON.stringify({
              projectId: PROJECT_ID,
              target: mockTarget,
              mode: 'skeleton-batch-single',
              batchId: 'batch-restored-1',
            }),
          },
        ],
      }),
      chapterBatchRetrySection: vi.fn().mockResolvedValue({
        success: true,
        data: { taskId: 'task-retry-restored', batchId: 'batch-restored-1', sectionIndex: 1 },
      }),
    })

    const { result } = renderHook(() => useChapterGeneration(PROJECT_ID))

    await waitFor(() => {
      const status = result.current.getStatus(mockTarget)
      expect(status).toBeDefined()
      expect(status!.operationType).toBe('batch-generate')
      expect(status!.batchId).toBe('batch-restored-1')
      // batchSections is NOT populated on restore
      expect(status!.batchSections).toBeUndefined()
    })

    // Retry — should call IPC without sectionIndex (auto-detect)
    await act(async () => {
      await result.current.retry(mockTarget)
    })

    expect(window.api.chapterBatchRetrySection).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      batchId: 'batch-restored-1',
      sectionIndex: undefined,
    })

    const status = result.current.getStatus(mockTarget)
    expect(status!.phase).toBe('batch-generating')
    expect(status!.taskId).toBe('task-retry-restored')
  })
})
