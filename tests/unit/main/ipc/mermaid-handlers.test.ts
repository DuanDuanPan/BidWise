import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { ipcMain } from 'electron'

const mockMermaidAssetService = vi.hoisted(() => ({
  saveMermaidAsset: vi.fn(),
  loadMermaidAsset: vi.fn(),
  deleteMermaidAsset: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

vi.mock('@main/services/mermaid-asset-service', () => ({
  mermaidAssetService: mockMermaidAssetService,
}))

import { registerMermaidHandlers } from '@main/ipc/mermaid-handlers'

describe('@story-3-8 registerMermaidHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 3 mermaid IPC channels', () => {
    registerMermaidHandlers()

    const registeredChannels = (ipcMain.handle as Mock).mock.calls.map((call: unknown[]) => call[0])
    expect(registeredChannels).toEqual([
      'mermaid:save-asset',
      'mermaid:load-asset',
      'mermaid:delete-asset',
    ])
  })

  it('dispatches mermaid:save-asset to mermaidAssetService.saveMermaidAsset', async () => {
    const mockResult = { assetPath: '/tmp/assets/mermaid-test.svg' }
    mockMermaidAssetService.saveMermaidAsset.mockResolvedValue(mockResult)

    registerMermaidHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'mermaid:save-asset'
    )?.[1]

    const input = {
      projectId: 'proj-1',
      diagramId: 'uuid-1',
      svgContent: '<svg>test</svg>',
      assetFileName: 'mermaid-abc123.svg',
    }
    const result = await callback({}, input)

    expect(mockMermaidAssetService.saveMermaidAsset).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: mockResult })
  })

  it('dispatches mermaid:delete-asset to mermaidAssetService.deleteMermaidAsset', async () => {
    mockMermaidAssetService.deleteMermaidAsset.mockResolvedValue(undefined)

    registerMermaidHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'mermaid:delete-asset'
    )?.[1]

    const input = { projectId: 'proj-1', assetFileName: 'mermaid-abc123.svg' }
    const result = await callback({}, input)

    expect(mockMermaidAssetService.deleteMermaidAsset).toHaveBeenCalledWith(input)
    expect(result).toEqual({ success: true, data: undefined })
  })

  it('wraps service errors in error response format', async () => {
    const { ValidationError } = await import('@main/utils/errors')
    mockMermaidAssetService.saveMermaidAsset.mockRejectedValue(
      new ValidationError('assetFileName must end with .svg')
    )

    registerMermaidHandlers()

    const callback = (ipcMain.handle as Mock).mock.calls.find(
      (call: unknown[]) => call[0] === 'mermaid:save-asset'
    )?.[1]

    const result = await callback(
      {},
      { projectId: '', diagramId: '', svgContent: '', assetFileName: 'bad.png' }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: 'assetFileName must end with .svg' },
    })
  })
})
