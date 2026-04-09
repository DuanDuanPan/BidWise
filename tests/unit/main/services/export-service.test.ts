import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockDocxBridgeService = vi.hoisted(() => ({
  renderDocx: vi.fn(),
  getStatus: vi.fn(),
}))

const mockDocumentService = vi.hoisted(() => ({
  load: vi.fn(),
}))

const mockProjectService = vi.hoisted(() => ({
  get: vi.fn(),
}))

const mockTaskQueue = vi.hoisted(() => ({
  enqueue: vi.fn(),
  execute: vi.fn(),
  cancel: vi.fn(),
}))

const mockDialog = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
}))

const mockReadFile = vi.fn()
const mockCopyFile = vi.fn()
const mockRm = vi.fn()
const mockReaddir = vi.fn()
const mockStat = vi.fn()

const mockAccess = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? '/tmp/bidwise-test' : '/tmp/bidwise-test'),
    getAppPath: () => '/tmp/bidwise-app',
  },
  dialog: mockDialog,
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

vi.mock('@main/services/docx-bridge', () => ({
  docxBridgeService: mockDocxBridgeService,
}))

vi.mock('@main/services/document-service', () => ({
  documentService: mockDocumentService,
}))

vi.mock('@main/services/project-service', () => ({
  projectService: mockProjectService,
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: mockTaskQueue,
}))

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  stat: (...args: unknown[]) => mockStat(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}))

import { exportService } from '@main/services/export-service'

describe('exportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReaddir.mockResolvedValue([])
    mockRm.mockResolvedValue(undefined)
    mockTaskQueue.cancel.mockResolvedValue(undefined)
  })

  describe('startPreview', () => {
    it('enqueues export task and returns taskId', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-123')
      mockTaskQueue.execute.mockResolvedValue({})

      const result = await exportService.startPreview({ projectId: 'proj-1' })

      expect(result).toEqual({ taskId: 'task-123' })
      expect(mockTaskQueue.enqueue).toHaveBeenCalledWith({
        category: 'export',
        input: { projectId: 'proj-1' },
      })
    })

    it('fires execute and does not await it', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-456')
      let resolveExecute: (() => void) | undefined
      mockTaskQueue.execute.mockReturnValue(
        new Promise((resolve) => {
          resolveExecute = () => resolve({})
        })
      )

      const result = await exportService.startPreview({ projectId: 'proj-1' })

      expect(result).toEqual({ taskId: 'task-456' })
      expect(mockTaskQueue.execute).toHaveBeenCalledWith('task-456', expect.any(Function))

      resolveExecute?.()
      await Promise.resolve()
    })

    it('cleans up old preview files before enqueuing', async () => {
      mockReaddir.mockResolvedValue(['.preview-100.docx', '.preview-200.docx', 'other.docx'])
      mockTaskQueue.enqueue.mockResolvedValue('task-789')
      mockTaskQueue.execute.mockResolvedValue({})

      await exportService.startPreview({ projectId: 'proj-1' })

      // Should delete .preview-*.docx files but not other.docx
      expect(mockRm).toHaveBeenCalledTimes(2)
    })

    it('cancels the previous preview task when the same project re-triggers', async () => {
      mockTaskQueue.enqueue.mockResolvedValueOnce('task-1').mockResolvedValueOnce('task-2')
      mockTaskQueue.execute.mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce({})

      await exportService.startPreview({ projectId: 'proj-1' })
      await exportService.startPreview({ projectId: 'proj-1' })

      expect(mockTaskQueue.cancel).toHaveBeenCalledWith('task-1')
    })

    it('executor calls docxBridgeService.renderDocx with correct params', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-exec')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      // Now execute the captured executor
      const controller = new AbortController()
      const mockCtx = {
        updateProgress: vi.fn(),
        signal: controller.signal,
      }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Test Proposal',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      // No template-mapping.json
      mockReadFile.mockRejectedValue(new Error('ENOENT'))
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-123.docx',
        renderTimeMs: 500,
        pageCount: 5,
      })

      const result = await capturedExecutor!(mockCtx)

      expect(mockDocumentService.load).toHaveBeenCalledWith('proj-1')
      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          markdownContent: '# Test Proposal',
          projectId: 'proj-1',
        }),
        { signal: controller.signal }
      )
      expect(result).toEqual(
        expect.objectContaining({
          tempPath: expect.stringContaining('.preview-'),
          renderTimeMs: 500,
          pageCount: 5,
        })
      )
    })

    it('executor resolves template from template-mapping.json', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-tpl')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = {
        updateProgress: vi.fn(),
        signal: controller.signal,
      }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Proposal',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      // Return a valid template-mapping.json with absolute templatePath
      mockReadFile.mockResolvedValue(JSON.stringify({ templatePath: '/path/to/template.docx' }))
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/out.docx',
        renderTimeMs: 100,
      })

      await capturedExecutor!(mockCtx)

      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath: '/path/to/template.docx',
        }),
        { signal: controller.signal }
      )
    })

    it('executor resolves full mapping config with styles and pageSetup', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-full-mapping')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Full Mapping',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          templatePath: '/abs/template.docx',
          styles: { heading1: '标题 1', bodyText: '正文' },
          pageSetup: { contentWidthMm: 150 },
        })
      )
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/out.docx',
        renderTimeMs: 50,
      })

      await capturedExecutor!(mockCtx)

      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          styleMapping: { heading1: '标题 1', bodyText: '正文' },
          pageSetup: { contentWidthMm: 150 },
          projectPath: expect.stringContaining('proj-1'),
        }),
        { signal: controller.signal }
      )
    })

    it('executor handles legacy format (only templatePath)', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-legacy')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Legacy',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      // Legacy format: only templatePath
      mockReadFile.mockResolvedValue(JSON.stringify({ templatePath: '/legacy/template.docx' }))
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/out.docx',
        renderTimeMs: 30,
      })

      await capturedExecutor!(mockCtx)

      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath: '/legacy/template.docx',
          styleMapping: undefined,
          pageSetup: undefined,
        }),
        { signal: controller.signal }
      )
    })

    it('executor throws ValidationError on invalid JSON in template-mapping.json', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-bad-json')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Bad JSON',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      mockReadFile.mockResolvedValue('not valid json {{{')

      await expect(capturedExecutor!(mockCtx)).rejects.toThrow('template-mapping.json 格式错误')
    })

    it('executor throws ValidationError on non-object JSON (array)', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-array-json')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Array',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      mockReadFile.mockResolvedValue('[1, 2, 3]')

      await expect(capturedExecutor!(mockCtx)).rejects.toThrow(
        'template-mapping.json 必须是一个 JSON 对象'
      )
    })

    it('executor resolves relative templatePath using candidate paths', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-rel-path')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# Relative',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      mockReadFile.mockResolvedValue(
        JSON.stringify({ templatePath: 'company-data/templates/standard.docx' })
      )
      // First candidate (appPath) fails, second candidate (userData) succeeds
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockResolvedValueOnce(undefined)
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/out.docx',
        renderTimeMs: 20,
      })

      await capturedExecutor!(mockCtx)

      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath: '/tmp/bidwise-test/company-data/templates/standard.docx',
        }),
        { signal: controller.signal }
      )
    })

    it('executor falls back to first candidate path when no candidate exists', async () => {
      mockTaskQueue.enqueue.mockResolvedValue('task-no-candidate')
      let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | undefined
      mockTaskQueue.execute.mockImplementation(
        (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
          capturedExecutor = executor
          return Promise.resolve({})
        }
      )

      await exportService.startPreview({ projectId: 'proj-1' })

      const controller = new AbortController()
      const mockCtx = { updateProgress: vi.fn(), signal: controller.signal }
      mockDocumentService.load.mockResolvedValue({
        projectId: 'proj-1',
        content: '# No candidate',
        lastSavedAt: '2026-04-09T00:00:00Z',
        version: 1,
      })
      mockReadFile.mockResolvedValue(
        JSON.stringify({ templatePath: 'company-data/missing.docx' })
      )
      // All candidates fail
      mockAccess
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
      mockDocxBridgeService.renderDocx.mockResolvedValue({
        outputPath: '/tmp/out.docx',
        renderTimeMs: 10,
      })

      await capturedExecutor!(mockCtx)

      // Falls back to first candidate (appPath)
      expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(
        expect.objectContaining({
          templatePath: '/tmp/bidwise-app/company-data/missing.docx',
        }),
        { signal: controller.signal }
      )
    })
  })

  describe('loadPreviewContent', () => {
    it('reads docx file and returns base64', async () => {
      const fakeBuffer = Buffer.from('fake docx content')
      mockReadFile.mockResolvedValue(fakeBuffer)

      const result = await exportService.loadPreviewContent({
        projectId: 'proj-1',
        tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-12345.docx',
      })

      expect(result.docxBase64).toBe(fakeBuffer.toString('base64'))
    })

    it('rejects path traversal attempts', async () => {
      await expect(
        exportService.loadPreviewContent({
          projectId: 'proj-1',
          tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/../../etc/passwd',
        })
      ).rejects.toThrow()
    })

    it('rejects non-preview file names', async () => {
      await expect(
        exportService.loadPreviewContent({
          projectId: 'proj-1',
          tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/malicious.docx',
        })
      ).rejects.toThrow('无效的预览文件名')
    })
  })

  describe('confirmExport', () => {
    it('copies file to user-selected path and returns output info', async () => {
      mockStat
        .mockResolvedValueOnce({ size: 1024 }) // verify tempPath exists
        .mockResolvedValueOnce({ size: 1024 }) // get fileSize after copy
      mockProjectService.get.mockResolvedValue({ id: 'proj-1', name: '测试项目' })
      mockDialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/Users/test/Desktop/测试项目-方案.docx',
      })
      mockCopyFile.mockResolvedValue(undefined)

      const result = await exportService.confirmExport({
        projectId: 'proj-1',
        tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-12345.docx',
      })

      expect(result).toEqual({
        outputPath: '/Users/test/Desktop/测试项目-方案.docx',
        fileSize: 1024,
      })
      expect(mockCopyFile).toHaveBeenCalled()
    })

    it('returns cancelled when user cancels save dialog', async () => {
      mockStat.mockResolvedValue({ size: 1024 })
      mockProjectService.get.mockResolvedValue({ id: 'proj-1', name: '测试项目' })
      mockDialog.showSaveDialog.mockResolvedValue({ canceled: true })

      const result = await exportService.confirmExport({
        projectId: 'proj-1',
        tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-12345.docx',
      })

      expect(result).toEqual({ cancelled: true })
      expect(mockCopyFile).not.toHaveBeenCalled()
    })

    it('validates tempPath security boundary', async () => {
      await expect(
        exportService.confirmExport({
          projectId: 'proj-1',
          tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/../../../etc/passwd',
        })
      ).rejects.toThrow()
    })
  })

  describe('cleanupPreview', () => {
    it('removes specific tempPath when provided', async () => {
      await exportService.cleanupPreview({
        projectId: 'proj-1',
        tempPath: '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-100.docx',
      })

      expect(mockRm).toHaveBeenCalledWith(
        '/tmp/bidwise-test/data/projects/proj-1/exports/.preview-100.docx',
        { force: true }
      )
    })

    it('removes all preview files when no tempPath provided', async () => {
      mockReaddir.mockResolvedValue(['.preview-100.docx', '.preview-200.docx', 'final-output.docx'])

      await exportService.cleanupPreview({ projectId: 'proj-1' })

      // Only .preview-*.docx files removed, not final-output.docx
      expect(mockRm).toHaveBeenCalledTimes(2)
    })

    it('validates tempPath security when specific path provided', async () => {
      await expect(
        exportService.cleanupPreview({
          projectId: 'proj-1',
          tempPath: '/etc/passwd',
        })
      ).rejects.toThrow()
    })
  })
})
