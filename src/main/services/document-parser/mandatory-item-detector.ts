import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { getDb } from '@main/db/client'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  ParsedTender,
  MandatoryItem,
  MandatoryItemStatus,
  MandatoryItemSummary,
  MandatoryItemsSnapshot,
  DetectMandatoryResult,
} from '@shared/analysis-types'

const logger = createLogger('mandatory-item-detector')

const POLL_INTERVAL_MS = 1_000
const DETECTION_TIMEOUT_MS = 5 * 60 * 1_000

interface RawMandatoryItem {
  content?: string
  sourceText?: string
  sourcePages?: number[]
  confidence?: number
}

interface ExplicitMarkedItemMatch {
  marker: '*' | '★'
  clauseNumber: string
  heading: string
  sourceText: string
  sourcePages: number[]
}

/** Extract JSON from a string that may be wrapped in markdown code fences or contain prose */
function extractJsonFromResponse(text: string): string {
  // Try code fence first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Try raw JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  // Try raw JSON object (fallback)
  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  return text.trim()
}

function parseMandatoryResponse(content: string): RawMandatoryItem[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.MANDATORY_DETECTION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  // Support both array and object-with-array formats
  if (Array.isArray(parsed)) {
    return parsed as RawMandatoryItem[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    // Check for common wrapper keys
    for (const key of ['items', 'mandatoryItems', 'mandatory_items', 'results']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawMandatoryItem[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.MANDATORY_DETECTION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

/** CJK character range test */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/

/** Tokenize text into a set of tokens — uses character bigrams for CJK, whitespace words otherwise */
function tokenize(text: string): Set<string> {
  const cleaned = text.replace(/[，。、；：""''（）【】《》？！,.:;!?()[\]{}"']/g, ' ')
  const tokens = new Set<string>()

  // Split by whitespace to get chunks
  const chunks = cleaned.split(/\s+/).filter((c) => c.length > 0)
  for (const chunk of chunks) {
    if (CJK_RE.test(chunk)) {
      // Generate character bigrams for CJK text
      for (let i = 0; i < chunk.length - 1; i++) {
        tokens.add(chunk.slice(i, i + 2))
      }
      // Also add individual CJK chars for short terms
      if (chunk.length <= 2) {
        for (const ch of chunk) {
          if (CJK_RE.test(ch)) tokens.add(ch)
        }
      }
    } else if (chunk.length >= 2) {
      tokens.add(chunk.toLowerCase())
    }
  }
  return tokens
}

/** Auto-link mandatory items to requirements via token overlap (CJK-aware) */
function autoLinkToRequirements(
  items: MandatoryItem[],
  requirements: Array<{ id: string; description: string }>
): void {
  // Pre-tokenize requirements
  const reqTokens = requirements.map((req) => ({
    id: req.id,
    tokens: tokenize(req.description),
  }))

  for (const item of items) {
    if (item.linkedRequirementId) continue

    const itemTokens = tokenize(item.content)
    if (itemTokens.size === 0) continue

    let bestMatch: { id: string; score: number } | null = null

    for (const req of reqTokens) {
      if (req.tokens.size === 0) continue

      let overlap = 0
      for (const token of itemTokens) {
        if (req.tokens.has(token)) overlap++
      }

      const score = overlap / Math.max(itemTokens.size, req.tokens.size)
      if (score > 0.2 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: req.id, score }
      }
    }

    if (bestMatch) {
      item.linkedRequirementId = bestMatch.id
    }
  }
}

/** Matches ★ / * items with a dotted clause number, e.g. `*8.2.2.7 自动生成模块` */
const MARKED_ITEM_NUMBERED_RE =
  /(?:^|\n)\s*(?:\d+[、.．)]\s*)?(?:第[一二三四五六七八九十百0-9]+章\s*)?(?:(?:供货|采购|技术)(?:要求|参数)|项目需求)?\s*[-：:]?\s*([*★])\s*([0-9]+(?:\.[0-9]+)+)\s*([^\n]*)/g

/** Matches ★ / * items without a dotted clause number, e.g. `★支持...` or `★（1）支持...` */
const MARKED_ITEM_BARE_RE =
  /(?:^|\n)\s*(?:\d+[、.．)]\s*)?(?:第[一二三四五六七八九十百0-9]+章\s*)?(?:(?:供货|采购|技术)(?:要求|参数)|项目需求)?\s*[-：:]?\s*([*★])\s*(?:[（(]\d+[)）]\s*)?([^\n]*)/g

/** Inline variant for section-level scanning — numbered items */
const INLINE_MARKED_ITEM_NUMBERED_RE =
  /(?:^|[\s（(])(?:\d+[、.．)]\s*)?(?:第[一二三四五六七八九十百0-9]+章\s*)?(?:(?:供货|采购|技术)(?:要求|参数)|项目需求)?\s*[-：:]?\s*([*★])\s*([0-9]+(?:\.[0-9]+)+)\s*/g

/** Inline variant for section-level scanning — bare (no clause number) items */
const INLINE_MARKED_ITEM_BARE_RE =
  /(?:^|[\s（(])(?:\d+[、.．)]\s*)?(?:第[一二三四五六七八九十百0-9]+章\s*)?(?:(?:供货|采购|技术)(?:要求|参数)|项目需求)?\s*[-：:]?\s*([*★])\s*(?:[（(]\d+[)）]\s*)?([^\n]*)/g

/**
 * Lines that mention ★ / * in a descriptive/instructional context rather than marking an actual item.
 * These are filtered out to avoid false positives.
 */
const STAR_NOISE_RE =
  /(?:加注星号|带[*★]|标注星号|[*★]号(?:指标|项|条款)|[*★][""]|[""][*★]|[*★]或[★*]|[★*]或[*★]|对[*★]号|仔细阅读)/

function expandPageRange(pageStart: number, pageEnd: number): number[] {
  if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd)) return []

  const start = Math.max(1, Math.trunc(pageStart))
  const end = Math.max(start, Math.trunc(pageEnd))
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[“”"'`]/g, '')
    .trim()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keepUsefulPages(pages: number[], totalPages: number): number[] {
  if (pages.length === 0) return []
  if (pages.length >= totalPages) return []
  if (pages.length > 6) return []
  return pages
}

function sanitizeMarkedExcerpt(excerpt: string): string {
  return excerpt
    .replace(/^\s*\d+[、.．)]\s*/, '')
    .replace(/^\s*第[一二三四五六七八九十百0-9]+章\s*/, '')
    .replace(/^\s*(?:(?:供货|采购|技术)(?:要求|参数)|项目需求)\s*[-：:]?\s*/, '')
    .replace(/(?:^|\n)\s*技术支持资料[:：]?\s*/gu, '\n')
    .replace(/\n+\s*技术支持资料[:：]?\s*$/u, '')
    .replace(/\s*技术支持资料[:：]?\s*$/u, '')
    .replace(/\s*[（(](?:如有遗漏|投标人需将加注星号)[\s\S]*$/u, '')
    .replace(/^\s*[*★]\s*(?:[（(]\d+[)）]\s*)?/, '')
    .trim()
}

function summarizeMarkedItem(
  marker: '*' | '★',
  clauseNumber: string,
  heading: string,
  sourceText: string
): string {
  const cleanedHeading = heading
    .replace(/^\s*[-：:]/, '')
    .replace(/^\s*[（(]\d+[)）]\s*/, '')
    .replace(/[，,。；;：:]+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  const strippedSource = clauseNumber
    ? sourceText.replace(
        new RegExp(`^[${escapeRegExp(marker)}]\\s*${escapeRegExp(clauseNumber)}\\s*`),
        ''
      )
    : sourceText.replace(new RegExp(`^[${escapeRegExp(marker)}]\\s*(?:[（(]\\d+[)）]\\s*)?`), '')

  const fallback = strippedSource
    .replace(/\s+/g, ' ')
    .replace(/[，,。；;：:]+.*$/, '')
    .trim()

  const summary = (cleanedHeading || fallback).slice(0, 36).trim()
  const prefix = clauseNumber ? `${marker}${clauseNumber}` : `${marker}`
  return `${prefix}${summary ? ` ${summary}` : ''}`
}

function resolveMarkedItemPages(
  clauseNumber: string,
  heading: string,
  sourceText: string,
  sections: ParsedTender['sections'],
  totalPages: number
): number[] {
  const clauseNeedle = clauseNumber.trim()
  const headingNeedle = normalizeSearchText(heading).slice(0, 24)
  const strippedSource = clauseNeedle
    ? normalizeSearchText(sourceText).replace(
        new RegExp(`^[*★]\\s*${escapeRegExp(clauseNumber)}`),
        ''
      )
    : normalizeSearchText(sourceText).replace(/^[*★]\s*(?:[（(]\d+[)）])?\s*/, '')
  const sourceNeedle = strippedSource.slice(0, 36)

  let bestMatch: { score: number; pages: number[] } | null = null

  for (const section of sections) {
    const haystack = normalizeSearchText(section.content)
    let score = 0

    if (clauseNeedle && haystack.includes(clauseNeedle)) score += 100
    if (headingNeedle && haystack.includes(headingNeedle)) score += 30
    if (sourceNeedle && haystack.includes(sourceNeedle)) score += 10
    if (/技术支持资料/.test(section.title)) score += 15

    if (score === 0) continue

    const pages = expandPageRange(section.pageStart, section.pageEnd)
    score -= pages.length

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { score, pages }
    }
  }

  return bestMatch ? keepUsefulPages(bestMatch.pages, totalPages) : []
}

function materializeExplicitMarkedItem(
  marker: string,
  clauseNumber: string,
  heading: string,
  sourceText: string,
  sourcePages: number[]
): ExplicitMarkedItemMatch | null {
  const normalizedMarker = marker === '★' ? '★' : '*'
  const cleanedSourceText = sanitizeMarkedExcerpt(sourceText)
  if (!cleanedSourceText) return null

  return {
    marker: normalizedMarker,
    clauseNumber,
    heading: heading.trim(),
    sourceText: cleanedSourceText,
    sourcePages,
  }
}

interface RawStartMatch {
  index: number
  marker: string
  clauseNumber: string
  heading: string
}

/** Collect all ★ / * start positions from raw text using both numbered and bare regexes. */
function collectStartMatches(normalizedText: string): RawStartMatch[] {
  const seen = new Set<number>()
  const results: RawStartMatch[] = []

  // Numbered matches first (higher priority — they capture the clause number)
  for (const m of normalizedText.matchAll(MARKED_ITEM_NUMBERED_RE)) {
    if (m.index === undefined) continue
    seen.add(m.index)
    results.push({
      index: m.index,
      marker: m[1] ?? '*',
      clauseNumber: m[2]?.trim() ?? '',
      heading: (m[3] ?? '').trim(),
    })
  }

  // Bare matches (no clause number) — skip positions already covered by numbered regex
  for (const m of normalizedText.matchAll(MARKED_ITEM_BARE_RE)) {
    if (m.index === undefined || seen.has(m.index)) continue
    const heading = (m[2] ?? '').trim()
    // Filter out noise lines that describe star marks rather than being star items
    if (STAR_NOISE_RE.test(heading)) continue
    // Require at least some substantive content after the marker
    if (heading.length < 4) continue
    seen.add(m.index)
    results.push({
      index: m.index,
      marker: m[1] ?? '*',
      clauseNumber: '',
      heading,
    })
  }

  results.sort((a, b) => a.index - b.index)
  return results
}

function extractMarkedItemsFromRawText(
  rawText: string,
  sections: ParsedTender['sections'],
  totalPages: number
): ExplicitMarkedItemMatch[] {
  const normalizedText = rawText.replace(/\r\n?/g, '\n')
  const starts = collectStartMatches(normalizedText)
  const items: ExplicitMarkedItemMatch[] = []

  for (let index = 0; index < starts.length; index++) {
    const match = starts[index]
    if (!match) continue

    const nextMatch = starts[index + 1]
    const sliceStart = match.index
    const sliceEnd = nextMatch?.index ?? normalizedText.length
    const sourceText = normalizedText.slice(sliceStart, sliceEnd)
    const { marker, clauseNumber, heading } = match

    const materialized = materializeExplicitMarkedItem(
      marker,
      clauseNumber,
      heading,
      sourceText,
      resolveMarkedItemPages(clauseNumber, heading, sourceText, sections, totalPages)
    )

    if (materialized) {
      items.push(materialized)
    }
  }

  return items
}

/** Collect inline start matches from a section's content using both numbered and bare regexes. */
function collectInlineStartMatches(content: string): RawStartMatch[] {
  const seen = new Set<number>()
  const results: RawStartMatch[] = []

  for (const m of content.matchAll(INLINE_MARKED_ITEM_NUMBERED_RE)) {
    if (m.index === undefined) continue
    seen.add(m.index)
    results.push({
      index: m.index,
      marker: m[1] ?? '*',
      clauseNumber: m[2]?.trim() ?? '',
      heading: '',
    })
  }

  for (const m of content.matchAll(INLINE_MARKED_ITEM_BARE_RE)) {
    if (m.index === undefined || seen.has(m.index)) continue
    const heading = (m[2] ?? '').trim()
    if (STAR_NOISE_RE.test(heading)) continue
    if (heading.length < 4) continue
    seen.add(m.index)
    results.push({
      index: m.index,
      marker: m[1] ?? '*',
      clauseNumber: '',
      heading,
    })
  }

  results.sort((a, b) => a.index - b.index)
  return results
}

function extractMarkedItemsFromSections(
  sections: ParsedTender['sections'],
  totalPages: number
): ExplicitMarkedItemMatch[] {
  const items: ExplicitMarkedItemMatch[] = []

  for (const section of sections) {
    const starts = collectInlineStartMatches(section.content)
    if (starts.length === 0) continue

    for (let index = 0; index < starts.length; index++) {
      const match = starts[index]
      if (!match) continue

      const nextMatch = starts[index + 1]
      const sliceStart = match.index
      const sliceEnd = nextMatch?.index ?? section.content.length
      const sourceText = section.content.slice(sliceStart, sliceEnd)
      const { marker, clauseNumber } = match

      const normalizedBody = sourceText.replace(/\s+/g, ' ').trim()
      const heading = clauseNumber
        ? normalizedBody
            .replace(
              new RegExp(`^[^*★]*[${escapeRegExp(marker)}]\\s*${escapeRegExp(clauseNumber)}\\s*`),
              ''
            )
            .slice(0, 36)
            .trim()
        : normalizedBody
            .replace(new RegExp(`^[^*★]*[${escapeRegExp(marker)}]\\s*(?:[（(]\\d+[)）]\\s*)?`), '')
            .slice(0, 36)
            .trim()

      const materialized = materializeExplicitMarkedItem(
        marker,
        clauseNumber,
        heading,
        sourceText,
        keepUsefulPages(expandPageRange(section.pageStart, section.pageEnd), totalPages)
      )

      if (materialized) {
        items.push(materialized)
      }
    }
  }

  return items
}

function deduplicateRawMandatoryItems<T extends { content?: string; sourceText?: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.content ?? ''}::${item.sourceText ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function choosePreferredRawItem(
  current: RawMandatoryItem,
  candidate: RawMandatoryItem
): RawMandatoryItem {
  const currentPageCount = Array.isArray(current.sourcePages) ? current.sourcePages.length : 0
  const candidatePageCount = Array.isArray(candidate.sourcePages) ? candidate.sourcePages.length : 0

  if (candidatePageCount > 0 && currentPageCount === 0) return candidate
  if (candidatePageCount === 0 && currentPageCount > 0) return current
  if (candidatePageCount !== currentPageCount) {
    return candidatePageCount < currentPageCount ? candidate : current
  }

  const currentHasNoise = /(?:^|\n)\s*(?:十一、技术支持资料|技术支持资料[:：]?|加注星号)/u.test(
    current.sourceText ?? ''
  )
  const candidateHasNoise = /(?:^|\n)\s*(?:十一、技术支持资料|技术支持资料[:：]?|加注星号)/u.test(
    candidate.sourceText ?? ''
  )
  if (currentHasNoise !== candidateHasNoise) {
    return candidateHasNoise ? current : candidate
  }

  const currentSourceLength = (current.sourceText ?? '').length
  const candidateSourceLength = (candidate.sourceText ?? '').length
  if (candidateSourceLength !== currentSourceLength) {
    return candidateSourceLength < currentSourceLength ? candidate : current
  }

  const currentConfidence = typeof current.confidence === 'number' ? current.confidence : 0
  const candidateConfidence = typeof candidate.confidence === 'number' ? candidate.confidence : 0
  return candidateConfidence > currentConfidence ? candidate : current
}

function deduplicateByContent(items: RawMandatoryItem[]): RawMandatoryItem[] {
  const byContent = new Map<string, RawMandatoryItem>()

  for (const item of items) {
    const content = (item.content ?? '').trim()
    if (!content) continue

    const existing = byContent.get(content)
    byContent.set(content, existing ? choosePreferredRawItem(existing, item) : item)
  }

  return [...byContent.values()]
}

function extractExplicitMarkedItems(tender: ParsedTender): RawMandatoryItem[] {
  const directMatches = extractMarkedItemsFromRawText(
    tender.rawText,
    tender.sections,
    tender.totalPages
  )
  const fallbackMatches =
    directMatches.length > 0
      ? []
      : extractMarkedItemsFromSections(tender.sections, tender.totalPages)

  return deduplicateByContent(
    deduplicateRawMandatoryItems([...directMatches, ...fallbackMatches]).map((item) => ({
      content: summarizeMarkedItem(item.marker, item.clauseNumber, item.heading, item.sourceText),
      sourceText: item.sourceText,
      sourcePages: item.sourcePages,
      confidence: 0.98,
    }))
  )
}

export class MandatoryItemDetector {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()

  async detect(input: { projectId: string }): Promise<DetectMandatoryResult> {
    const { projectId } = input

    // Validate project
    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `项目未设置存储路径: ${projectId}`
      )
    }

    // Load parsed tender
    const tenderParsedPath = path.join(project.rootPath, 'tender', 'tender-parsed.json')
    let tender: ParsedTender
    try {
      const content = await fs.readFile(tenderParsedPath, 'utf-8')
      tender = JSON.parse(content) as ParsedTender
    } catch {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `招标文件解析结果不存在或无法读取: ${tenderParsedPath}`
      )
    }

    // Load existing requirements for cross-reference
    const existingRequirements = await this.requirementRepo.findByProject(projectId)

    // Enqueue outer task
    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, rootPath: project.rootPath },
    })

    // Fire-and-forget execution
    const mandatoryItemRepo = this.mandatoryItemRepo
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在扫描显式 * / ★ 技术条款...')

        let rawItems = extractExplicitMarkedItems(tender)

        if (rawItems.length === 0) {
          ctx.updateProgress(10, '未发现显式 * / ★ 标记，正在回退到 AI 识别...')
          const agentResponse = await agentOrchestrator.execute({
            agentType: 'extract',
            context: {
              mode: 'mandatory-items',
              sections: tender.sections,
              rawText: tender.rawText,
              totalPages: tender.totalPages,
              hasScannedContent: tender.hasScannedContent,
              existingRequirements,
            },
          })

          const innerTaskId = agentResponse.taskId
          let agentResult: string | undefined
          const pollingStartedAt = Date.now()

          while (true) {
            if (Date.now() - pollingStartedAt >= DETECTION_TIMEOUT_MS) {
              throw new BidWiseError(
                ErrorCode.MANDATORY_DETECTION_FAILED,
                'AI *项检测超时（超过 5 分钟），请重试'
              )
            }

            const status = await agentOrchestrator.getAgentStatus(innerTaskId)

            if (status.status === 'completed') {
              agentResult = status.result?.content
              break
            }

            if (status.status === 'failed') {
              throw new BidWiseError(
                ErrorCode.MANDATORY_DETECTION_FAILED,
                `AI *项检测失败: ${status.error?.message ?? '未知错误'}`
              )
            }

            if (status.status === 'cancelled') {
              throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI *项检测任务已取消')
            }

            const progressPct = Math.min(20 + status.progress * 0.6, 80)
            ctx.updateProgress(progressPct, '未发现显式标记，正在调用 AI 识别...')

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          }

          if (!agentResult) {
            throw new BidWiseError(ErrorCode.MANDATORY_DETECTION_FAILED, 'AI 返回结果为空')
          }

          ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
          rawItems = parseMandatoryResponse(agentResult)
        } else {
          ctx.updateProgress(85, '已识别显式 * / ★ 条款，正在解析和持久化...')
        }

        const now = new Date().toISOString()
        const items: MandatoryItem[] = rawItems
          .map((raw) => ({
            id: uuidv4(),
            content: (raw.content ?? '').trim(),
            sourceText: (raw.sourceText ?? '').trim(),
            sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages : [],
            confidence:
              typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.5,
            status: 'detected' as MandatoryItemStatus,
            linkedRequirementId: null,
            detectedAt: now,
            updatedAt: now,
          }))
          .filter((item) => item.content.length > 0)

        // Deduplicate by content (keep first occurrence) before persisting
        const seenContent = new Set<string>()
        const uniqueItems = items.filter((item) => {
          if (seenContent.has(item.content)) return false
          seenContent.add(item.content)
          return true
        })

        // Auto-link to requirements
        autoLinkToRequirements(uniqueItems, existingRequirements)

        // Step 4: Atomically replace old data (transaction: delete + insert)
        await mandatoryItemRepo.replaceByProject(projectId, uniqueItems)

        // Step 5: Write snapshot (uses same deduplicated list to stay in sync with DB)
        const snapshot: MandatoryItemsSnapshot = {
          projectId,
          items: uniqueItems,
          detectedAt: now,
        }
        const snapshotPath = path.join(rootPath, 'tender', 'mandatory-items.json')
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

        ctx.updateProgress(100, '*项检测完成')
        logger.info(
          `Mandatory item detection complete for project ${projectId}: ${uniqueItems.length} items found`
        )
        return uniqueItems
      })
      .catch((err) => {
        logger.error(`Mandatory detection task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getItems(projectId: string): Promise<MandatoryItem[] | null> {
    const items = await this.mandatoryItemRepo.findByProject(projectId)
    if (items.length > 0) {
      return items
    }

    // Check if detection was ever run by looking for snapshot
    const project = await this.projectRepo.findById(projectId)
    if (project.rootPath) {
      const snapshotPath = path.join(project.rootPath, 'tender', 'mandatory-items.json')
      try {
        await fs.access(snapshotPath)
        return [] // Detection ran but found 0 items
      } catch {
        // Snapshot doesn't exist — never run
      }
    }

    return null // Never executed
  }

  async getSummary(projectId: string): Promise<MandatoryItemSummary | null> {
    const items = await this.getItems(projectId)
    if (items === null) return null

    return {
      total: items.length,
      confirmed: items.filter((i) => i.status === 'confirmed').length,
      dismissed: items.filter((i) => i.status === 'dismissed').length,
      pending: items.filter((i) => i.status === 'detected').length,
    }
  }

  async updateItem(
    id: string,
    patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
  ): Promise<MandatoryItem> {
    // Validate linkedRequirementId belongs to the same project
    if (patch.linkedRequirementId) {
      const projectId = await this.mandatoryItemRepo.findProjectId(id)
      if (!projectId) {
        throw new BidWiseError(ErrorCode.MANDATORY_DETECTION_FAILED, `必响应项不存在: ${id}`)
      }
      const req = await getDb()
        .selectFrom('requirements')
        .select('projectId')
        .where('id', '=', patch.linkedRequirementId)
        .executeTakeFirst()
      if (!req || req.projectId !== projectId) {
        throw new BidWiseError(
          ErrorCode.MANDATORY_DETECTION_FAILED,
          `关联的需求不存在或不属于同一项目: ${patch.linkedRequirementId}`
        )
      }
    }

    const updated = await this.mandatoryItemRepo.update(id, patch)

    // Sync snapshot — find projectId from the updated item's project
    await this.syncSnapshot(updated)

    return updated
  }

  async addItem(input: {
    projectId: string
    content: string
    sourceText?: string
    sourcePages?: number[]
  }): Promise<MandatoryItem> {
    const now = new Date().toISOString()
    const pages = input.sourcePages ? [...new Set(input.sourcePages)].sort((a, b) => a - b) : []

    const trimmedContent = input.content.trim()

    // Pre-check for duplicate content
    const exists = await this.mandatoryItemRepo.contentExists(input.projectId, trimmedContent)
    if (exists) {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `该必响应项已存在，请勿重复添加: ${trimmedContent.slice(0, 50)}`
      )
    }

    const item: MandatoryItem = {
      id: uuidv4(),
      content: trimmedContent,
      sourceText: (input.sourceText ?? '').trim(),
      sourcePages: pages,
      confidence: 1.0,
      status: 'confirmed',
      linkedRequirementId: null,
      detectedAt: now,
      updatedAt: now,
    }

    await this.mandatoryItemRepo.create(input.projectId, [item])

    // Sync snapshot
    await this.syncSnapshotForProject(input.projectId)

    return item
  }

  private async syncSnapshot(item: MandatoryItem): Promise<void> {
    // Find the project for this item by querying DB
    const row = await getDb()
      .selectFrom('mandatoryItems')
      .select('projectId')
      .where('id', '=', item.id)
      .executeTakeFirst()

    if (row) {
      await this.syncSnapshotForProject(row.projectId)
    }
  }

  private async syncSnapshotForProject(projectId: string): Promise<void> {
    try {
      const project = await this.projectRepo.findById(projectId)
      if (!project.rootPath) return

      const items = await this.mandatoryItemRepo.findByProject(projectId)
      const snapshot: MandatoryItemsSnapshot = {
        projectId,
        items,
        detectedAt: new Date().toISOString(),
      }
      const snapshotPath = path.join(project.rootPath, 'tender', 'mandatory-items.json')
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`Failed to sync mandatory items snapshot for project ${projectId}`, err)
    }
  }
}
