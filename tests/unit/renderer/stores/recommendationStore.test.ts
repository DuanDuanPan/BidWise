import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  RecommendationContext,
  AssetRecommendation,
  RecommendationResult,
} from '@shared/recommendation-types'

const mockAssetRecommend = vi.fn()

function stubApi(): void {
  vi.stubGlobal('api', { assetRecommend: mockAssetRecommend })
  Object.defineProperty(window, 'api', {
    value: { assetRecommend: mockAssetRecommend },
    writable: true,
  })
}

function makeContext(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    sectionKey: 'sec-1',
    sectionTitle: '系统架构',
    sectionContent: '本章介绍系统架构设计...',
    projectId: 'proj-1',
    ...overrides,
  }
}

function makeRecommendation(overrides: Partial<AssetRecommendation> = {}): AssetRecommendation {
  return {
    assetId: 'asset-1',
    title: '微服务架构方案',
    summary: '一套成熟的微服务架构设计方案',
    assetType: 'text',
    tags: [
      { id: 't1', name: '架构', normalizedName: '架构', createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    matchScore: 85,
    sourceProject: null,
    ...overrides,
  }
}

function makeResult(
  sectionKey: string,
  recommendations: AssetRecommendation[]
): RecommendationResult {
  return { sectionKey, recommendations }
}

describe('recommendationStore', () => {
  let useRecommendationStore: typeof import('@renderer/stores/recommendationStore').useRecommendationStore

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    stubApi()
    const mod = await import('@renderer/stores/recommendationStore')
    useRecommendationStore = mod.useRecommendationStore
    // Ensure a clean section context for most tests
    useRecommendationStore.getState().clearForSection('sec-1')
  })

  // --- fetchRecommendations ---

  it('fetchRecommendations sets loading then stores results on success', async () => {
    const recs = [makeRecommendation()]
    mockAssetRecommend.mockResolvedValue({
      success: true,
      data: makeResult('sec-1', recs),
    })

    const promise = useRecommendationStore.getState().fetchRecommendations(makeContext())
    expect(useRecommendationStore.getState().loading).toBe(true)

    await promise

    const state = useRecommendationStore.getState()
    expect(state.loading).toBe(false)
    expect(state.recommendations).toHaveLength(1)
    expect(state.recommendations[0].assetId).toBe('asset-1')
    expect(state.error).toBeNull()
  })

  it('fetchRecommendations filters out ignored assets from response', async () => {
    const recs = [
      makeRecommendation({ assetId: 'a1' }),
      makeRecommendation({ assetId: 'a2' }),
      makeRecommendation({ assetId: 'a3' }),
    ]
    mockAssetRecommend.mockResolvedValue({
      success: true,
      data: makeResult('sec-1', recs),
    })

    // Pre-ignore a2
    useRecommendationStore.getState().ignoreRecommendation('a2')

    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    const ids = useRecommendationStore.getState().recommendations.map((r) => r.assetId)
    expect(ids).toEqual(['a1', 'a3'])
    expect(ids).not.toContain('a2')
  })

  it('fetchRecommendations discards stale responses (nonce check)', async () => {
    // First call: slow
    let resolveFirst!: (value: unknown) => void
    const slowPromise = new Promise((resolve) => {
      resolveFirst = resolve
    })
    mockAssetRecommend.mockReturnValueOnce(slowPromise)

    // Second call: fast
    const fastRecs = [makeRecommendation({ assetId: 'fast' })]
    mockAssetRecommend.mockResolvedValueOnce({
      success: true,
      data: makeResult('sec-1', fastRecs),
    })

    // Fire first request
    const p1 = useRecommendationStore.getState().fetchRecommendations(makeContext())

    // Fire second request (increments nonce)
    const p2 = useRecommendationStore.getState().fetchRecommendations(makeContext())
    await p2

    // Now resolve the first one
    resolveFirst({
      success: true,
      data: makeResult('sec-1', [makeRecommendation({ assetId: 'stale' })]),
    })
    await p1

    // Should only have the fast result, stale is discarded
    const ids = useRecommendationStore.getState().recommendations.map((r) => r.assetId)
    expect(ids).toEqual(['fast'])
  })

  it('fetchRecommendations sets error on API failure response', async () => {
    mockAssetRecommend.mockResolvedValue({
      success: false,
      error: { code: 'AI_ERROR', message: '推荐服务异常' },
    })

    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    const state = useRecommendationStore.getState()
    expect(state.error).toBe('推荐服务异常')
    expect(state.loading).toBe(false)
  })

  it('fetchRecommendations sets error on exception', async () => {
    mockAssetRecommend.mockRejectedValue(new Error('网络超时'))

    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    const state = useRecommendationStore.getState()
    expect(state.error).toBe('网络超时')
    expect(state.loading).toBe(false)
  })

  // --- ignoreRecommendation ---

  it('ignoreRecommendation removes from list and adds to ignoredAssetIds', async () => {
    const recs = [makeRecommendation({ assetId: 'a1' }), makeRecommendation({ assetId: 'a2' })]
    mockAssetRecommend.mockResolvedValue({
      success: true,
      data: makeResult('sec-1', recs),
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    useRecommendationStore.getState().ignoreRecommendation('a1')

    const state = useRecommendationStore.getState()
    expect(state.recommendations.map((r) => r.assetId)).toEqual(['a2'])
    expect(state.ignoredAssetIds.has('a1')).toBe(true)
  })

  // --- acceptRecommendation ---

  it('acceptRecommendation adds to acceptedAssetIds and keeps in list', async () => {
    const recs = [makeRecommendation({ assetId: 'a1' })]
    mockAssetRecommend.mockResolvedValue({
      success: true,
      data: makeResult('sec-1', recs),
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    useRecommendationStore.getState().acceptRecommendation('a1')

    const state = useRecommendationStore.getState()
    expect(state.acceptedAssetIds.has('a1')).toBe(true)
    expect(state.recommendations).toHaveLength(1) // still in list
  })

  // --- clearForSection ---

  it('clearForSection resets all state for new section', async () => {
    const recs = [makeRecommendation({ assetId: 'a1' })]
    mockAssetRecommend.mockResolvedValue({
      success: true,
      data: makeResult('sec-1', recs),
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())
    useRecommendationStore.getState().ignoreRecommendation('a1')
    useRecommendationStore.getState().acceptRecommendation('a1')

    useRecommendationStore.getState().clearForSection('sec-2')

    const state = useRecommendationStore.getState()
    expect(state.currentSectionKey).toBe('sec-2')
    expect(state.recommendations).toEqual([])
    expect(state.ignoredAssetIds.size).toBe(0)
    expect(state.acceptedAssetIds.size).toBe(0)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  // --- clearError ---

  it('clearError clears error', async () => {
    mockAssetRecommend.mockResolvedValue({
      success: false,
      error: { code: 'ERR', message: '出错了' },
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())
    expect(useRecommendationStore.getState().error).toBe('出错了')

    useRecommendationStore.getState().clearError()

    expect(useRecommendationStore.getState().error).toBeNull()
  })

  // --- Same-section refresh preserves ignoredAssetIds ---

  it('same-section refresh preserves ignoredAssetIds', async () => {
    // First fetch
    mockAssetRecommend.mockResolvedValueOnce({
      success: true,
      data: makeResult('sec-1', [
        makeRecommendation({ assetId: 'a1' }),
        makeRecommendation({ assetId: 'a2' }),
      ]),
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    // Ignore a1
    useRecommendationStore.getState().ignoreRecommendation('a1')
    expect(useRecommendationStore.getState().ignoredAssetIds.has('a1')).toBe(true)

    // Second fetch (same section) - a1 comes back from API but should be filtered
    mockAssetRecommend.mockResolvedValueOnce({
      success: true,
      data: makeResult('sec-1', [
        makeRecommendation({ assetId: 'a1' }),
        makeRecommendation({ assetId: 'a3' }),
      ]),
    })
    await useRecommendationStore.getState().fetchRecommendations(makeContext())

    const state = useRecommendationStore.getState()
    const ids = state.recommendations.map((r) => r.assetId)
    expect(ids).toEqual(['a3'])
    expect(state.ignoredAssetIds.has('a1')).toBe(true)
  })
})
