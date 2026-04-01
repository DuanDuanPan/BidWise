/**
 * Chapter generation service — builds rich context and dispatches
 * AI generation via agent-orchestrator for individual proposal chapters.
 */
import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { documentService } from '@main/services/document-service'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import type { ChapterHeadingLocator, ChapterGenerateOutput } from '@shared/chapter-types'

const logger = createLogger('chapter-generation-service')

const CHAPTER_TIMEOUT_MS = 120_000
const MAX_ADJACENT_SUMMARY_LENGTH = 500

interface HeadingInfo {
  title: string
  level: number
  lineIndex: number
  occurrenceIndex: number
}

interface ChapterSlice {
  heading: HeadingInfo
  contentLines: string[]
}

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/
const FENCE_RE = /^(\s*)(`{3,}|~{3,})/
const GUIDANCE_RE = /^>\s*/

/** Extract all headings from markdown, respecting fenced code blocks */
function extractHeadings(markdown: string): HeadingInfo[] {
  const lines = markdown.split('\n')
  const headings: HeadingInfo[] = []
  let inFence = false
  let fenceChar: string | null = null
  let fenceLen = 0
  const occurrenceCount = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[2]
      const char = marker[0]
      const len = marker.length
      if (inFence) {
        if (char === fenceChar && len >= fenceLen) {
          inFence = false
          fenceChar = null
          fenceLen = 0
        }
      } else {
        inFence = true
        fenceChar = char
        fenceLen = len
      }
      continue
    }
    if (inFence) continue

    const match = HEADING_RE.exec(line)
    if (match) {
      const level = match[1].length
      const title = match[2]
      const count = occurrenceCount.get(title) ?? 0
      occurrenceCount.set(title, count + 1)
      headings.push({ title, level, lineIndex: i, occurrenceIndex: count })
    }
  }
  return headings
}

/** Locate a heading by its locator (title + level + occurrenceIndex) */
function findHeading(
  headings: HeadingInfo[],
  locator: ChapterHeadingLocator
): HeadingInfo | undefined {
  let occurrence = 0
  for (const h of headings) {
    if (h.title === locator.title && h.level === locator.level) {
      if (occurrence === locator.occurrenceIndex) return h
      occurrence++
    }
  }
  return undefined
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

/** Check if chapter content is empty or guidance-only (blockquotes + blank lines) */
function isChapterEmpty(contentLines: string[]): boolean {
  for (const line of contentLines) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    if (GUIDANCE_RE.test(trimmed)) continue
    // If it's a sub-heading at a deeper level, that's still "empty" (no real content)
    if (HEADING_RE.test(trimmed)) continue
    return false
  }
  return true
}

/** Extract guidance text from blockquote lines */
function extractGuidanceText(contentLines: string[]): string {
  return contentLines
    .filter((line) => GUIDANCE_RE.test(line.trim()))
    .map((line) => line.trim().replace(GUIDANCE_RE, ''))
    .join('\n')
    .trim()
}

/** Create a short digest of chapter content for conflict detection */
function createDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
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
    const rootPath = join(app.getPath('userData'), 'data', 'projects', projectId)
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
    const headings = extractHeadings(markdown)

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
    const headings = extractHeadings(markdown)

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
    const baselineDigest = createDigest(chapter.contentLines.join('\n'))

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
      const prevHeading = headings[targetIdx - 1]
      const prevSlice = sliceChapter(lines, headings, prevHeading)
      const summary = summarizeChapter(prevSlice)
      if (summary) adjacentBefore = `**${prevHeading.title}**: ${summary}`
    }
    if (targetIdx < headings.length - 1) {
      const nextHeading = headings[targetIdx + 1]
      const nextSlice = sliceChapter(lines, headings, nextHeading)
      const summary = summarizeChapter(nextSlice)
      if (summary) adjacentAfter = `**${nextHeading.title}**: ${summary}`
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
