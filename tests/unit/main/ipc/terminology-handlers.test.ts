import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

const mockList = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockBatchCreate = vi.hoisted(() => vi.fn())
const mockExportToFile = vi.hoisted(() => vi.fn())

vi.mock('@main/services/terminology-service', () => ({
  terminologyService: {
    list: mockList,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
    batchCreate: mockBatchCreate,
    exportToFile: mockExportToFile,
  },
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { BidWiseError }
})

vi.mock('@shared/constants', () => ({
  ErrorCode: { UNKNOWN: 'UNKNOWN', DUPLICATE: 'DUPLICATE' },
}))

import { registerTerminologyHandlers } from '@main/ipc/terminology-handlers'
import { BidWiseError } from '@main/utils/errors'

describe('terminology-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 6 terminology channels', () => {
    registerTerminologyHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('terminology:list')
    expect(registeredChannels).toContain('terminology:create')
    expect(registeredChannels).toContain('terminology:update')
    expect(registeredChannels).toContain('terminology:delete')
    expect(registeredChannels).toContain('terminology:batch-create')
    expect(registeredChannels).toContain('terminology:export')
    expect(registeredChannels).toHaveLength(6)
  })

  it('terminology:list handler wraps response in success envelope', async () => {
    const entries = [{ id: 't1', sourceTerm: 'A', targetTerm: 'B' }]
    mockList.mockResolvedValue(entries)
    registerTerminologyHandlers()

    const listHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'terminology:list'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await listHandler({}, undefined)

    expect(result).toEqual({ success: true, data: entries })
  })

  it('wraps BidWiseError into failure envelope with code and message', async () => {
    mockCreate.mockRejectedValue(new BidWiseError('DUPLICATE', '该术语已存在'))
    registerTerminologyHandlers()

    const createHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'terminology:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await createHandler(
      {},
      { sourceTerm: 'A', targetTerm: 'B' }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'DUPLICATE', message: '该术语已存在' },
    })
  })

  it('wraps unknown Error with UNKNOWN code', async () => {
    mockCreate.mockRejectedValue(new Error('unexpected failure'))
    registerTerminologyHandlers()

    const createHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'terminology:create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await createHandler(
      {},
      { sourceTerm: 'X', targetTerm: 'Y' }
    )

    expect(result).toEqual({
      success: false,
      error: { code: 'UNKNOWN', message: 'unexpected failure' },
    })
  })

  it('terminology:batch-create passes input.entries to batchCreate', async () => {
    const batchResult = { created: 2, duplicates: [] }
    mockBatchCreate.mockResolvedValue(batchResult)
    registerTerminologyHandlers()

    const batchHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'terminology:batch-create'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const entries = [
      { sourceTerm: 'A', targetTerm: 'B' },
      { sourceTerm: 'C', targetTerm: 'D' },
    ]
    const result = await batchHandler({}, { entries })

    expect(mockBatchCreate).toHaveBeenCalledWith(entries)
    expect(result).toEqual({ success: true, data: batchResult })
  })

  it('terminology:export passes no args to exportToFile', async () => {
    const exportResult = { cancelled: false, outputPath: '/tmp/out.json', entryCount: 5 }
    mockExportToFile.mockResolvedValue(exportResult)
    registerTerminologyHandlers()

    const exportHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'terminology:export'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await exportHandler({}, undefined)

    expect(mockExportToFile).toHaveBeenCalledWith()
    expect(result).toEqual({ success: true, data: exportResult })
  })
})
