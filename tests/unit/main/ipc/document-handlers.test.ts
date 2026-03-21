import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockHandle = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()

const mockCreateIpcHandler = vi.fn()
const mockDocumentService = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  getMetadata: vi.fn(),
  saveSync: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]) => mockHandle(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}))

vi.mock('@main/ipc/create-handler', () => ({
  createIpcHandler: (...args: unknown[]) => mockCreateIpcHandler(...args),
}))

vi.mock('@main/services/document-service', () => ({
  documentService: mockDocumentService,
}))

vi.mock('@main/utils/errors', () => ({
  BidWiseError: class BidWiseError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
    }
  },
}))

import { registerDocumentHandlers } from '@main/ipc/document-handlers'

describe('document-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers async document channels plus the sync save listener', () => {
    registerDocumentHandlers()

    expect(mockCreateIpcHandler).toHaveBeenCalledTimes(3)
    expect(mockOn).toHaveBeenCalledWith('document:save-sync', expect.any(Function))
  })

  it('removes the previous sync listener before re-registering to avoid HMR duplication', () => {
    registerDocumentHandlers()
    const firstListener = mockOn.mock.calls[0]?.[1]

    registerDocumentHandlers()

    expect(mockRemoveListener).toHaveBeenCalledWith('document:save-sync', firstListener)
    expect(mockOn).toHaveBeenCalledTimes(2)
  })

  it('dispatches document:save-sync to documentService.saveSync', () => {
    mockDocumentService.saveSync.mockReturnValue({ lastSavedAt: '2026-03-22T00:00:00.000Z' })

    registerDocumentHandlers()

    const syncHandler = mockOn.mock.calls[0]?.[1] as (
      event: { returnValue?: unknown },
      input: { projectId: string; rootPath: string; content: string }
    ) => void
    const event = {}

    syncHandler(event, {
      projectId: 'proj-1',
      rootPath: '/tmp/bidwise-test/data/projects/proj-1',
      content: '# Sync',
    })

    expect(mockDocumentService.saveSync).toHaveBeenCalledWith(
      'proj-1',
      '/tmp/bidwise-test/data/projects/proj-1',
      '# Sync'
    )
    expect(event.returnValue).toEqual({
      success: true,
      data: { lastSavedAt: '2026-03-22T00:00:00.000Z' },
    })
  })

  it('wraps BidWiseError failures for sync saves', async () => {
    const { BidWiseError } = await import('@main/utils/errors')
    mockDocumentService.saveSync.mockImplementation(() => {
      throw new BidWiseError('VALIDATION', '非法项目目录路径')
    })

    registerDocumentHandlers()

    const syncHandler = mockOn.mock.calls[0]?.[1] as (
      event: { returnValue?: unknown },
      input: { projectId: string; rootPath: string; content: string }
    ) => void
    const event = {}

    syncHandler(event, {
      projectId: 'proj-1',
      rootPath: '/tmp/evil',
      content: '# Sync',
    })

    expect(event.returnValue).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: '非法项目目录路径' },
    })
  })
})
