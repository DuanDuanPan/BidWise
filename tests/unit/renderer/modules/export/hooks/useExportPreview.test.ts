import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useExportPreview } from '@modules/export/hooks/useExportPreview'

// Mock window.api
const mockApi = {
  exportPreview: vi.fn(),
  exportLoadPreview: vi.fn(),
  exportConfirm: vi.fn(),
  exportCleanupPreview: vi.fn(),
  taskCancel: vi.fn(),
  taskGetStatus: vi.fn(),
  onTaskProgress: vi.fn(),
}

// Mock antd message
vi.mock('antd', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { value: mockApi, writable: true })
  mockApi.exportCleanupPreview.mockResolvedValue({ success: true, data: undefined })
  mockApi.taskCancel.mockResolvedValue({ success: true, data: undefined })
  mockApi.onTaskProgress.mockReturnValue(vi.fn()) // return unsubscribe function
})

afterEach(cleanup)

describe('useExportPreview', () => {
  it('starts in idle phase', () => {
    const { result } = renderHook(() => useExportPreview())

    expect(result.current.phase).toBe('idle')
    expect(result.current.projectId).toBeNull()
    expect(result.current.taskId).toBeNull()
    expect(result.current.docxBase64).toBeNull()
  })

  it('triggerPreview transitions to loading and calls IPC', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-001' },
    })
    // The hook polls task status immediately to guard against the race condition
    // where the task completes before the progress listener is registered.
    // Return "running" so the hook stays in loading phase.
    mockApi.taskGetStatus.mockResolvedValue({
      success: true,
      data: { id: 'task-001', status: 'running', progress: 10 },
    })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    expect(result.current.phase).toBe('loading')
    expect(result.current.taskId).toBe('task-001')
    expect(result.current.projectId).toBe('proj-1')
    expect(mockApi.exportPreview).toHaveBeenCalledWith({ projectId: 'proj-1' })
    expect(mockApi.onTaskProgress).toHaveBeenCalled()
    // Verify immediate status poll was made (race condition guard)
    expect(mockApi.taskGetStatus).toHaveBeenCalledWith({ taskId: 'task-001' })
  })

  it('sets error when exportPreview IPC fails', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: false,
      error: { code: 'DOCX_BRIDGE_UNAVAILABLE', message: '渲染引擎未就绪' },
    })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('渲染引擎未就绪')
  })

  it('cancelPreview cancels task and resets state', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-cancel' },
    })
    mockApi.taskGetStatus.mockResolvedValue({
      success: true,
      data: { id: 'task-cancel', status: 'running', progress: 10 },
    })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    await act(async () => {
      result.current.cancelPreview()
    })

    expect(mockApi.taskCancel).toHaveBeenCalledWith('task-cancel')
    expect(result.current.phase).toBe('idle')
    expect(mockApi.exportCleanupPreview).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('closePreview cleans up and resets state', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-close' },
    })
    mockApi.taskGetStatus.mockResolvedValue({
      success: true,
      data: { id: 'task-close', status: 'running', progress: 10 },
    })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    await act(async () => {
      result.current.closePreview()
    })

    expect(result.current.phase).toBe('idle')
    expect(mockApi.exportCleanupPreview).toHaveBeenCalled()
  })

  it('confirmExport calls IPC and handles success', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-exp' },
    })
    // First call: initial poll returns running; second call: task completed
    mockApi.taskGetStatus
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'task-exp', status: 'running', progress: 10 },
      })
      .mockResolvedValue({
        success: true,
        data: {
          id: 'task-exp',
          status: 'completed',
          output: JSON.stringify({
            tempPath: '/tmp/preview.docx',
            fileName: '.preview-123.docx',
            renderTimeMs: 100,
          }),
        },
      })

    const { result } = renderHook(() => useExportPreview())

    // Simulate getting to ready state manually
    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    // Simulate ready state by getting progress callback and completing
    const progressCallback = mockApi.onTaskProgress.mock.calls[0][0]
    mockApi.exportLoadPreview.mockResolvedValue({
      success: true,
      data: { docxBase64: 'base64content' },
    })

    await act(async () => {
      progressCallback({ taskId: 'task-exp', progress: 100, message: 'completed' })
    })

    // Now confirm export
    mockApi.exportConfirm.mockResolvedValue({
      success: true,
      data: { outputPath: '/Users/test/方案.docx', fileSize: 1024 },
    })

    await act(async () => {
      result.current.confirmExport()
    })

    expect(result.current.phase).toBe('idle')
    expect(mockApi.exportConfirm).toHaveBeenCalledWith({
      projectId: 'proj-1',
      tempPath: '/tmp/preview.docx',
    })
  })

  it('confirmExport keeps modal open when user cancels save dialog', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-save-cancel' },
    })
    // First call: initial poll returns running; second call: task completed
    mockApi.taskGetStatus
      .mockResolvedValueOnce({
        success: true,
        data: { id: 'task-save-cancel', status: 'running', progress: 10 },
      })
      .mockResolvedValue({
        success: true,
        data: {
          id: 'task-save-cancel',
          status: 'completed',
          output: JSON.stringify({
            tempPath: '/tmp/preview.docx',
            fileName: '.preview-123.docx',
            renderTimeMs: 100,
          }),
        },
      })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    // Fast-forward to ready state
    const progressCallback = mockApi.onTaskProgress.mock.calls[0][0]
    mockApi.exportLoadPreview.mockResolvedValue({
      success: true,
      data: { docxBase64: 'base64content' },
    })

    await act(async () => {
      progressCallback({ taskId: 'task-save-cancel', progress: 100, message: 'completed' })
    })

    // Cancel save dialog
    mockApi.exportConfirm.mockResolvedValue({
      success: true,
      data: { cancelled: true },
    })

    await act(async () => {
      result.current.confirmExport()
    })

    // Should still be in ready state — modal stays open
    expect(result.current.phase).toBe('ready')
    expect(result.current.docxBase64).toBe('base64content')
  })

  it('handles failed task progress event', async () => {
    mockApi.exportPreview.mockResolvedValue({
      success: true,
      data: { taskId: 'task-fail' },
    })
    mockApi.taskGetStatus.mockResolvedValue({
      success: true,
      data: { id: 'task-fail', status: 'running', progress: 10 },
    })

    const { result } = renderHook(() => useExportPreview())

    await act(async () => {
      result.current.triggerPreview('proj-1')
    })

    const progressCallback = mockApi.onTaskProgress.mock.calls[0][0]

    await act(async () => {
      progressCallback({ taskId: 'task-fail', progress: 50, message: 'failed' })
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('预览渲染失败')
  })
})
