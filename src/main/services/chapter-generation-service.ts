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
import { agentOrchestrator, batchOrchestrationManager } from '@main/services/agent-orchestrator'
import { documentService } from '@main/services/document-service'
import { writingStyleService, serializeStyleForPrompt } from '@main/services/writing-style-service'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { TraceabilityLinkRepository } from '@main/db/repositories/traceability-link-repo'
import {
  isComplianceMatrixChapter,
  shouldSuggestDiagrams,
} from '@main/prompts/generate-chapter.prompt'
import type {
  ChapterHeadingLocator,
  ChapterGenerateOutput,
  SkeletonExpandPlan,
  SkeletonGenerateOutput,
  BatchGenerateOutput,
  BatchSectionProgressPayload,
  BatchSectionRetryingPayload,
  BatchSectionFailedPayload,
  BatchCompletePayload,
} from '@shared/chapter-types'
import {
  createContentDigest,
  extractMarkdownHeadings,
  findMarkdownHeading,
  getMarkdownDirectSectionBodyByHeading,
  isMarkdownDirectBodyEmpty,
  isMarkdownSectionContentEmpty,
} from '@shared/chapter-markdown'
import { chapterSummaryStore } from '@main/services/chapter-summary-store'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import { headingTreeDistance } from '@main/utils/heading-tree-distance'
import {
  CHAPTER_SUMMARY_FALLBACK_LENGTH,
  CHAPTER_SUMMARY_TOP_N,
  type GeneratedChapterSummary,
  type GeneratedChaptersContext,
} from '@shared/chapter-summary-types'
import { progressEmitter } from '@main/services/task-queue/progress-emitter'
import { taskQueue } from '@main/services/task-queue'
import type { MarkdownHeadingInfo } from '@shared/chapter-markdown'

const logger = createLogger('chapter-generation-service')

// Chapter task budget covers prose generation + up to ~4 skill diagrams, each
// of which may burn several minutes streaming large SVGs. 30 min leaves room
// for repair loops without starving later diagrams after an early slow one.
const CHAPTER_TIMEOUT_MS = 1_800_000
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

function truncateForFallback(body: string, max: number): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max) + '…'
}

/**
 * Build the four-group global summary context for a chapter generation
 * (Story 3.12 AC4). Enumerates all headings whose direct body is non-empty,
 * hydrates each via lineHash-matched cache or 500-char direct-body fallback,
 * ranks by LCA tree distance, and groups as ancestors / siblings / descendants
 * / others.
 */
async function buildGeneratedChaptersContext(
  projectId: string,
  markdown: string,
  headings: HeadingInfo[],
  targetHeading: HeadingInfo
): Promise<GeneratedChaptersContext | undefined> {
  const lines = markdown.split('\n')
  const sidecarEntries = await chapterSummaryStore.list(projectId)
  const sidecarByKey = new Map<string, (typeof sidecarEntries)[number]>()
  for (const entry of sidecarEntries) {
    sidecarByKey.set(`${entry.headingKey}#${entry.occurrenceIndex}`, entry)
  }

  type Candidate = {
    summary: GeneratedChapterSummary
    relation: HeadingRelationLike
    order: number
  }
  const candidates: Candidate[] = []

  for (let idx = 0; idx < headings.length; idx++) {
    const candidate = headings[idx]
    if (candidate.lineIndex === targetHeading.lineIndex) continue

    const directBody = getMarkdownDirectSectionBodyByHeading(lines, headings, candidate)
    if (isMarkdownDirectBodyEmpty(directBody)) continue

    const locator = {
      title: candidate.title,
      level: candidate.level,
      occurrenceIndex: candidate.occurrenceIndex,
    }
    const headingKey = createChapterLocatorKey(locator)
    const cached = sidecarByKey.get(`${headingKey}#${candidate.occurrenceIndex}`)
    const currentHash = createContentDigest(directBody)

    let summaryText: string
    let source: 'cache' | 'fallback'
    if (cached && cached.lineHash === currentHash && cached.summary.length > 0) {
      summaryText = cached.summary
      source = 'cache'
    } else {
      summaryText = truncateForFallback(directBody, CHAPTER_SUMMARY_FALLBACK_LENGTH)
      source = 'fallback'
    }

    const { distance, relation } = headingTreeDistance(headings, targetHeading, candidate)

    candidates.push({
      summary: {
        headingKey,
        headingTitle: candidate.title,
        headingLevel: candidate.level,
        occurrenceIndex: candidate.occurrenceIndex,
        distance,
        source,
        summary: summaryText,
      },
      relation,
      order: idx,
    })
  }

  if (candidates.length === 0) return undefined

  candidates.sort((a, b) => {
    if (a.summary.distance !== b.summary.distance) return a.summary.distance - b.summary.distance
    return a.order - b.order
  })

  const topN = candidates.slice(0, CHAPTER_SUMMARY_TOP_N)

  const context: GeneratedChaptersContext = {
    ancestors: [],
    siblings: [],
    descendants: [],
    others: [],
  }
  for (const entry of topN) {
    switch (entry.relation) {
      case 'ancestor':
        context.ancestors.push(entry.summary)
        break
      case 'sibling':
        context.siblings.push(entry.summary)
        break
      case 'descendant':
        context.descendants.push(entry.summary)
        break
      default:
        context.others.push(entry.summary)
        break
    }
  }

  return context
}

type HeadingRelationLike = 'ancestor' | 'sibling' | 'descendant' | 'other'

/**
 * Build `generatedChaptersContext` for a batch sub-chapter that has not yet
 * been written into the document. The sub-chapter is inserted synthetically
 * as the first child of `parentHeading` so that LCA-based grouping (父级 / 同级 /
 * 子章节 / 其他) reflects the sub-chapter's position, not the parent's.
 */
async function buildSubchapterGeneratedContext(
  projectId: string,
  parentMarkdown: string,
  parentHeadings: HeadingInfo[],
  parentHeading: HeadingInfo,
  subchapter: { title: string; level: number }
): Promise<GeneratedChaptersContext | undefined> {
  const parentIdx = parentHeadings.findIndex((h) => h.lineIndex === parentHeading.lineIndex)
  if (parentIdx < 0) {
    return buildGeneratedChaptersContext(projectId, parentMarkdown, parentHeadings, parentHeading)
  }

  const synthetic: HeadingInfo = {
    rawTitle: subchapter.title,
    title: subchapter.title,
    level: subchapter.level as HeadingInfo['level'],
    // Synthetic lineIndex lands immediately after the parent heading; no real
    // line in parentMarkdown corresponds to it, and buildGeneratedChaptersContext
    // skips it as `targetHeading` (self) before any line-based body extraction.
    lineIndex: parentHeading.lineIndex + 1,
    occurrenceIndex: 0,
  }

  const syntheticHeadings: HeadingInfo[] = [
    ...parentHeadings.slice(0, parentIdx + 1),
    synthetic,
    ...parentHeadings.slice(parentIdx + 1),
  ]

  return buildGeneratedChaptersContext(projectId, parentMarkdown, syntheticHeadings, synthetic)
}

/** Build a readable document outline from headings, marking the current chapter */
function buildDocumentOutline(headings: HeadingInfo[], currentHeading: HeadingInfo): string {
  return headings
    .map((h) => {
      const indent = '  '.repeat(h.level - 1)
      const marker = h.lineIndex === currentHeading.lineIndex ? ' ← 当前章节' : ''
      return `${indent}- ${h.title}${marker}`
    })
    .join('\n')
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
const traceabilityLinkRepo = new TraceabilityLinkRepository()

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

    // Load requirements — filter by traceability links when available
    let requirementsText = '暂无需求信息'
    try {
      const allRequirements = await requirementRepo.findByProject(projectId)
      if (allRequirements.length > 0) {
        const isMatrix = isComplianceMatrixChapter(target.title)
        let filtered = allRequirements

        // For non-matrix chapters, try to filter by traceability links
        if (!isMatrix) {
          const sectionId = await this._resolveSectionId(projectId, target)
          if (sectionId) {
            try {
              const links = await traceabilityLinkRepo.findBySection(projectId, sectionId)
              if (links.length > 0) {
                const linkedIds = new Set(links.map((l) => l.requirementId))
                filtered = allRequirements.filter((r) => linkedIds.has(r.id))
                // Fallback to all if filtering yields nothing (orphaned links or data mismatch)
                if (filtered.length === 0) {
                  logger.warn(
                    `Traceability links for section ${sectionId} reference ${links.length} requirement(s) not found in current requirements — possible orphaned links. Falling back to all requirements.`
                  )
                  filtered = allRequirements
                }
              }
            } catch (err) {
              logger.warn('Failed to load traceability links, using all requirements:', err)
            }
          }
        }

        requirementsText = filtered
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

    // Load writing style for prompt injection (fail-fast: config errors must propagate)
    const writingStyle = await writingStyleService.getProjectWritingStyle(projectId)
    const writingStyleText = serializeStyleForPrompt(writingStyle)

    // Build document outline for scope awareness
    const documentOutline = buildDocumentOutline(headings, chapter.heading)

    // Story 3.12: build global four-group summary context (top-N by tree distance)
    const generatedChaptersContext = await buildGeneratedChaptersContext(
      projectId,
      lines.join('\n'),
      headings,
      chapter.heading
    )

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
        writingStyle: writingStyleText,
        documentOutline,
        adjacentChaptersBefore: adjacentBefore,
        adjacentChaptersAfter: adjacentAfter,
        generatedChaptersContext,
        strategySeed,
        additionalContext,
        target,
        baselineDigest,
        baselineSectionContent: chapter.contentLines.join('\n'),
        enableDiagrams: shouldSuggestDiagrams(target.title, {
          guidanceText: guidanceText || undefined,
        }),
      },
      options: {
        timeoutMs: CHAPTER_TIMEOUT_MS,
        maxRetries: 0,
      },
    })

    return { taskId: response.taskId }
  },

  async skeletonGenerate(
    projectId: string,
    target: ChapterHeadingLocator
  ): Promise<SkeletonGenerateOutput> {
    const doc = await documentService.load(projectId)
    const markdown = doc.content
    const headings = extractMarkdownHeadings(markdown)

    const targetHeading = findHeading(headings, target)
    if (!targetHeading) {
      throw new BidWiseError(
        ErrorCode.NOT_FOUND,
        `章节未找到: ${target.title} (L${target.level}, #${target.occurrenceIndex})`
      )
    }

    // Load requirements (same logic as _dispatchGeneration)
    let requirementsText = '暂无需求信息'
    try {
      const allRequirements = await requirementRepo.findByProject(projectId)
      if (allRequirements.length > 0) {
        const sectionId = await this._resolveSectionId(projectId, target)
        let filtered = allRequirements
        if (sectionId) {
          try {
            const links = await traceabilityLinkRepo.findBySection(projectId, sectionId)
            if (links.length > 0) {
              const linkedIds = new Set(links.map((l) => l.requirementId))
              const linkedFiltered = allRequirements.filter((r) => linkedIds.has(r.id))
              if (linkedFiltered.length > 0) filtered = linkedFiltered
            }
          } catch (err) {
            logger.warn('Failed to load traceability links for skeleton:', err)
          }
        }
        requirementsText = filtered
          .map((r) => `- [${r.category}/${r.priority}] ${r.description}`)
          .join('\n')
      }
    } catch (err) {
      logger.warn('Failed to load requirements for skeleton:', err)
    }

    // Load scoring
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
      logger.warn('Failed to load scoring model for skeleton:', err)
    }

    // Build document outline
    const documentOutline = buildDocumentOutline(headings, targetHeading)

    const response = await agentOrchestrator.execute({
      agentType: 'generate',
      context: {
        projectId,
        chapterTitle: target.title,
        chapterLevel: target.level,
        requirements: requirementsText,
        scoringWeights: scoringWeightsText,
        documentOutline,
        target,
        mode: 'skeleton-generate',
      },
      options: {
        timeoutMs: CHAPTER_TIMEOUT_MS,
        maxRetries: 0,
      },
    })

    return { taskId: response.taskId }
  },

  async skeletonConfirm(
    projectId: string,
    sectionId: string,
    plan: SkeletonExpandPlan
  ): Promise<{ success: true }> {
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      confirmedSkeletons: {
        ...current.confirmedSkeletons,
        [sectionId]: plan,
      },
    }))
    return { success: true }
  },

  async batchGenerate(
    projectId: string,
    target: ChapterHeadingLocator,
    sectionId: string
  ): Promise<BatchGenerateOutput> {
    // Read confirmed skeleton from metadata
    const metadata = await documentService.getMetadata(projectId)
    const confirmedSkeleton = metadata.confirmedSkeletons?.[sectionId]
    if (!confirmedSkeleton) {
      throw new BidWiseError(ErrorCode.NOT_FOUND, `确认的骨架计划未找到: sectionId=${sectionId}`)
    }

    // Build full rich context (same as _dispatchGeneration)
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
    const baselineDigest = createContentDigest(chapter.contentLines.join('\n'))

    // Load requirements
    let requirementsText = '暂无需求信息'
    try {
      const allRequirements = await requirementRepo.findByProject(projectId)
      if (allRequirements.length > 0) {
        const resolvedSectionId = await this._resolveSectionId(projectId, target)
        let filtered = allRequirements
        if (resolvedSectionId) {
          try {
            const links = await traceabilityLinkRepo.findBySection(projectId, resolvedSectionId)
            if (links.length > 0) {
              const linkedIds = new Set(links.map((l) => l.requirementId))
              const linkedFiltered = allRequirements.filter((r) => linkedIds.has(r.id))
              if (linkedFiltered.length > 0) filtered = linkedFiltered
            }
          } catch (err) {
            logger.warn('Failed to load traceability links for batch:', err)
          }
        }
        requirementsText = filtered
          .map((r) => `- [${r.category}/${r.priority}] ${r.description}`)
          .join('\n')
      }
    } catch (err) {
      logger.warn('Failed to load requirements for batch:', err)
    }

    // Load scoring
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
      logger.warn('Failed to load scoring model for batch:', err)
    }

    // Adjacent chapters
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

    const strategySeed = await readStrategySeed(projectId)
    const writingStyle = await writingStyleService.getProjectWritingStyle(projectId)
    const writingStyleText = serializeStyleForPrompt(writingStyle)
    const documentOutline = buildDocumentOutline(headings, chapter.heading)

    // ── Progressive batch: create orchestration and chain sub-chapter tasks ──
    // Story 3.12: generatedChaptersContext is rebuilt PER SUB-CHAPTER inside
    // `_dispatchBatchSingleSection` so that LCA-based 父级/同级/子章节/其他 labels
    // reflect the dispatched sub-chapter's tree position, not the parent's.
    // The parent markdown + heading list is stashed under internal keys so
    // dispatches can reconstruct a synthetic heading for each sub-section.
    const contextBase: Record<string, unknown> = {
      projectId,
      chapterTitle: target.title,
      chapterLevel: target.level,
      requirements: requirementsText,
      scoringWeights: scoringWeightsText,
      writingStyle: writingStyleText,
      documentOutline,
      adjacentChaptersBefore: adjacentBefore,
      adjacentChaptersAfter: adjacentAfter,
      strategySeed,
      target,
      baselineDigest,
      baselineSectionContent: chapter.contentLines.join('\n'),
      siblingSectionTitles: confirmedSkeleton.sections.map((section) => section.title),
      _batchParentMarkdown: markdown,
      _batchParentHeadings: headings,
      _batchParentHeading: chapter.heading,
    }

    const orchestration = batchOrchestrationManager.create({
      projectId,
      parentTarget: target,
      skeleton: confirmedSkeleton,
      sectionId,
      contextBase,
    })

    const firstSection = batchOrchestrationManager.getFirstSection(orchestration.id)
    if (!firstSection) {
      throw new BidWiseError(ErrorCode.NOT_FOUND, '骨架计划中没有子章节')
    }

    // Dispatch the first sub-chapter task
    const firstTaskId = await this._dispatchBatchSingleSection(
      orchestration.id,
      firstSection.index,
      firstSection.section,
      firstSection.previousSections,
      contextBase
    )

    batchOrchestrationManager.markRunning(orchestration.id, firstSection.index, firstTaskId)

    return { taskId: firstTaskId, batchId: orchestration.id }
  },

  /** Dispatch a single sub-chapter task within a progressive batch, with chain callback */
  async _dispatchBatchSingleSection(
    batchId: string,
    sectionIndex: number,
    section: { title: string; level: number; dimensions: string[]; guidanceHint?: string },
    previousSections: Array<{ title: string; markdown: string }>,
    contextBase: Record<string, unknown>
  ): Promise<string> {
    // Rebuild `generatedChaptersContext` relative to THIS sub-chapter. Using
    // the parent-anchored context would mislabel parent's siblings as 同级
    // and push the sub-chapter's true ancestors out of the 父级 group.
    const projectIdForCtx = contextBase.projectId as string | undefined
    const parentMarkdown = contextBase._batchParentMarkdown as string | undefined
    const parentHeadings = contextBase._batchParentHeadings as HeadingInfo[] | undefined
    const parentHeading = contextBase._batchParentHeading as HeadingInfo | undefined

    let perSectionContext: GeneratedChaptersContext | undefined
    if (projectIdForCtx && parentMarkdown && parentHeadings && parentHeading) {
      try {
        perSectionContext = await buildSubchapterGeneratedContext(
          projectIdForCtx,
          parentMarkdown,
          parentHeadings,
          parentHeading,
          { title: section.title, level: section.level }
        )
      } catch (err) {
        logger.warn(
          `buildSubchapterGeneratedContext failed for "${section.title}"; falling back to parent-anchored context: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    const response = await agentOrchestrator.executeWithCallback(
      {
        agentType: 'generate',
        context: {
          ...contextBase,
          generatedChaptersContext: perSectionContext,
          mode: 'skeleton-batch-single',
          batchId,
          sectionIndex,
          section,
          previousSections,
        },
        options: {
          timeoutMs: CHAPTER_TIMEOUT_MS,
          maxRetries: 0,
        },
      },
      (taskId, result) => {
        void this._onBatchSectionDone(batchId, sectionIndex, taskId, result)
      }
    )

    return response.taskId
  },

  /** Callback fired when a single sub-chapter task completes — chains the next one */
  async _onBatchSectionDone(
    batchId: string,
    sectionIndex: number,
    taskId: string,
    result: { status: 'completed' | 'failed' | 'cancelled'; content?: string; error?: string }
  ): Promise<void> {
    const orch = batchOrchestrationManager.get(batchId)
    if (!orch) {
      logger.warn(`_onBatchSectionDone: orchestration not found: ${batchId}`)
      return
    }

    if (result.status === 'completed' && result.content) {
      const advance = batchOrchestrationManager.onSectionComplete(
        batchId,
        sectionIndex,
        result.content
      )

      // Story 3.12: sub-chapter summary extraction is triggered by the
      // renderer AFTER batch-complete + document save lands — doing it here
      // would (a) summarise a document that has not yet been written, and
      // (b) fabricate occurrenceIndex: 0 regardless of duplicate-title
      // siblings within the batch.

      if (advance.allDone) {
        // All sections done — push section-complete then batch-complete
        const sectionPayload: BatchSectionProgressPayload = {
          kind: 'batch-section-complete',
          batchId,
          sectionIndex,
          sectionMarkdown: result.content,
          assembledSnapshot: advance.assembledSnapshot,
          completedCount: advance.completedCount,
          totalCount: advance.totalCount,
        }
        progressEmitter.emit({
          taskId,
          progress: 95,
          message: 'batch-section-complete',
          payload: sectionPayload,
        })

        const completePayload: BatchCompletePayload = {
          kind: 'batch-complete',
          batchId,
          assembledMarkdown: advance.assembledSnapshot,
          completedCount: advance.completedCount,
          totalCount: advance.totalCount,
          failedSections: advance.failedSections,
        }
        progressEmitter.emit({
          taskId,
          progress: 100,
          message: 'batch-complete',
          payload: completePayload,
        })
        // Cleanup skeleton metadata and in-memory orchestration
        void this._cleanupSkeletonAfterBatch(orch)
        batchOrchestrationManager.delete(batchId)
        return
      }

      // Chain: dispatch next section first, then emit with nextTaskId
      let nextTaskId: string | undefined
      let nextSectionIndex: number | undefined
      if (advance.nextSection) {
        try {
          nextTaskId = await this._dispatchBatchSingleSection(
            batchId,
            advance.nextSection.index,
            advance.nextSection.section,
            advance.nextSection.previousSections,
            orch.contextBase
          )
          nextSectionIndex = advance.nextSection.index
          batchOrchestrationManager.markRunning(batchId, advance.nextSection.index, nextTaskId)
        } catch (err) {
          logger.error(`Failed to chain next section after index ${sectionIndex}:`, err)
        }
      }

      // Push progressive update to renderer (includes nextTaskId for routing)
      const sectionPayload: BatchSectionProgressPayload = {
        kind: 'batch-section-complete',
        batchId,
        sectionIndex,
        sectionMarkdown: result.content,
        assembledSnapshot: advance.assembledSnapshot,
        completedCount: advance.completedCount,
        totalCount: advance.totalCount,
        nextTaskId,
        nextSectionIndex,
      }
      progressEmitter.emit({
        taskId,
        progress: Math.round((advance.completedCount / advance.totalCount) * 100),
        message: 'batch-section-complete',
        payload: sectionPayload,
      })
    } else {
      // Failed or cancelled
      const errorMsg = result.error ?? (result.status === 'cancelled' ? '任务已取消' : '生成失败')
      const RETRY_DELAYS = [5, 10, 30] as const
      const MAX_AUTO_RETRIES = RETRY_DELAYS.length
      const currentRetryCount = batchOrchestrationManager.getRetryCount(batchId, sectionIndex)

      if (result.status !== 'cancelled' && currentRetryCount < MAX_AUTO_RETRIES) {
        // Auto-retry with exponential backoff
        const retryCount = batchOrchestrationManager.incrementRetryCount(batchId, sectionIndex)
        const delaySeconds = RETRY_DELAYS[retryCount - 1]
        batchOrchestrationManager.markRetrying(batchId, sectionIndex)

        const retryingPayload: BatchSectionRetryingPayload = {
          kind: 'batch-section-retrying',
          batchId,
          sectionIndex,
          sectionTitle: orch.sections[sectionIndex]?.section.title ?? '',
          retryCount,
          maxRetries: MAX_AUTO_RETRIES,
          retryInSeconds: delaySeconds,
        }
        const advance = batchOrchestrationManager.onSectionFailed(batchId, sectionIndex, errorMsg)
        // Revert to retrying (onSectionFailed marks as failed, but we want retrying)
        batchOrchestrationManager.markRetrying(batchId, sectionIndex)
        progressEmitter.emit({
          taskId,
          progress: Math.round((advance.completedCount / advance.totalCount) * 100),
          message: 'batch-section-retrying',
          payload: retryingPayload,
        })

        logger.info(
          `Auto-retry section ${sectionIndex} (attempt ${retryCount}/${MAX_AUTO_RETRIES}) in ${delaySeconds}s`
        )

        // Schedule retry after delay
        const emitRetryFailure = (reason: string): void => {
          const sectionTitle = orch.sections[sectionIndex]?.section.title ?? ''
          batchOrchestrationManager.onSectionFailed(batchId, sectionIndex, reason)
          const failPayload: BatchSectionFailedPayload = {
            kind: 'batch-section-failed',
            batchId,
            sectionIndex,
            sectionTitle,
            error: reason,
            completedCount: orch.sections.filter((s) => s.state === 'completed').length,
            totalCount: orch.sections.length,
          }
          progressEmitter.emit({
            taskId,
            progress: Math.round((failPayload.completedCount / failPayload.totalCount) * 100),
            message: 'batch-section-failed',
            payload: failPayload,
          })
        }

        setTimeout(() => {
          const retryContext = batchOrchestrationManager.prepareRetry(batchId, sectionIndex)
          if (!retryContext) {
            logger.warn(
              `Auto-retry: prepareRetry returned undefined for batch ${batchId} section ${sectionIndex}`
            )
            emitRetryFailure('自动重试失败：无法准备重试上下文')
            return
          }
          void this._dispatchBatchSingleSection(
            batchId,
            sectionIndex,
            retryContext.section,
            retryContext.previousSections,
            retryContext.contextBase
          )
            .then((newTaskId) => {
              batchOrchestrationManager.markRunning(batchId, sectionIndex, newTaskId)
              // Emit retrying payload on OLD taskId (renderer knows it) with newTaskId for routing
              const handoffPayload: BatchSectionRetryingPayload = {
                kind: 'batch-section-retrying',
                batchId,
                sectionIndex,
                sectionTitle: orch.sections[sectionIndex]?.section.title ?? '',
                retryCount,
                maxRetries: MAX_AUTO_RETRIES,
                retryInSeconds: 0,
                newTaskId,
              }
              progressEmitter.emit({
                taskId,
                progress: Math.round(
                  (batchOrchestrationManager
                    .get(batchId)!
                    .sections.filter((s) => s.state === 'completed').length /
                    orch.sections.length) *
                    100
                ),
                message: 'batch-section-retrying',
                payload: handoffPayload,
              })
            })
            .catch((err) => {
              logger.error(`Auto-retry dispatch failed for section ${sectionIndex}:`, err)
              emitRetryFailure(`自动重试失败：${err instanceof Error ? err.message : '派发错误'}`)
            })
        }, delaySeconds * 1000)
      } else {
        // Budget exhausted or cancelled — emit failure
        const advance = batchOrchestrationManager.onSectionFailed(batchId, sectionIndex, errorMsg)

        const failPayload: BatchSectionFailedPayload = {
          kind: 'batch-section-failed',
          batchId,
          sectionIndex,
          sectionTitle: orch.sections[sectionIndex]?.section.title ?? '',
          error: errorMsg,
          completedCount: advance.completedCount,
          totalCount: advance.totalCount,
        }
        progressEmitter.emit({
          taskId,
          progress: Math.round((advance.completedCount / advance.totalCount) * 100),
          message: 'batch-section-failed',
          payload: failPayload,
        })
      }
    }
  },

  /** Retry a single failed section within a batch orchestration */
  async batchRetrySection(
    projectId: string,
    batchId: string,
    sectionIndex?: number
  ): Promise<{ taskId: string; batchId: string; sectionIndex: number }> {
    const orch = batchOrchestrationManager.get(batchId)
    if (!orch) {
      throw new ValidationError(`BatchOrchestration not found: ${batchId}`)
    }
    if (orch.projectId !== projectId) {
      throw new ValidationError('Project ID does not match batch orchestration')
    }

    // Auto-detect first failed section when index not provided
    const resolvedIndex = sectionIndex ?? orch.sections.find((s) => s.state === 'failed')?.index
    if (resolvedIndex === undefined) {
      throw new ValidationError(`No failed section found in batch ${batchId}`)
    }

    // Reset retry budget for manual retry
    batchOrchestrationManager.resetRetryCount(batchId, resolvedIndex)

    const retryContext = batchOrchestrationManager.prepareRetry(batchId, resolvedIndex)
    if (!retryContext) {
      throw new ValidationError(`Section ${resolvedIndex} not found in batch ${batchId}`)
    }

    const taskId = await this._dispatchBatchSingleSection(
      batchId,
      resolvedIndex,
      retryContext.section,
      retryContext.previousSections,
      retryContext.contextBase
    )
    batchOrchestrationManager.markRunning(batchId, resolvedIndex, taskId)

    return { taskId, batchId, sectionIndex: resolvedIndex }
  },

  /** Skip a failed section, write placeholder content, and continue the chain */
  async batchSkipSection(
    projectId: string,
    batchId: string,
    sectionIndex?: number
  ): Promise<{
    batchId: string
    skippedSectionIndex: number
    nextTaskId?: string
    nextSectionIndex?: number
    assembledSnapshot?: string
  }> {
    const orch = batchOrchestrationManager.get(batchId)
    if (!orch) {
      throw new ValidationError(`BatchOrchestration not found: ${batchId}`)
    }
    if (orch.projectId !== projectId) {
      throw new ValidationError('Project ID does not match batch orchestration')
    }

    // Auto-detect first failed section when index not provided
    const resolvedIndex = sectionIndex ?? orch.sections.find((s) => s.state === 'failed')?.index
    if (resolvedIndex === undefined) {
      throw new ValidationError(`No failed section found in batch ${batchId}`)
    }

    const placeholderContent = '> [已跳过 - 请手动补充]'

    // Delete the skipped section's failed task from the queue so it does not
    // rehydrate as a stale error on next app launch.
    const skippedTaskId = orch.sections[resolvedIndex]?.taskId
    if (skippedTaskId) {
      try {
        await taskQueue.delete(skippedTaskId)
      } catch (err) {
        logger.warn(`Failed to delete skipped section task ${skippedTaskId}:`, err)
      }
    }

    // Mark section as completed with placeholder
    const advance = batchOrchestrationManager.onSectionComplete(
      batchId,
      resolvedIndex,
      placeholderContent
    )

    if (advance.allDone) {
      // Terminal: purge every remaining section taskId so restart shows a clean slate.
      for (const section of orch.sections) {
        if (!section.taskId || section.taskId === skippedTaskId) continue
        try {
          await taskQueue.delete(section.taskId)
        } catch (err) {
          logger.warn(`Failed to delete batch section task ${section.taskId}:`, err)
        }
      }

      // All sections done — emit batch-complete
      const completePayload: BatchCompletePayload = {
        kind: 'batch-complete',
        batchId,
        assembledMarkdown: advance.assembledSnapshot,
        completedCount: advance.completedCount,
        totalCount: advance.totalCount,
        failedSections: advance.failedSections,
      }
      // Use the last known taskId for progress routing
      const lastTaskId = orch.sections[resolvedIndex]?.taskId ?? ''
      progressEmitter.emit({
        taskId: lastTaskId,
        progress: 100,
        message: 'batch-complete',
        payload: completePayload,
      })
      void this._cleanupSkeletonAfterBatch(orch)
      batchOrchestrationManager.delete(batchId)

      return {
        batchId,
        skippedSectionIndex: resolvedIndex,
        assembledSnapshot: advance.assembledSnapshot,
      }
    }

    // Dispatch next section
    let nextTaskId: string | undefined
    let nextSectionIndex: number | undefined
    if (advance.nextSection) {
      nextTaskId = await this._dispatchBatchSingleSection(
        batchId,
        advance.nextSection.index,
        advance.nextSection.section,
        advance.nextSection.previousSections,
        orch.contextBase
      )
      nextSectionIndex = advance.nextSection.index
      batchOrchestrationManager.markRunning(batchId, advance.nextSection.index, nextTaskId)
    }

    // Emit section-complete with placeholder content so renderer updates
    const sectionPayload: BatchSectionProgressPayload = {
      kind: 'batch-section-complete',
      batchId,
      sectionIndex: resolvedIndex,
      sectionMarkdown: placeholderContent,
      assembledSnapshot: advance.assembledSnapshot,
      completedCount: advance.completedCount,
      totalCount: advance.totalCount,
      nextTaskId,
      nextSectionIndex,
    }
    const lastTaskId = orch.sections[resolvedIndex]?.taskId ?? ''
    progressEmitter.emit({
      taskId: lastTaskId,
      progress: Math.round((advance.completedCount / advance.totalCount) * 100),
      message: 'batch-section-complete',
      payload: sectionPayload,
    })

    return {
      batchId,
      skippedSectionIndex: resolvedIndex,
      nextTaskId,
      nextSectionIndex,
      assembledSnapshot: advance.assembledSnapshot,
    }
  },

  /** Cleanup skeleton metadata after progressive batch completes */
  async _cleanupSkeletonAfterBatch(orch: {
    projectId: string
    sectionId: string
    skeleton: SkeletonExpandPlan
  }): Promise<void> {
    try {
      await documentService.updateMetadata(orch.projectId, (current) => {
        if (!current.confirmedSkeletons) return current
        const existing = current.confirmedSkeletons[orch.sectionId]
        if (!existing || existing.confirmedAt !== orch.skeleton.confirmedAt) return current
        const { [orch.sectionId]: _, ...rest } = current.confirmedSkeletons
        const hasRemaining = Object.keys(rest).length > 0
        return {
          ...current,
          confirmedSkeletons: hasRemaining ? rest : undefined,
        }
      })
      logger.info(`Cleaned up confirmedSkeletons[${orch.sectionId}] after progressive batch`)
    } catch (err) {
      logger.warn(`Failed to cleanup skeleton after batch for ${orch.sectionId}:`, err)
    }
  },

  /** Fire-and-forget: poll task status and remove confirmedSkeletons entry on completion.
   *  Uses confirmedAt as a version guard — only deletes if the stored plan matches
   *  the one that was active when this batch was dispatched. */
  async _cleanupSkeletonOnCompletion(
    projectId: string,
    sectionId: string,
    taskId: string,
    expectedConfirmedAt: string
  ): Promise<void> {
    const pollIntervalMs = 5_000
    const maxPolls = 150 // 12.5 minutes max
    for (let i = 0; i < maxPolls; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      try {
        const status = await agentOrchestrator.getAgentStatus(taskId)
        if (status.status === 'failed' || status.status === 'cancelled') {
          // Failed/cancelled: keep the plan in metadata so user can retry batch
          logger.info(
            `Skeleton cleanup skipped for ${sectionId}: task ${taskId} ${status.status}, preserving plan for retry`
          )
          return
        }
        if (status.status === 'completed') {
          await documentService.updateMetadata(projectId, (current) => {
            if (!current.confirmedSkeletons) return current
            const existing = current.confirmedSkeletons[sectionId]
            // Compare-and-swap: only delete if confirmedAt matches the batch we dispatched
            if (!existing || existing.confirmedAt !== expectedConfirmedAt) {
              logger.info(
                `Skeleton cleanup skipped for ${sectionId}: plan was replaced (expected=${expectedConfirmedAt}, found=${existing?.confirmedAt ?? 'none'})`
              )
              return current
            }
            const { [sectionId]: _, ...rest } = current.confirmedSkeletons
            const hasRemaining = Object.keys(rest).length > 0
            return {
              ...current,
              confirmedSkeletons: hasRemaining ? rest : undefined,
            }
          })
          logger.info(
            `Cleaned up confirmedSkeletons[${sectionId}] after task ${taskId} ${status.status}`
          )
          return
        }
      } catch (err) {
        logger.warn(`Skeleton cleanup poll error for task ${taskId}:`, err)
      }
    }
    logger.warn(`Skeleton cleanup timed out for task ${taskId}, sectionId=${sectionId}`)
  },

  /** Resolve sectionId from proposal.meta.json sectionIndex by matching heading locator */
  async _resolveSectionId(
    projectId: string,
    target: ChapterHeadingLocator
  ): Promise<string | undefined> {
    try {
      const metadata = await documentService.getMetadata(projectId)
      if (!metadata.sectionIndex || metadata.sectionIndex.length === 0) return undefined

      const entry = metadata.sectionIndex.find(
        (s) =>
          s.headingLocator.title === target.title &&
          s.headingLocator.level === target.level &&
          s.headingLocator.occurrenceIndex === target.occurrenceIndex
      )
      return entry?.sectionId
    } catch (err) {
      logger.warn('Failed to resolve sectionId from metadata:', err)
      return undefined
    }
  },
}
