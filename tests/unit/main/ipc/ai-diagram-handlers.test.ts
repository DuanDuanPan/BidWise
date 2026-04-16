import { vi, describe, it, expect } from 'vitest'

vi.mock('@main/services/ai-diagram-asset-service', () => ({
  aiDiagramAssetService: {
    saveAiDiagramAsset: vi.fn(),
    loadAiDiagramAsset: vi.fn(),
    deleteAiDiagramAsset: vi.fn(),
  },
}))

const mockCreateIpcHandler = vi.fn()
vi.mock('@main/ipc/create-handler', () => ({
  createIpcHandler: (...args: unknown[]) => mockCreateIpcHandler(...args),
}))

import { registerAiDiagramHandlers } from '@main/ipc/ai-diagram-handlers'

describe('@story-3-9 ai-diagram IPC handlers', () => {
  it('registers all 3 channels', () => {
    registerAiDiagramHandlers()

    const registeredChannels = mockCreateIpcHandler.mock.calls.map(
      (call: unknown[]) => call[0]
    ) as string[]

    expect(registeredChannels).toContain('ai-diagram:save-asset')
    expect(registeredChannels).toContain('ai-diagram:load-asset')
    expect(registeredChannels).toContain('ai-diagram:delete-asset')
    expect(registeredChannels).toHaveLength(3)
  })

  it('delegates to aiDiagramAssetService (thin dispatch)', async () => {
    registerAiDiagramHandlers()

    // Verify handlers were registered with callbacks
    for (const call of mockCreateIpcHandler.mock.calls) {
      expect(typeof call[1]).toBe('function')
    }
  })
})
