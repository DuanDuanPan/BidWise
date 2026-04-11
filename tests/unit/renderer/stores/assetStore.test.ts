import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAssetSearch = vi.fn()
const mockAssetList = vi.fn()
const mockAssetGet = vi.fn()
const mockAssetUpdateTags = vi.fn()

vi.stubGlobal('api', {
  assetSearch: mockAssetSearch,
  assetList: mockAssetList,
  assetGet: mockAssetGet,
  assetUpdateTags: mockAssetUpdateTags,
})

// Workaround: stub window.api for renderer tests
Object.defineProperty(window, 'api', {
  value: {
    assetSearch: mockAssetSearch,
    assetList: mockAssetList,
    assetGet: mockAssetGet,
    assetUpdateTags: mockAssetUpdateTags,
  },
  writable: true,
})

function makeSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    title: '测试资产',
    summary: '摘要',
    assetType: 'text' as const,
    sourceProject: null,
    tags: [],
    matchScore: 100,
    ...overrides,
  }
}

function makeDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    projectId: null,
    title: '测试资产',
    summary: '摘要',
    content: '正文内容',
    assetType: 'text' as const,
    sourceProject: null,
    sourceSection: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    ...overrides,
  }
}

describe('assetStore', () => {
  let useAssetStore: typeof import('@renderer/stores/assetStore').useAssetStore

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const mod = await import('@renderer/stores/assetStore')
    useAssetStore = mod.useAssetStore
  })

  it('loadInitialAssets sets results on success', async () => {
    const items = [makeSearchResult()]
    mockAssetList.mockResolvedValue({ success: true, data: { items, total: 1 } })

    await useAssetStore.getState().loadInitialAssets()

    const state = useAssetStore.getState()
    expect(state.results).toHaveLength(1)
    expect(state.total).toBe(1)
    expect(state.loading).toBe(false)
  })

  it('loadInitialAssets sets error on failure', async () => {
    mockAssetList.mockResolvedValue({
      success: false,
      error: { code: 'DB', message: '数据库错误' },
    })

    await useAssetStore.getState().loadInitialAssets()

    expect(useAssetStore.getState().error).toBe('数据库错误')
    expect(useAssetStore.getState().loading).toBe(false)
  })

  it('search calls assetSearch and sets results', async () => {
    const items = [makeSearchResult()]
    mockAssetSearch.mockResolvedValue({ success: true, data: { items, total: 1 } })

    useAssetStore.setState({ rawQuery: '微服务 #架构图', assetTypes: [] })
    await useAssetStore.getState().search('微服务 #架构图')

    expect(mockAssetSearch).toHaveBeenCalledWith({
      rawQuery: '微服务 #架构图',
      assetTypes: [],
    })
    const state = useAssetStore.getState()
    expect(state.results).toHaveLength(1)
    expect(state.selectedAssetId).toBeNull()
  })

  it('search with empty query and no filters calls assetList', async () => {
    mockAssetList.mockResolvedValue({
      success: true,
      data: { items: [], total: 0 },
    })

    await useAssetStore.getState().search('')

    expect(mockAssetList).toHaveBeenCalled()
  })

  it('toggleAssetType adds and removes types', () => {
    const { toggleAssetType } = useAssetStore.getState()

    toggleAssetType('diagram')
    expect(useAssetStore.getState().assetTypes).toEqual(['diagram'])

    toggleAssetType('text')
    expect(useAssetStore.getState().assetTypes).toEqual(['diagram', 'text'])

    toggleAssetType('diagram')
    expect(useAssetStore.getState().assetTypes).toEqual(['text'])
  })

  it('resetAssetTypes clears all types and selection', () => {
    useAssetStore.setState({ assetTypes: ['text', 'diagram'], selectedAssetId: 'a1' })

    useAssetStore.getState().resetAssetTypes()

    const state = useAssetStore.getState()
    expect(state.assetTypes).toEqual([])
    expect(state.selectedAssetId).toBeNull()
  })

  it('selectAsset loads asset detail', async () => {
    const detail = makeDetail()
    mockAssetGet.mockResolvedValue({ success: true, data: detail })

    await useAssetStore.getState().selectAsset('a1')

    const state = useAssetStore.getState()
    expect(state.selectedAssetId).toBe('a1')
    expect(state.selectedAsset).toEqual(detail)
  })

  it('selectAsset(null) clears selection', async () => {
    useAssetStore.setState({ selectedAssetId: 'a1', selectedAsset: makeDetail() })

    await useAssetStore.getState().selectAsset(null)

    expect(useAssetStore.getState().selectedAssetId).toBeNull()
    expect(useAssetStore.getState().selectedAsset).toBeNull()
  })

  it('updateAssetTags refreshes tags in results', async () => {
    const newTags = [{ id: 't1', name: '新标签', normalizedName: '新标签', createdAt: '' }]
    mockAssetUpdateTags.mockResolvedValue({ success: true, data: newTags })

    useAssetStore.setState({
      results: [makeSearchResult({ id: 'a1' })],
      selectedAssetId: null,
    })

    await useAssetStore.getState().updateAssetTags({ assetId: 'a1', tagNames: ['新标签'] })

    expect(useAssetStore.getState().results[0].tags).toEqual(newTags)
  })

  it('clearError resets error to null', () => {
    useAssetStore.setState({ error: 'some error' })

    useAssetStore.getState().clearError()

    expect(useAssetStore.getState().error).toBeNull()
  })
})
