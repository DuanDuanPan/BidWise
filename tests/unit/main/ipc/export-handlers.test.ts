import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'

const mockExportService = vi.hoisted(() => ({
  startPreview: vi.fn(),
  loadPreviewContent: vi.fn(),
  confirmExport: vi.fn(),
  cleanupPreview: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: { getPath: () => '/tmp/bidwise-test' },
  dialog: { showSaveDialog: vi.fn() },
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@main/services/export-service', () => ({
  exportService: mockExportService,
}))

import { registerExportHandlers } from '@main/ipc/export-handlers'

describe('registerExportHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 4 export IPC channels', () => {
    registerExportHandlers()

    const registeredChannels = (ipcMain.handle as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toContain('export:preview')
    expect(registeredChannels).toContain('export:load-preview')
    expect(registeredChannels).toContain('export:confirm')
    expect(registeredChannels).toContain('export:cleanup-preview')
    expect(registeredChannels).toHaveLength(4)
  })

  it('dispatches export:preview to exportService.startPreview', async () => {
    mockExportService.startPreview.mockResolvedValue({ taskId: 'task-123' })

    registerExportHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'export:preview'
    )?.[1]

    const input = { projectId: 'proj-1' }
    const result = await callback({}, input)

    expect(mockExportService.startPreview).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: { taskId: 'task-123' } })
  })

  it('dispatches export:load-preview to exportService.loadPreviewContent', async () => {
    mockExportService.loadPreviewContent.mockResolvedValue({ docxBase64: 'AAAA' })

    registerExportHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'export:load-preview'
    )?.[1]

    const input = { projectId: 'proj-1', tempPath: '/path/to/.preview-123.docx' }
    const result = await callback({}, input)

    expect(mockExportService.loadPreviewContent).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: { docxBase64: 'AAAA' } })
  })

  it('dispatches export:confirm to exportService.confirmExport', async () => {
    mockExportService.confirmExport.mockResolvedValue({ outputPath: '/out.docx', fileSize: 1024 })

    registerExportHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'export:confirm'
    )?.[1]

    const input = { projectId: 'proj-1', tempPath: '/path/to/.preview-123.docx' }
    const result = await callback({}, input)

    expect(mockExportService.confirmExport).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: { outputPath: '/out.docx', fileSize: 1024 } })
  })

  it('dispatches export:cleanup-preview to exportService.cleanupPreview', async () => {
    mockExportService.cleanupPreview.mockResolvedValue(undefined)

    registerExportHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'export:cleanup-preview'
    )?.[1]

    const input = { projectId: 'proj-1' }
    const result = await callback({}, input)

    expect(mockExportService.cleanupPreview).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('wraps service errors in error response format', async () => {
    const { ValidationError } = await import('@main/utils/errors')
    mockExportService.startPreview.mockRejectedValue(new ValidationError('方案内容为空'))

    registerExportHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'export:preview'
    )?.[1]

    const result = await callback({}, { projectId: 'proj-1' })

    expect(result).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: '方案内容为空' },
    })
  })
})
