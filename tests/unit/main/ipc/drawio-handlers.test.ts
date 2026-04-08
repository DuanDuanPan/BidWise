import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'

const mockDrawioAssetService = vi.hoisted(() => ({
  saveDrawioAsset: vi.fn(),
  loadDrawioAsset: vi.fn(),
  deleteDrawioAsset: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('@main/services/drawio-asset-service', () => ({
  drawioAssetService: mockDrawioAssetService,
}))

import { registerDrawioHandlers } from '@main/ipc/drawio-handlers'

describe('registerDrawioHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 3 drawio IPC channels', () => {
    registerDrawioHandlers()

    const registeredChannels = (ipcMain.handle as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toEqual([
      'drawio:save-asset',
      'drawio:load-asset',
      'drawio:delete-asset',
    ])
  })

  it('dispatches drawio:save-asset to drawioAssetService.saveDrawioAsset', async () => {
    const mockResult = {
      assetPath: '/tmp/assets/diagram.drawio',
      pngPath: '/tmp/assets/diagram.png',
    }
    mockDrawioAssetService.saveDrawioAsset.mockResolvedValue(mockResult)

    registerDrawioHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'drawio:save-asset'
    )?.[1]

    const input = {
      projectId: 'proj-1',
      diagramId: 'uuid-1',
      xml: '<xml/>',
      pngBase64: 'iVBOR...',
      fileName: 'diagram-abc.drawio',
    }
    const result = await callback({}, input)

    expect(mockDrawioAssetService.saveDrawioAsset).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches drawio:load-asset to drawioAssetService.loadDrawioAsset', async () => {
    const mockResult = { xml: '<xml/>', pngDataUrl: 'data:image/png;base64,abc' }
    mockDrawioAssetService.loadDrawioAsset.mockResolvedValue(mockResult)

    registerDrawioHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'drawio:load-asset'
    )?.[1]

    const input = { projectId: 'proj-1', fileName: 'diagram-abc.drawio' }
    const result = await callback({}, input)

    expect(mockDrawioAssetService.loadDrawioAsset).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches drawio:delete-asset to drawioAssetService.deleteDrawioAsset', async () => {
    mockDrawioAssetService.deleteDrawioAsset.mockResolvedValue(undefined)

    registerDrawioHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'drawio:delete-asset'
    )?.[1]

    const input = { projectId: 'proj-1', fileName: 'diagram-abc.drawio' }
    const result = await callback({}, input)

    expect(mockDrawioAssetService.deleteDrawioAsset).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('wraps service errors in error response format', async () => {
    const { ValidationError } = await import('@main/utils/errors')
    mockDrawioAssetService.saveDrawioAsset.mockRejectedValue(
      new ValidationError('项目 ID 不能为空')
    )

    registerDrawioHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'drawio:save-asset'
    )?.[1]

    const result = await callback(
      {},
      { projectId: '', diagramId: '', xml: '', pngBase64: '', fileName: '' }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: '项目 ID 不能为空' },
    })
  })
})
