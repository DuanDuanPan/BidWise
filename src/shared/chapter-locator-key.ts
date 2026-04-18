import type { ChapterHeadingLocator } from './chapter-types'

/**
 * Story 11.1 clarification:
 *
 * Locator keys are the **read-side** view of a chapter's current position in
 * the markdown / DOM — they change whenever a heading is renamed or reordered.
 * They are **not** the persistence key. The canonical persistence key is the
 * project-level UUID `sectionId` (see `ChapterIdentityEntry`,
 * `proposal.meta.json.sectionIndex[]`).
 *
 * Use `createChapterLocatorKey(locator)` for:
 *   - DOM marker attributes (`data-heading-locator-key`).
 *   - chapter-summary sidecar `headingKey` bridging (hash lookup).
 *   - in-memory Maps keyed by locator within a single render pass.
 *
 * Do NOT use for:
 *   - SQLite rows (annotations / traceability_links / notifications).
 *   - sidecar cross-service refs (confirmedSkeletons, sourceAttributions,
 *     baselineValidations) — those must use the UUID `sectionId`.
 *
 * Format: `${level}:${title}:${occurrenceIndex}`
 * Consistent with source attribution's createSourceSectionKey.
 */
export function createChapterLocatorKey(locator: ChapterHeadingLocator): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}

/**
 * Story 11.1: parse a `level:title:occurrenceIndex` locator key back into a
 * `ChapterHeadingLocator`. Returns `undefined` when the input does not match
 * the expected shape — callers should fall through to UUID-based lookups.
 *
 * Titles may legitimately contain colons (e.g. "方案:技术:范围"), so the
 * parser only consumes the leading level and the trailing occurrence index
 * and treats everything between them as the title.
 */
export function parseChapterLocatorKey(key: string): ChapterHeadingLocator | undefined {
  const firstColon = key.indexOf(':')
  const lastColon = key.lastIndexOf(':')
  if (firstColon < 0 || lastColon <= firstColon) return undefined
  const levelStr = key.slice(0, firstColon)
  const occStr = key.slice(lastColon + 1)
  const title = key.slice(firstColon + 1, lastColon)
  const level = Number(levelStr)
  const occurrenceIndex = Number(occStr)
  if (!title) return undefined
  if (!Number.isInteger(level) || level < 1 || level > 4) return undefined
  if (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) return undefined
  return { title, level: level as 1 | 2 | 3 | 4, occurrenceIndex }
}
