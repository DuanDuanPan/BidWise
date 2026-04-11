import { AssetRepository } from '@main/db/repositories/asset-repo'
import { TagRepository } from '@main/db/repositories/tag-repo'
import { NotFoundError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import type {
  AssetSearchQuery,
  AssetQueryResult,
  AssetListFilter,
  AssetDetail,
  AssetSearchResult,
  UpdateAssetTagsInput,
  Tag,
  Asset,
} from '@shared/asset-types'

const logger = createLogger('asset-service')
const assetRepo = new AssetRepository()
const tagRepo = new TagRepository()

/** Parse rawQuery to extract keywords and #tags (supports # and ＃) */
function parseRawQuery(rawQuery: string): { keyword: string; tagNames: string[] } {
  const tagNames: string[] = []
  // Match both half-width # and full-width ＃ followed by non-whitespace
  const tagPattern = /[#＃](\S+)/g
  let match: RegExpExecArray | null = tagPattern.exec(rawQuery)

  while (match !== null) {
    tagNames.push(match[1])
    match = tagPattern.exec(rawQuery)
  }

  // Remove all tag tokens from the query to get the keyword portion
  const keyword = rawQuery.replace(/[#＃]\S+/g, '').trim()

  return { keyword, tagNames }
}

/** Normalize tag name: trim, collapse whitespace, preserve display form */
function normalizeTagNames(tagNames: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const name of tagNames) {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(trimmed)
    }
  }

  return result
}

/** Normalize raw FTS ranks into 0-100 matchScore */
function computeMatchScores(items: Asset[], rawRanks: Record<string, number>): AssetSearchResult[] {
  // bm25() returns negative values where more negative = better match
  const rankValues = Object.values(rawRanks)
  if (rankValues.length === 0) {
    return items.map((item) => toSearchResult(item, [], 100))
  }

  const minRank = Math.min(...rankValues) // best match (most negative)
  const maxRank = Math.max(...rankValues) // worst match (least negative)
  const range = maxRank - minRank

  return items.map((item) => {
    const rank = rawRanks[item.id]
    let score: number
    if (rank === undefined || range === 0) {
      score = 100
    } else {
      // More negative rank = higher score
      score = Math.round(((maxRank - rank) / range) * 80 + 20)
    }
    return toSearchResult(item, [], score)
  })
}

function toSearchResult(asset: Asset, tags: Tag[], matchScore: number): AssetSearchResult {
  return {
    id: asset.id,
    title: asset.title,
    summary: asset.summary,
    assetType: asset.assetType,
    sourceProject: asset.sourceProject,
    tags,
    matchScore,
  }
}

export const assetService = {
  async search(query: AssetSearchQuery): Promise<AssetQueryResult> {
    logger.info(`搜索资产: rawQuery="${query.rawQuery}", types=${JSON.stringify(query.assetTypes)}`)

    const { keyword, tagNames: rawTags } = parseRawQuery(query.rawQuery)
    const tagNames = normalizeTagNames(rawTags)

    const { items, total, rawRanks } = await assetRepo.search({
      keyword,
      tagNames,
      assetTypes: query.assetTypes,
    })

    const hasKeyword = keyword.length > 0
    let results: AssetSearchResult[]

    if (hasKeyword && Object.keys(rawRanks).length > 0) {
      results = computeMatchScores(items, rawRanks)
    } else {
      results = items.map((item) => toSearchResult(item, [], 100))
    }

    // Attach tags to each result
    for (const result of results) {
      result.tags = await tagRepo.findByAssetId(result.id)
    }

    return { items: results, total }
  },

  async list(filter?: AssetListFilter): Promise<AssetQueryResult> {
    logger.info(`列出资产: filter=${JSON.stringify(filter)}`)

    const { items, total } = await assetRepo.list(filter)

    const results: AssetSearchResult[] = []
    for (const item of items) {
      const tags = await tagRepo.findByAssetId(item.id)
      results.push(toSearchResult(item, tags, 100))
    }

    return { items: results, total }
  },

  async getById(id: string): Promise<AssetDetail> {
    logger.info(`获取资产详情: id=${id}`)

    const asset = await assetRepo.findById(id)
    if (!asset) {
      throw new NotFoundError(`资产不存在: ${id}`)
    }

    const tags = await tagRepo.findByAssetId(id)

    return { ...asset, tags }
  },

  async updateTags(input: UpdateAssetTagsInput): Promise<Tag[]> {
    logger.info(`更新资产标签: assetId=${input.assetId}, tags=${JSON.stringify(input.tagNames)}`)

    const asset = await assetRepo.findById(input.assetId)
    if (!asset) {
      throw new NotFoundError(`资产不存在: ${input.assetId}`)
    }

    const normalizedNames = normalizeTagNames(input.tagNames)
    const tags = await tagRepo.findOrCreateMany(normalizedNames)
    const tagIds = tags.map((t) => t.id)

    await tagRepo.replaceAssetTags(input.assetId, tagIds)
    await tagRepo.deleteOrphanedTags()

    return tagRepo.findByAssetId(input.assetId)
  },
}
