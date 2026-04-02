/**
 * Chapter generation service — builds rich context and dispatches
 * AI generation via agent-orchestrator for individual proposal chapters.
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { ErrorCode } from '@shared/constants'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { documentService } from '@main/services/document-service'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import type { ChapterHeadingLocator, ChapterGenerateOutput } from '@shared/chapter-types'
import {
  createContentDigest,
  extractMarkdownHeadings,
  findMarkdownHeading,
  isMarkdownSectionContentEmpty,
} from '@shared/chapter-markdown'
import type { MarkdownHeadingInfo } from '@shared/chapter-markdown'

const logger = createLogger('chapter-generation-service')

const CHAPTER_TIMEOUT_MS = 120_000
const MAX_ADJACENT_SUMMARY_LENGTH = 500

type HeadingInfo = MarkdownHeadingInfo

interface ChapterSlice {
  heading: HeadingInfo
  contentLines: string[]
}

const GUIDANCE_RE = /^>\s*/

/** Locate a heading by its locator (title + level + occurrenceIndex) */
function findHeading(
  headings: HeadingInfo[],
  locator: ChapterHeadingLocator
): HeadingInfo | undefined {
  return findMarkdownHeading(headings, locator)
}

/** Slice the chapter content (lines between heading and next same-or-higher-level heading) */
function sliceChapter(lines: string[], headings: HeadingInfo[], target: HeadingInfo): ChapterSlice {
  const startLine = target.lineIndex + 1
  let endLine = lines.length
  for (const h of headings) {
    if (h.lineIndex > target.lineIndex && h.level <= target.level) {
      endLine = h.lineIndex
      break
    }
  }
  return {
    heading: target,
    contentLines: lines.slice(startLine, endLine),
  }
}

function findAdjacentSiblingHeading(
  headings: HeadingInfo[],
  targetIdx: number,
  direction: -1 | 1
): HeadingInfo | undefined {
  const target = headings[targetIdx]
  for (let i = targetIdx + direction; i >= 0 && i < headings.length; i += direction) {
    const candidate = headings[i]
    if (candidate.level < target.level) break
    if (candidate.level === target.level) return candidate
  }
  return undefined
}

/** Check if chapter content is empty or guidance-only (blockquotes + blank lines) */
function isChapterEmpty(contentLines: string[]): boolean {
  return isMarkdownSectionContentEmpty(contentLines)
}

/** Extract guidance text from blockquote lines */
function extractGuidanceText(contentLines: string[]): string {
  return contentLines
    .filter((line) => GUIDANCE_RE.test(line.trim()))
    .map((line) => line.trim().replace(GUIDANCE_RE, ''))
    .join('\n')
    .trim()
}

/** Summarize adjacent chapter content (truncated) */
function summarizeChapter(slice: ChapterSlice): string {
  const content = slice.contentLines.join('\n').trim()
  if (!content) return ''
  return content.length > MAX_ADJACENT_SUMMARY_LENGTH
    ? content.slice(0, MAX_ADJACENT_SUMMARY_LENGTH) + '…'
    : content
}

/** Try to read seed.json for strategy context (graceful degradation) */
async function readStrategySeed(projectId: string): Promise<string | undefined> {
  try {
    const rootPath = resolveProjectDataPath(projectId)
    const seedPath = join(rootPath, 'seed.json')
    const content = await readFile(seedPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    if (parsed.strategy && typeof parsed.strategy === 'string') {
      return parsed.strategy
    }
    return JSON.stringify(parsed, null, 2)
  } catch {
    // seed.json is optional — graceful degradation
    return undefined
  }
}

const requirementRepo = new RequirementRepository()
const scoringModelRepo = new ScoringModelRepository()
const mandatoryItemRepo = new MandatoryItemRepository()

export const chapterGenerationService = {
  async generateChapter(
    projectId: string,
    target: ChapterHeadingLocator
  ): Promise<ChapterGenerateOutput> {
    // Load proposal content
    const doc = await documentService.load(projectId)
    const markdown = doc.content
    const lines = markdown.split('\n')
    const headings = extractMarkdownHeadings(markdown)

    // Locate target heading
    const targetHeading = findHeading(headings, target)
    if (!targetHeading) {
      throw new BidWiseError(
        ErrorCode.NOT_FOUND,
        `章节未找到: ${target.title} (L${target.level}, #${target.occurrenceIndex})`
      )
    }

    // Slice chapter content
    const chapter = sliceChapter(lines, headings, targetHeading)

    // Verify chapter is empty/guidance-only for first generation
    if (!isChapterEmpty(chapter.contentLines)) {
      throw new ValidationError(`章节 "${target.title}" 已有内容，请使用重新生成功能`)
    }

    return this._dispatchGeneration(projectId, target, chapter, headings, lines)
  },

  async regenerateChapter(
    projectId: string,
    target: ChapterHeadingLocator,
    additionalContext: string
  ): Promise<ChapterGenerateOutput> {
    const doc = await documentService.load(projectId)
    const markdown = doc.content
    const lines = markdown.split('\n')
    const headings = extractMarkdownHeadings(markdown)

    const targetHeading = findHeading(headings, target)
    if (!targetHeading) {
      throw new BidWiseError(
        ErrorCode.NOT_FOUND,
        `章节未找到: ${target.title} (L${target.level}, #${target.occurrenceIndex})`
      )
    }

    const chapter = sliceChapter(lines, headings, targetHeading)

    return this._dispatchGeneration(projectId, target, chapter, headings, lines, additionalContext)
  },

  async _dispatchGeneration(
    projectId: string,
    target: ChapterHeadingLocator,
    chapter: ChapterSlice,
    headings: HeadingInfo[],
    lines: string[],
    additionalContext?: string
  ): Promise<ChapterGenerateOutput> {
    // Build context
    const guidanceText = extractGuidanceText(chapter.contentLines)
    const baselineDigest = createContentDigest(chapter.contentLines.join('\n'))

    // Load requirements
    let requirementsText = '暂无需求信息'
    try {
      const requirements = await requirementRepo.findByProject(projectId)
      if (requirements.length > 0) {
        requirementsText = requirements
          .map((r) => `- [${r.category}/${r.priority}] ${r.description}`)
          .join('\n')
      }
    } catch (err) {
      logger.warn('Failed to load requirements, proceeding without:', err)
    }

    // Load scoring model
    let scoringWeightsText: string | undefined
    try {
      const scoringModel = await scoringModelRepo.findByProject(projectId)
      if (scoringModel) {
        scoringWeightsText = scoringModel.criteria
          .map(
            (c) =>
              `- ${c.category} (${c.maxScore}分, 权重${c.weight}): ${c.subItems.map((s) => s.name).join(', ')}`
          )
          .join('\n')
      }
    } catch (err) {
      logger.warn('Failed to load scoring model, proceeding without:', err)
    }

    // Load mandatory items
    let mandatoryItemsText: string | undefined
    try {
      const mandatoryItems = await mandatoryItemRepo.findByProject(projectId)
      if (mandatoryItems.length > 0) {
        mandatoryItemsText = mandatoryItems
          .filter((m) => m.status !== 'dismissed')
          .map((m) => `- ${m.content}`)
          .join('\n')
      }
    } catch (err) {
      logger.warn('Failed to load mandatory items, proceeding without:', err)
    }

    // Build adjacent chapter summaries
    const targetIdx = headings.findIndex((h) => h.lineIndex === chapter.heading.lineIndex)
    let adjacentBefore: string | undefined
    let adjacentAfter: string | undefined

    if (targetIdx > 0) {
      const prevHeading = findAdjacentSiblingHeading(headings, targetIdx, -1)
      if (prevHeading) {
        const prevSlice = sliceChapter(lines, headings, prevHeading)
        const summary = summarizeChapter(prevSlice)
        if (summary) adjacentBefore = `**${prevHeading.title}**: ${summary}`
      }
    }
    if (targetIdx < headings.length - 1) {
      const nextHeading = findAdjacentSiblingHeading(headings, targetIdx, 1)
      if (nextHeading) {
        const nextSlice = sliceChapter(lines, headings, nextHeading)
        const summary = summarizeChapter(nextSlice)
        if (summary) adjacentAfter = `**${nextHeading.title}**: ${summary}`
      }
    }

    // Optional strategy seed
    const strategySeed = await readStrategySeed(projectId)

    // Dispatch to agent-orchestrator
    const response = await agentOrchestrator.execute({
      agentType: 'generate',
      context: {
        projectId,
        chapterTitle: target.title,
        chapterLevel: target.level,
        requirements: requirementsText,
        guidanceText: guidanceText || undefined,
        scoringWeights: scoringWeightsText,
        mandatoryItems: mandatoryItemsText,
        adjacentChaptersBefore: adjacentBefore,
        adjacentChaptersAfter: adjacentAfter,
        strategySeed,
        additionalContext,
        target,
        baselineDigest,
      },
      options: {
        timeoutMs: CHAPTER_TIMEOUT_MS,
        maxRetries: 0,
      },
    })

    return { taskId: response.taskId }
  },
}
