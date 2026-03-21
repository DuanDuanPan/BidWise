import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Mocks ───

const mockHandle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: { handle: (...args: unknown[]) => mockHandle(...args) },
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

const mockImportTender = vi.fn()
const mockGetTender = vi.fn()

vi.mock('@main/services/document-parser', () => ({
  tenderImportService: {
    importTender: (...args: unknown[]) => mockImportTender(...args),
    getTender: (...args: unknown[]) => mockGetTender(...args),
  },
}))

import { registerAnalysisHandlers } from '@main/ipc/analysis-handlers'

describe('analysis-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should register analysis:import-tender and analysis:get-tender handlers', () => {
    registerAnalysisHandlers()

    const channels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toContain('analysis:import-tender')
    expect(channels).toContain('analysis:get-tender')
  })

  it('analysis:import-tender dispatches to tenderImportService.importTender', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:import-tender'
    )?.[1]
    expect(handler).toBeDefined()

    const mockResult = { taskId: 'task-1' }
    mockImportTender.mockResolvedValue(mockResult)

    const result = await handler({}, { projectId: 'proj-1', filePath: '/test.pdf' })

    expect(result).toEqual({ success: true, data: mockResult })
    expect(mockImportTender).toHaveBeenCalledWith({ projectId: 'proj-1', filePath: '/test.pdf' })
  })

  it('analysis:get-tender dispatches to tenderImportService.getTender', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:get-tender'
    )?.[1]
    expect(handler).toBeDefined()

    const mockParsed = {
      meta: {},
      sections: [],
      rawText: '',
      totalPages: 5,
      hasScannedContent: false,
    }
    mockGetTender.mockResolvedValue(mockParsed)

    const result = await handler({}, { projectId: 'proj-1' })

    expect(result).toEqual({ success: true, data: mockParsed })
    expect(mockGetTender).toHaveBeenCalledWith('proj-1')
  })

  it('should wrap errors as ApiResponse error format', async () => {
    registerAnalysisHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'analysis:import-tender'
    )?.[1]

    const { BidWiseError } = await import('@main/utils/errors')
    mockImportTender.mockRejectedValue(new BidWiseError('TENDER_IMPORT', '文件不存在'))

    const result = await handler({}, { projectId: 'proj-1', filePath: '/bad.pdf' })

    expect(result).toEqual({
      success: false,
      error: { code: 'TENDER_IMPORT', message: '文件不存在' },
    })
  })
})
