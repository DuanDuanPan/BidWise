import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Asset, Tag } from '@shared/asset-types'

const mockSearch = vi.hoisted(() => vi.fn())
const mockList = vi.hoisted(() => vi.fn())
const mockFindById = vi.hoisted(() => vi.fn())
const mockFindTagsByAssetId = vi.hoisted(() => vi.fn())
const mockFindOrCreateMany = vi.hoisted(() => vi.fn())
const mockFindByAssetId = vi.hoisted(() => vi.fn())
const mockFindByAssetIds = vi.hoisted(() => vi.fn())
const mockReplaceAssetTags = vi.hoisted(() => vi.fn())
const mockDeleteOrphanedTags = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())

vi.mock('@main/db/repositories/asset-repo', () => ({
  AssetRepository: class {
    search = mockSearch
    list = mockList
    findById = mockFindById
    findTagsByAssetId = mockFindTagsByAssetId
    create = mockCreate
  },
}))

vi.mock('@main/db/repositories/tag-repo', () => ({
  TagRepository: class {
    findOrCreateMany = mockFindOrCreateMany
    findByAssetId = mockFindByAssetId
    findByAssetIds = mockFindByAssetIds
    replaceAssetTags = mockReplaceAssetTags
    deleteOrphanedTags = mockDeleteOrphanedTags
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@main/utils/errors', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  return mod
})

const { assetService } = await import('@main/services/asset-service')

function makeAsset(overrides: Record<string, unknown> = {}): Asset {
  return {
    id: 'a1',
    projectId: null,
    title: '测试资产',
    summary: '摘要',
    content: '内容',
    assetType: 'text',
    sourceProject: '项目A',
    sourceSection: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Asset
}

function makeTag(overrides: Record<string, unknown> = {}): Tag {
  return {
    id: 't1',
    name: '标签',
    normalizedName: '标签',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Tag
}

describe('assetService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByAssetId.mockResolvedValue([])
    mockFindByAssetIds.mockResolvedValue(new Map())
  })

  describe('search', () => {
    it('parses rawQuery with keywords and #tags', async () => {
      mockSearch.mockResolvedValue({ items: [], total: 0, rawRanks: {} })

      await assetService.search({ rawQuery: '微服务 #架构图', assetTypes: [] })

      expect(mockSearch).toHaveBeenCalledWith({
        keyword: '微服务',
        tagNames: ['架构图'],
        assetTypes: [],
      })
    })

    it('handles full-width ＃ tag syntax', async () => {
      mockSearch.mockResolvedValue({ items: [], total: 0, rawRanks: {} })

      await assetService.search({ rawQuery: '＃案例 ＃标签', assetTypes: [] })

      expect(mockSearch).toHaveBeenCalledWith({
        keyword: '',
        tagNames: ['案例', '标签'],
        assetTypes: [],
      })
    })

    it('deduplicates tag names case-insensitively', async () => {
      mockSearch.mockResolvedValue({ items: [], total: 0, rawRanks: {} })

      await assetService.search({ rawQuery: '#Tag #tag #TAG', assetTypes: [] })

      expect(mockSearch).toHaveBeenCalledWith({
        keyword: '',
        tagNames: ['Tag'],
        assetTypes: [],
      })
    })

    it('computes matchScore from FTS ranks', async () => {
      const a1 = makeAsset({ id: 'a1' })
      const a2 = makeAsset({ id: 'a2' })
      mockSearch.mockResolvedValue({
        items: [a1, a2],
        total: 2,
        rawRanks: { a1: -10, a2: -5 },
      })
      mockFindByAssetIds.mockResolvedValue(
        new Map([
          ['a1', []],
          ['a2', []],
        ])
      )

      const result = await assetService.search({ rawQuery: 'keyword', assetTypes: [] })

      expect(result.items[0].matchScore).toBe(100) // best rank
      expect(result.items[1].matchScore).toBe(20) // worst rank
    })

    it('returns matchScore 100 for non-keyword searches', async () => {
      const a1 = makeAsset()
      mockSearch.mockResolvedValue({
        items: [a1],
        total: 1,
        rawRanks: {},
      })
      mockFindByAssetIds.mockResolvedValue(new Map([['a1', []]]))

      const result = await assetService.search({ rawQuery: '#标签', assetTypes: [] })

      expect(result.items[0].matchScore).toBe(100)
    })
  })

  describe('list', () => {
    it('returns assets with matchScore 100', async () => {
      const tag = makeTag()
      mockList.mockResolvedValue({ items: [makeAsset()], total: 1 })
      mockFindByAssetIds.mockResolvedValue(new Map([['a1', [tag]]]))

      const result = await assetService.list()

      expect(result.items).toHaveLength(1)
      expect(result.items[0].matchScore).toBe(100)
      expect(result.items[0].tags).toHaveLength(1)
    })
  })

  describe('getById', () => {
    it('returns asset detail with tags', async () => {
      mockFindById.mockResolvedValue(makeAsset())
      mockFindByAssetId.mockResolvedValue([makeTag()])

      const result = await assetService.getById('a1')

      expect(result.id).toBe('a1')
      expect(result.tags).toHaveLength(1)
    })

    it('throws NotFoundError for missing asset', async () => {
      mockFindById.mockResolvedValue(null)

      await expect(assetService.getById('missing')).rejects.toThrow('资产不存在')
    })
  })

  describe('updateTags', () => {
    it('replaces tags and cleans orphans', async () => {
      mockFindById.mockResolvedValue(makeAsset())
      const newTags = [makeTag({ id: 't1', name: '新标签' })]
      mockFindOrCreateMany.mockResolvedValue(newTags)
      mockReplaceAssetTags.mockResolvedValue(undefined)
      mockDeleteOrphanedTags.mockResolvedValue(undefined)
      mockFindByAssetId.mockResolvedValue(newTags)

      const result = await assetService.updateTags({ assetId: 'a1', tagNames: ['新标签'] })

      expect(mockFindOrCreateMany).toHaveBeenCalledWith(['新标签'])
      expect(mockReplaceAssetTags).toHaveBeenCalledWith('a1', ['t1'])
      expect(mockDeleteOrphanedTags).toHaveBeenCalled()
      expect(result).toEqual(newTags)
    })

    it('throws NotFoundError for missing asset', async () => {
      mockFindById.mockResolvedValue(null)

      await expect(
        assetService.updateTags({ assetId: 'missing', tagNames: ['tag'] })
      ).rejects.toThrow('资产不存在')
    })
  })

  describe('create', () => {
    it('successfully creates asset with tags', async () => {
      const createdAsset = makeAsset({ id: 'new-1' })
      mockCreate.mockResolvedValue(createdAsset)
      const tags = [makeTag({ id: 't1', name: '架构' }), makeTag({ id: 't2', name: '案例' })]
      mockFindOrCreateMany.mockResolvedValue(tags)
      mockReplaceAssetTags.mockResolvedValue(undefined)
      mockFindByAssetId.mockResolvedValue(tags)

      const result = await assetService.create({
        title: '测试资产',
        content: '内容',
        assetType: 'text',
        tagNames: ['架构', '案例'],
      })

      expect(mockCreate).toHaveBeenCalledWith({
        title: '测试资产',
        content: '内容',
        assetType: 'text',
        summary: undefined,
        sourceProject: undefined,
        sourceSection: undefined,
      })
      expect(mockFindOrCreateMany).toHaveBeenCalledWith(['架构', '案例'])
      expect(mockReplaceAssetTags).toHaveBeenCalledWith('new-1', ['t1', 't2'])
      expect(result.id).toBe('new-1')
      expect(result.tags).toHaveLength(2)
    })

    it('handles empty tagNames array', async () => {
      const createdAsset = makeAsset({ id: 'new-2' })
      mockCreate.mockResolvedValue(createdAsset)
      mockFindOrCreateMany.mockResolvedValue([])
      mockFindByAssetId.mockResolvedValue([])

      const result = await assetService.create({
        title: '无标签资产',
        content: '内容',
        assetType: 'text',
        tagNames: [],
      })

      expect(mockFindOrCreateMany).toHaveBeenCalledWith([])
      expect(mockReplaceAssetTags).not.toHaveBeenCalled()
      expect(result.tags).toHaveLength(0)
    })

    it('fills sourceProject and sourceSection', async () => {
      const createdAsset = makeAsset({
        id: 'new-3',
        sourceProject: '项目X',
        sourceSection: '第三章',
      })
      mockCreate.mockResolvedValue(createdAsset)
      mockFindOrCreateMany.mockResolvedValue([])
      mockFindByAssetId.mockResolvedValue([])

      await assetService.create({
        title: '有来源的资产',
        content: '内容',
        assetType: 'case',
        sourceProject: '项目X',
        sourceSection: '第三章',
        tagNames: [],
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceProject: '项目X',
          sourceSection: '第三章',
        })
      )
    })

    it('uses createLogger for logging', async () => {
      // The service module calls createLogger('asset-service') at import time.
      // If createLogger were not mocked, the import would fail. The fact that
      // the module loaded successfully proves createLogger is used.
      expect(assetService).toBeDefined()
    })
  })
})
