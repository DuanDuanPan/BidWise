import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/mock-user-data'),
    getAppPath: vi.fn(() => '/mock-app-path'),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockAttributeSources = vi.fn()
const mockValidateBaseline = vi.fn()
const mockGetAttributions = vi.fn()

vi.mock('@main/services/source-attribution-service', () => ({
  sourceAttributionService: {
    attributeSources: (...args: unknown[]) => mockAttributeSources(...args),
    validateBaseline: (...args: unknown[]) => mockValidateBaseline(...args),
    getAttributions: (...args: unknown[]) => mockGetAttributions(...args),
  },
}))

import { ipcMain } from 'electron'

describe('@story-3-5 source-attribution IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('@p0 should register all three source:* channels', async () => {
    const { registerSourceAttributionHandlers } =
      await import('@main/ipc/source-attribution-handlers')
    registerSourceAttributionHandlers()

    const registeredChannels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (call: unknown[]) => call[0]
    )
    expect(registeredChannels).toContain('source:attribute')
    expect(registeredChannels).toContain('source:validate-baseline')
    expect(registeredChannels).toContain('source:get-attributions')
  })
})
