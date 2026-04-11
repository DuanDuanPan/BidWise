import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => vi.fn())
const mockList = vi.hoisted(() => vi.fn())
const mockGetById = vi.hoisted(() => vi.fn())
const mockUpdateTags = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

vi.mock('@main/services/asset-service', () => ({
  assetService: {
    search: mockSearch,
    list: mockList,
    getById: mockGetById,
    updateTags: mockUpdateTags,
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
  ErrorCode: { UNKNOWN: 'UNKNOWN' },
}))

import { registerAssetHandlers } from '@main/ipc/asset-handlers'

describe('asset-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all four asset channels', () => {
    registerAssetHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('asset:search')
    expect(registeredChannels).toContain('asset:list')
    expect(registeredChannels).toContain('asset:get')
    expect(registeredChannels).toContain('asset:update-tags')
    expect(registeredChannels).toHaveLength(4)
  })

  it('asset:search handler wraps response in success envelope', async () => {
    const searchResult = { items: [], total: 0 }
    mockSearch.mockResolvedValue(searchResult)
    registerAssetHandlers()

    const searchHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'asset:search'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await searchHandler({}, { rawQuery: '微服务', assetTypes: [] })
    expect(result).toEqual({ success: true, data: searchResult })
  })

  it('asset:search handler wraps error in failure envelope', async () => {
    mockSearch.mockRejectedValue(new Error('search failed'))
    registerAssetHandlers()

    const searchHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'asset:search'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await searchHandler({}, { rawQuery: 'test', assetTypes: [] })
    expect(result).toEqual({
      success: false,
      error: { code: 'UNKNOWN', message: 'search failed' },
    })
  })

  it('asset:get handler passes id from input', async () => {
    mockGetById.mockResolvedValue({ id: 'a1' })
    registerAssetHandlers()

    const getHandler = mockHandle.mock.calls.find((c: unknown[]) => c[0] === 'asset:get')?.[1] as (
      ...args: unknown[]
    ) => Promise<unknown>

    await getHandler({}, { id: 'a1' })
    expect(mockGetById).toHaveBeenCalledWith('a1')
  })

  it('asset:update-tags handler calls updateTags', async () => {
    const tags = [{ id: 't1', name: 'tag' }]
    mockUpdateTags.mockResolvedValue(tags)
    registerAssetHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'asset:update-tags'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { assetId: 'a1', tagNames: ['tag'] })
    expect(result).toEqual({ success: true, data: tags })
  })
})
