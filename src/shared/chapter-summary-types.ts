/**
 * Chapter summary cache shared types — consumed by chapter-summary-service,
 * IPC handlers, and chapter-generation-service context builder (Story 3.12).
 */
import type { ChapterHeadingLocator } from './chapter-types'
import type { AiProviderName } from './ai-types'

/** Sidecar JSON file version */
export const CHAPTER_SUMMARY_SIDECAR_VERSION = 1 as const

/** Maximum length for any single summary string written to sidecar */
export const CHAPTER_SUMMARY_MAX_LENGTH = 200

/** Top-N global summaries injected into chapter prompt context */
export const CHAPTER_SUMMARY_TOP_N = 8

/** Fallback truncation length when cache misses */
export const CHAPTER_SUMMARY_FALLBACK_LENGTH = 500

/** Persisted entry in chapter-summaries.json sidecar */
export interface ChapterSummaryEntry {
  /** Stable identity: createChapterLocatorKey(locator) */
  headingKey: string
  headingTitle: string
  headingLevel: ChapterHeadingLocator['level']
  occurrenceIndex: number
  /** createContentDigest(directBody) — used for hash 懒失效 */
  lineHash: string
  /** ≤200 chars; structured JSON serialized OR plain text fallback */
  summary: string
  /** ISO-8601 */
  generatedAt: string
  /** Provider that produced this summary (claude / openai / openai-compat vendor via openai+baseUrl) */
  provider: AiProviderName | string
  /** Model id reported by the provider response */
  model: string
}

/** Sidecar JSON file shape */
export interface ChapterSummarySidecar {
  version: typeof CHAPTER_SUMMARY_SIDECAR_VERSION
  entries: ChapterSummaryEntry[]
}

/** Single grouped summary candidate after read-time hydration */
export interface GeneratedChapterSummary {
  headingKey: string
  headingTitle: string
  headingLevel: ChapterHeadingLocator['level']
  occurrenceIndex: number
  /** Tree distance (LCA hops) from current chapter to this candidate */
  distance: number
  /** Source of the summary content for this candidate */
  source: 'cache' | 'fallback'
  /** Cached structured/plain summary (cache hit) OR direct-body 500-char truncation (cache miss) */
  summary: string
}

/** Four-group context injected into generate-chapter prompt */
export interface GeneratedChaptersContext {
  ancestors: GeneratedChapterSummary[]
  siblings: GeneratedChapterSummary[]
  descendants: GeneratedChapterSummary[]
  others: GeneratedChapterSummary[]
}

/** IPC input for chapter-summary:extract */
export interface ChapterSummaryExtractInput {
  projectId: string
  locator: ChapterHeadingLocator
  /**
   * Pre-extracted "直属正文" for the target heading. When supplied, the agent
   * summarises this string directly and the post-processor digests it for
   * `lineHash` — no disk read, no heading re-location. Caller is expected to
   * compute it via `getMarkdownDirectSectionBody` against the freshly-applied
   * document snapshot so the (summary, lineHash) pair stays internally
   * consistent. Bounded by one chapter's body, so the queue row stays small
   * even after hundreds of repeated refreshes.
   */
  directBody?: string
}

/** IPC output for chapter-summary:extract */
export interface ChapterSummaryExtractOutput {
  taskId: string
}

/** Structured summary JSON expected from the LLM */
export interface ChapterSummaryStructured {
  key_commitments: string[]
  numbers: Array<{ label: string; value: string }>
  terms: string[]
  tone: string
}
