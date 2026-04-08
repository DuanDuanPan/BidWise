import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockProcessManager = vi.hoisted(() => ({
  startProcess: vi.fn(),
  stopProcess: vi.fn(),
  startHealthCheck: vi.fn(),
  getStatus: vi.fn(),
}))

const mockRenderDocxHttp = vi.fn()
const mockCheckHealthHttp = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/bidwise-test' },
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

vi.mock('@main/services/docx-bridge/process-manager', () => ({
  processManager: mockProcessManager,
}))

vi.mock('@main/services/docx-bridge/render-client', () => ({
  renderDocx: (...args: unknown[]) => mockRenderDocxHttp(...args),
  checkHealth: (...args: unknown[]) => mockCheckHealthHttp(...args),
}))

const mockMkdir = vi.fn().mockResolvedValue(undefined)
vi.mock('fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}))

import { docxBridgeService } from '@main/services/docx-bridge'

describe('docxBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockProcessManager.getStatus.mockReturnValue({ ready: true, port: 9000, pid: 1234 })
    mockProcessManager.startProcess.mockResolvedValue({ port: 9000, pid: 1234 })
    mockProcessManager.stopProcess.mockResolvedValue(undefined)
  })

  describe('start', () => {
    it('starts process manager and health check', async () => {
      await docxBridgeService.start()

      expect(mockProcessManager.startProcess).toHaveBeenCalled()
      expect(mockProcessManager.startHealthCheck).toHaveBeenCalled()
    })

    it('does not throw when startProcess fails (degrades gracefully)', async () => {
      mockProcessManager.startProcess.mockRejectedValue(new Error('spawn failed'))

      await expect(docxBridgeService.start()).resolves.toBeUndefined()
    })
  })

  describe('stop', () => {
    it('stops process manager', async () => {
      await docxBridgeService.stop()

      expect(mockProcessManager.stopProcess).toHaveBeenCalled()
    })
  })

  describe('renderDocx', () => {
    it('throws DOCX_BRIDGE_UNAVAILABLE when not ready', async () => {
      mockProcessManager.getStatus.mockReturnValue({ ready: false })

      await expect(
        docxBridgeService.renderDocx({
          markdownContent: '# Test',
          outputPath: 'out.docx',
          projectId: 'proj-1',
        })
      ).rejects.toThrow('渲染引擎未就绪')
    })

    it('validates outputPath must be under project exports/', async () => {
      await expect(
        docxBridgeService.renderDocx({
          markdownContent: '# Test',
          outputPath: '../../etc/passwd',
          projectId: 'proj-1',
        })
      ).rejects.toThrow()
    })

    it('validates outputPath with absolute path escape', async () => {
      await expect(
        docxBridgeService.renderDocx({
          markdownContent: '# Test',
          outputPath: '/etc/passwd',
          projectId: 'proj-1',
        })
      ).rejects.toThrow()
    })

    it('creates exports directory and delegates to render client', async () => {
      const mockResult = { outputPath: '/tmp/out.docx', renderTimeMs: 42 }
      mockRenderDocxHttp.mockResolvedValue(mockResult)

      const result = await docxBridgeService.renderDocx({
        markdownContent: '# Test',
        outputPath: 'output.docx',
        projectId: 'proj-1',
      })

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('exports'), {
        recursive: true,
      })
      expect(mockRenderDocxHttp).toHaveBeenCalledWith(
        expect.objectContaining({
          markdownContent: '# Test',
          outputPath: expect.stringContaining('exports'),
        })
      )
      expect(result).toEqual(mockResult)
    })
  })

  describe('getHealth', () => {
    it('delegates to checkHealth', async () => {
      const healthData = { status: 'healthy', version: '0.1.0', uptimeSeconds: 10 }
      mockCheckHealthHttp.mockResolvedValue(healthData)

      const result = await docxBridgeService.getHealth()
      expect(result).toEqual(healthData)
    })
  })

  describe('getStatus', () => {
    it('returns process manager status', () => {
      mockProcessManager.getStatus.mockReturnValue({ ready: true, port: 9000, pid: 1234 })

      const status = docxBridgeService.getStatus()
      expect(status).toEqual({ ready: true, port: 9000, pid: 1234 })
    })
  })
})
