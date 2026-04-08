import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'

const mockDocxBridgeService = vi.hoisted(() => ({
  renderDocx: vi.fn(),
  getHealth: vi.fn(),
  getStatus: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
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

vi.mock('@main/services/docx-bridge', () => ({
  docxBridgeService: mockDocxBridgeService,
}))

import { registerDocxBridgeHandlers } from '@main/ipc/docx-bridge-handlers'

describe('registerDocxBridgeHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers both docx IPC channels', () => {
    registerDocxBridgeHandlers()

    const registeredChannels = (ipcMain.handle as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toContain('docx:render')
    expect(registeredChannels).toContain('docx:health')
    expect(registeredChannels).toHaveLength(2)
  })

  it('dispatches docx:render to docxBridgeService.renderDocx', async () => {
    const mockResult = { outputPath: '/tmp/out.docx', renderTimeMs: 55 }
    mockDocxBridgeService.renderDocx.mockResolvedValue(mockResult)

    registerDocxBridgeHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'docx:render'
    )?.[1]

    const input = {
      markdownContent: '# Test',
      outputPath: 'output.docx',
      projectId: 'proj-1',
    }
    const result = await callback({}, input)

    expect(mockDocxBridgeService.renderDocx).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches docx:health to docxBridgeService.getHealth', async () => {
    const mockHealth = { status: 'healthy', version: '0.1.0', uptimeSeconds: 60 }
    mockDocxBridgeService.getHealth.mockResolvedValue(mockHealth)

    registerDocxBridgeHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'docx:health'
    )?.[1]

    const result = await callback({})

    expect(mockDocxBridgeService.getHealth).toHaveBeenCalled()
    expect(result).toEqual({ success: true, data: mockHealth })
  })

  it('wraps service errors in error response format', async () => {
    const { DocxBridgeError } = await import('@main/utils/errors')
    mockDocxBridgeService.renderDocx.mockRejectedValue(
      new DocxBridgeError('DOCX_BRIDGE_UNAVAILABLE', '渲染引擎未就绪')
    )

    registerDocxBridgeHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'docx:render'
    )?.[1]

    const result = await callback({}, { markdownContent: '', outputPath: '', projectId: '' })

    expect(result).toEqual({
      success: false,
      error: { code: 'DOCX_BRIDGE_UNAVAILABLE', message: '渲染引擎未就绪' },
    })
  })
})
