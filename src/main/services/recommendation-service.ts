import { AssetRepository } from '@main/db/repositories/asset-repo'
import { TagRepository } from '@main/db/repositories/tag-repo'
import { createLogger } from '@main/utils/logger'
import { computeMatchScores } from './asset-service'
import type {
  RecommendationContext,
  RecommendationResult,
  AssetRecommendation,
} from '@shared/recommendation-types'

const logger = createLogger('recommendation-service')
const assetRepo = new AssetRepository()
const tagRepo = new TagRepository()

const STOP_WORDS = new Set([
  '的',
  '了',
  '是',
  '在',
  '和',
  '有',
  '为',
  '等',
  '个',
  '一',
  '不',
  '对',
  '与',
  '中',
  '到',
])

const MAX_RECOMMENDATIONS = 8
const MIN_CONTEXT_CHARS = 8

/** Strip basic Markdown syntax for plain-text extraction (main process, no Plate dependency) */
function stripMarkdownSimple(text: string): string {
  return (
    text
      // Remove headings
      .replace(/^#{1,6}\s+/gm, '')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Remove links
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bold/italic/strikethrough
      .replace(/[*_~`]/g, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Remove blockquotes
      .replace(/^>\s*/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
  )
}

/** Normalize whitespace: collapse runs and trim */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Extract key terms from title + content for FTS search.
 * Splits on Chinese/English punctuation, filters stopwords and short tokens,
 * returns top 5 terms joined by space.
 */
export function extractKeyTerms(title: string, content: string): string {
  const combined = `${title} ${content}`
  // Split on Chinese and English sentence-level punctuation
  const sentences = combined.split(/[。！？；，、：.!?;,:]/)

  const tokenSet = new Set<string>()
  const tokens: string[] = []

  for (const sentence of sentences) {
    // Split on whitespace and common punctuation
    const words = sentence.split(/[\s\u3000()（）【】[\]{}「」《》""''、·\-/\\|]+/)
    for (const word of words) {
      const trimmed = word.trim()
      if (trimmed.length <= 1) continue
      if (/^\d+$/.test(trimmed)) continue
      if (STOP_WORDS.has(trimmed)) continue
      if (!tokenSet.has(trimmed)) {
        tokenSet.add(trimmed)
        tokens.push(trimmed)
      }
    }
  }

  // Sort by length descending, take top 5
  tokens.sort((a, b) => b.length - a.length)
  return tokens.slice(0, 5).join(' ')
}

export const recommendationService = {
  async recommend(context: RecommendationContext): Promise<RecommendationResult> {
    logger.info(`推荐资产: sectionKey="${context.sectionKey}", title="${context.sectionTitle}"`)

    const emptyResult: RecommendationResult = {
      sectionKey: context.sectionKey,
      recommendations: [],
    }

    // Strip markdown and normalize the context text
    const rawText = stripMarkdownSimple(context.sectionTitle + ' ' + context.sectionContent)
    const normalized = normalizeWhitespace(rawText).slice(0, 500)

    // Skip if context is too short
    const effectiveChars = normalized.replace(/\s/g, '')
    if (effectiveChars.length < MIN_CONTEXT_CHARS) {
      logger.info('上下文过短，跳过推荐')
      return emptyResult
    }

    // Extract key terms
    const keyword = extractKeyTerms(context.sectionTitle, normalized)
    if (!keyword) {
      logger.info('未提取到关键词，跳过推荐')
      return emptyResult
    }

    logger.info(`关键词: "${keyword}"`)

    // Search assets using FTS
    const { items, rawRanks } = await assetRepo.search({
      keyword,
      tagNames: [],
      assetTypes: [],
    })

    if (items.length === 0) {
      return emptyResult
    }

    // Compute match scores using shared normalization
    const hasRanks = Object.keys(rawRanks).length > 0
    const scored = hasRanks
      ? computeMatchScores(items, rawRanks)
      : items.map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          assetType: item.assetType,
          sourceProject: item.sourceProject,
          tags: [],
          matchScore: 100,
        }))

    // Filter out assets whose content substantially overlaps with the current section
    const sectionText = normalizeWhitespace(stripMarkdownSimple(context.sectionContent))

    const filtered = scored.filter((result) => {
      const asset = items.find((a) => a.id === result.id)
      if (!asset) return false

      const assetText = normalizeWhitespace(stripMarkdownSimple(asset.content))

      // If the asset content is fully contained in the section, exclude it
      if (sectionText.includes(assetText)) return false

      // If the first 80 non-whitespace chars of the asset are found in the section, exclude it
      const assetPrefix = assetText.replace(/\s/g, '').slice(0, 80)
      if (assetPrefix.length > 0 && sectionText.replace(/\s/g, '').includes(assetPrefix)) {
        return false
      }

      return true
    })

    // Take top N results
    const topN = filtered.slice(0, MAX_RECOMMENDATIONS)

    // Batch-fetch tags
    const tagMap = await tagRepo.findByAssetIds(topN.map((r) => r.id))

    const recommendations: AssetRecommendation[] = topN.map((r) => ({
      assetId: r.id,
      title: r.title,
      summary: r.summary,
      assetType: r.assetType,
      tags: tagMap.get(r.id) ?? [],
      matchScore: r.matchScore,
      sourceProject: r.sourceProject,
    }))

    logger.info(`推荐结果: ${recommendations.length} 条`)

    return {
      sectionKey: context.sectionKey,
      recommendations,
    }
  },
}
