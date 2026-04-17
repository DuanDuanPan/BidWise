/**
 * Chapter-summary post-processor (Story 3.12).
 *
 * Runs after the `chapter-summary` agent produces raw LLM content.
 * Responsibilities:
 *   1. Parse structured JSON { key_commitments, numbers, terms, tone }.
 *   2. Fall back to plain-text 200-char truncation when JSON is malformed.
 *   3. Compute lineHash = createContentDigest(directBody) — same direct-body
 *      helper the read-side uses, so write-time and read-time digests agree.
 *   4. Persist a sidecar entry via `chapterSummaryStore`.
 */
import { throwIfAborted } from '@main/utils/abort'
import { createLogger } from '@main/utils/logger'
import { documentService } from '@main/services/document-service'
import { chapterSummaryStore } from '@main/services/chapter-summary-store'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import { createContentDigest, getMarkdownDirectSectionBody } from '@shared/chapter-markdown'
import { extractJsonObject } from '@main/utils/llm-json'
import {
  CHAPTER_SUMMARY_MAX_LENGTH,
  type ChapterSummaryEntry,
  type ChapterSummaryStructured,
} from '@shared/chapter-summary-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { AgentPostProcessor } from '../orchestrator'

const logger = createLogger('chapter-summary-post-processor')
const PLAIN_TEXT_FALLBACK_LENGTH = 200

function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  return input.slice(0, Math.max(0, max - 1)) + '…'
}

function normalizeStructuredSummary(
  parsed: Record<string, unknown>
): ChapterSummaryStructured | null {
  if (!parsed || typeof parsed !== 'object') return null
  const keyCommitments = Array.isArray(parsed.key_commitments)
    ? parsed.key_commitments.filter((x): x is string => typeof x === 'string')
    : []
  const numbers = Array.isArray(parsed.numbers)
    ? parsed.numbers
        .filter(
          (item): item is { label?: unknown; value?: unknown } =>
            typeof item === 'object' && item !== null
        )
        .map((item) => ({
          label: typeof item.label === 'string' ? item.label : '',
          value: typeof item.value === 'string' ? item.value : '',
        }))
        .filter((n) => n.label.length > 0 || n.value.length > 0)
    : []
  const terms = Array.isArray(parsed.terms)
    ? parsed.terms.filter((x): x is string => typeof x === 'string')
    : []
  const tone = typeof parsed.tone === 'string' ? parsed.tone : ''

  // Require at least one non-empty field; otherwise treat as failure.
  if (
    keyCommitments.length === 0 &&
    numbers.length === 0 &&
    terms.length === 0 &&
    tone.trim().length === 0
  ) {
    return null
  }

  return { key_commitments: keyCommitments, numbers, terms, tone }
}

function serializeStructured(structured: ChapterSummaryStructured): string {
  const serialized = JSON.stringify(structured)
  return truncate(serialized, CHAPTER_SUMMARY_MAX_LENGTH)
}

export const chapterSummaryPostProcessor: AgentPostProcessor = async (result, context, signal) => {
  throwIfAborted(signal, 'chapter-summary post-processor cancelled')

  const projectId = context.projectId as string | undefined
  const locator = context.locator as ChapterHeadingLocator | undefined
  const preExtractedDirectBody = context.directBody as string | undefined
  if (!projectId || !locator) {
    logger.warn('chapter-summary post-processor: missing projectId or locator; skipping persist')
    return result
  }

  // Digest the SAME directBody the agent summarised. When the caller
  // pre-extracted it we reuse it here — otherwise agent saw disk-A and
  // post-processor would see disk-A' after autosave, producing the stale
  // race (Story 3.12).
  const directBody =
    preExtractedDirectBody !== undefined
      ? preExtractedDirectBody
      : getMarkdownDirectSectionBody((await documentService.load(projectId)).content, locator)
  const lineHash = createContentDigest(directBody)

  let summaryText: string
  const parsed = extractJsonObject<Record<string, unknown>>(result.content)
  const structured = parsed ? normalizeStructuredSummary(parsed) : null

  if (structured) {
    summaryText = serializeStructured(structured)
  } else {
    logger.warn(
      `chapter-summary JSON parse failed for "${locator.title}"; falling back to direct-body truncation`
    )
    const fallbackSource = directBody.trim()
    summaryText = truncate(fallbackSource, PLAIN_TEXT_FALLBACK_LENGTH)
  }

  const entry: ChapterSummaryEntry = {
    headingKey: createChapterLocatorKey(locator),
    headingTitle: locator.title,
    headingLevel: locator.level,
    occurrenceIndex: locator.occurrenceIndex,
    lineHash,
    summary: summaryText,
    generatedAt: new Date().toISOString(),
    provider: result.provider ?? 'unknown',
    model: result.model ?? 'unknown',
  }

  await chapterSummaryStore.upsert(projectId, entry)
  logger.info(
    `chapter-summary persisted: project=${projectId} locator=${entry.headingKey} lineHash=${lineHash.slice(0, 8)} structured=${structured !== null}`
  )

  return { ...result, content: summaryText }
}
