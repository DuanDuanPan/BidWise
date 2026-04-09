import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockGetStatus = vi.fn()

vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock/app' },
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
  processManager: {
    getStatus: () => mockGetStatus(),
    startProcess: vi.fn(),
    stopProcess: vi.fn(),
    restartProcess: vi.fn(),
    startHealthCheck: vi.fn(),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { renderDocx, checkHealth } from '@main/services/docx-bridge/render-client'

describe('render-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetStatus.mockReturnValue({ ready: true, port: 9000, pid: 1234 })
  })

  describe('renderDocx', () => {
    it('sends POST request with camelCase payload to /api/render-documents', async () => {
      const mockResult = { outputPath: '/tmp/out.docx', renderTimeMs: 42.5 }
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      })

      const input = {
        markdownContent: '# Hello',
        outputPath: '/tmp/out.docx',
        projectId: 'proj-1',
      }
      const result = await renderDocx(input)

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9000/api/render-documents',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        })
      )
      expect(result).toEqual(mockResult)
    })

    it('aborts the HTTP request when the caller signal aborts', async () => {
      mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          )
        })
      })

      const controller = new AbortController()
      const promise = renderDocx(
        {
          markdownContent: '# Test',
          outputPath: '/tmp/out.docx',
          projectId: 'proj-1',
        },
        { signal: controller.signal }
      )

      controller.abort(new Error('preview cancelled'))

      await expect(promise).rejects.toThrow('渲染请求失败')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9000/api/render-documents',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('throws DocxBridgeError when Python returns error response', async () => {
      mockFetch.mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: false,
            error: { code: 'TEMPLATE_NOT_FOUND', message: 'not found' },
          }),
      })

      await expect(
        renderDocx({
          markdownContent: '# Test',
          outputPath: '/tmp/out.docx',
          templatePath: '/missing.docx',
          projectId: 'proj-1',
        })
      ).rejects.toThrow('not found')
    })

    it('throws DocxBridgeError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(
        renderDocx({
          markdownContent: '# Test',
          outputPath: '/tmp/out.docx',
          projectId: 'proj-1',
        })
      ).rejects.toThrow('渲染请求失败')
    })

    it('sends new fields (styleMapping/pageSetup/projectPath/warnings) in camelCase payload', async () => {
      const mockResult = {
        outputPath: '/tmp/out.docx',
        renderTimeMs: 42.5,
        warnings: ['样式不存在'],
      }
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockResult }),
      })

      const input = {
        markdownContent: '# Hello',
        outputPath: '/tmp/out.docx',
        projectId: 'proj-1',
        styleMapping: { heading1: '标题 1', bodyText: '正文' },
        pageSetup: { contentWidthMm: 150 },
        projectPath: '/tmp/project/data',
      }
      const result = await renderDocx(input)

      const sentBody = JSON.parse(
        (mockFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(sentBody.styleMapping).toEqual({ heading1: '标题 1', bodyText: '正文' })
      expect(sentBody.pageSetup).toEqual({ contentWidthMm: 150 })
      expect(sentBody.projectPath).toBe('/tmp/project/data')
      expect(result.warnings).toEqual(['样式不存在'])
    })

    it('throws DOCX_BRIDGE_UNAVAILABLE when engine not ready', async () => {
      mockGetStatus.mockReturnValue({ ready: false })

      await expect(
        renderDocx({
          markdownContent: '# Test',
          outputPath: '/tmp/out.docx',
          projectId: 'proj-1',
        })
      ).rejects.toThrow('渲染引擎未就绪')
    })
  })

  describe('checkHealth', () => {
    it('sends GET to /api/health and returns health data', async () => {
      const healthData = { status: 'healthy', version: '0.1.0', uptimeSeconds: 120.5 }
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: healthData }),
      })

      const result = await checkHealth()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9000/api/health',
        expect.objectContaining({ method: 'GET' })
      )
      expect(result).toEqual(healthData)
    })

    it('throws on health check failure', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'))

      await expect(checkHealth()).rejects.toThrow('健康检查请求失败')
    })
  })
})
