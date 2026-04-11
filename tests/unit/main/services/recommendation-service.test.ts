import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Asset } from '@shared/asset-types'
import type { RecommendationContext } from '@shared/recommendation-types'

const mockSearch = vi.hoisted(() => vi.fn())
const mockCreate = vi.hoisted(() => vi.fn())
const mockFindByAssetIds = vi.hoisted(() => vi.fn())

vi.mock('@main/db/repositories/asset-repo', () => ({
  AssetRepository: class {
    search = mockSearch
    create = mockCreate
  },
}))

vi.mock('@main/db/repositories/tag-repo', () => ({
  TagRepository: class {
    findByAssetIds = mockFindByAssetIds
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

const { recommendationService, extractKeyTerms } =
  await import('@main/services/recommendation-service')

function makeAsset(overrides: Record<string, unknown> = {}): Asset {
  return {
    id: 'a1',
    projectId: null,
    title: '测试资产',
    summary: '摘要',
    content: '这是一段较长的内容用于测试推荐功能',
    assetType: 'text',
    sourceProject: '项目A',
    sourceSection: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Asset
}

function makeContext(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    sectionKey: 'sec-1',
    sectionTitle: '系统架构设计',
    sectionContent: '基于微服务架构的分布式系统设计方案，包含容器编排和服务治理',
    projectId: 'p1',
    ...overrides,
  }
}

describe('extractKeyTerms', () => {
  it('extracts keywords from Chinese text', () => {
    const result = extractKeyTerms('系统架构', '微服务 分布式 容器编排')
    expect(result).toBeTruthy()
    expect(result.split(' ').length).toBeGreaterThan(0)
  })

  it('filters stopwords', () => {
    // Each stopword is separated by punctuation so they become individual tokens
    const result = extractKeyTerms('的，了，是，在，和', '有，为，等，个，一，不，对，与，中，到')
    // All tokens are single-char stopwords, so result should be empty
    expect(result).toBe('')
  })

  it('returns max 5 terms sorted by length descending', () => {
    const result = extractKeyTerms(
      '短词 中等词汇 较长的关键词',
      '非常长的技术术语 微服务架构设计 容器编排方案 服务治理策略 数据库优化 安全防护体系 负载均衡配置'
    )
    const terms = result.split(' ')
    expect(terms.length).toBeLessThanOrEqual(5)
    // Verify sorted by length descending
    for (let i = 1; i < terms.length; i++) {
      expect(terms[i - 1].length).toBeGreaterThanOrEqual(terms[i].length)
    }
  })

  it('returns empty string for empty input', () => {
    const result = extractKeyTerms('', '')
    expect(result).toBe('')
  })

  it('returns empty string for short single-char input', () => {
    const result = extractKeyTerms('a', 'b')
    expect(result).toBe('')
  })
})

describe('recommendationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindByAssetIds.mockResolvedValue(new Map())
  })

  describe('recommend', () => {
    it('returns empty for context shorter than 8 chars', async () => {
      const result = await recommendationService.recommend(
        makeContext({ sectionTitle: '短', sectionContent: '内容' })
      )

      expect(result.sectionKey).toBe('sec-1')
      expect(result.recommendations).toHaveLength(0)
      expect(mockSearch).not.toHaveBeenCalled()
    })

    it('returns empty when extractKeyTerms returns empty', async () => {
      // All tokens are single-char stopwords separated by punctuation.
      // The combined text has enough non-whitespace chars (>= 8) to pass
      // the min-context check, but extractKeyTerms returns '' because
      // every token is either length <= 1 or a stopword.
      const result = await recommendationService.recommend(
        makeContext({
          sectionTitle: '的，了，是，在',
          sectionContent: '和，有，为，等，个，一，不，对，与，中，到，的，了，是，在',
        })
      )

      expect(result.recommendations).toHaveLength(0)
      expect(mockSearch).not.toHaveBeenCalled()
    })

    it('returns sorted recommendations with tags', async () => {
      const a1 = makeAsset({ id: 'a1', title: '资产一', content: '独立内容AAA' })
      const a2 = makeAsset({ id: 'a2', title: '资产二', content: '独立内容BBB' })

      mockSearch.mockResolvedValue({
        items: [a1, a2],
        total: 2,
        rawRanks: { a1: -10, a2: -5 },
      })

      const tag1 = {
        id: 't1',
        name: '架构',
        normalizedName: '架构',
        createdAt: '2026-01-01T00:00:00.000Z',
      }
      mockFindByAssetIds.mockResolvedValue(
        new Map([
          ['a1', [tag1]],
          ['a2', []],
        ])
      )

      const result = await recommendationService.recommend(makeContext())

      expect(result.sectionKey).toBe('sec-1')
      expect(result.recommendations.length).toBeGreaterThan(0)
      // First recommendation should have tags attached
      const recA1 = result.recommendations.find((r) => r.assetId === 'a1')
      if (recA1) {
        expect(recA1.tags).toHaveLength(1)
        expect(recA1.tags[0].name).toBe('架构')
      }
    })

    it('caps at 8 results', async () => {
      const items = Array.from({ length: 12 }, (_, i) =>
        makeAsset({
          id: `a${i}`,
          title: `资产${i}`,
          content: `独立内容_${i}_${'x'.repeat(100)}`,
        })
      )
      const rawRanks: Record<string, number> = {}
      for (let i = 0; i < 12; i++) {
        rawRanks[`a${i}`] = -(12 - i)
      }

      mockSearch.mockResolvedValue({ items, total: 12, rawRanks })
      mockFindByAssetIds.mockResolvedValue(new Map())

      const result = await recommendationService.recommend(makeContext())

      expect(result.recommendations.length).toBeLessThanOrEqual(8)
    })

    it('filters assets overlapping with section content', async () => {
      const sectionContent = '基于微服务架构的分布式系统设计方案，包含容器编排和服务治理'
      // This asset's content is fully contained in the section
      const overlapping = makeAsset({
        id: 'overlap',
        title: '重复资产',
        content: '微服务架构的分布式系统设计方案',
      })
      const unique = makeAsset({
        id: 'unique',
        title: '独特资产',
        content: '这是一段完全不同的关于量子计算的独立内容材料',
      })

      mockSearch.mockResolvedValue({
        items: [overlapping, unique],
        total: 2,
        rawRanks: { overlap: -10, unique: -5 },
      })
      mockFindByAssetIds.mockResolvedValue(new Map())

      const result = await recommendationService.recommend(makeContext({ sectionContent }))

      const ids = result.recommendations.map((r) => r.assetId)
      expect(ids).not.toContain('overlap')
      expect(ids).toContain('unique')
    })

    it('maps sourceProject and matchScore correctly', async () => {
      const asset = makeAsset({
        id: 'a1',
        title: '架构设计资产',
        content: '独立的架构设计内容不与章节重叠的部分',
        sourceProject: '智慧城市项目',
      })

      mockSearch.mockResolvedValue({
        items: [asset],
        total: 1,
        rawRanks: { a1: -10 },
      })
      mockFindByAssetIds.mockResolvedValue(new Map([['a1', []]]))

      const result = await recommendationService.recommend(makeContext())

      expect(result.recommendations).toHaveLength(1)
      expect(result.recommendations[0].sourceProject).toBe('智慧城市项目')
      expect(result.recommendations[0].matchScore).toBeDefined()
      expect(typeof result.recommendations[0].matchScore).toBe('number')
    })
  })
})
