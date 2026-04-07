import type { ChapterHeadingLocator } from './chapter-types'

/**
 * Creates a stable, unique key for a chapter section.
 * Format: `${level}:${title}:${occurrenceIndex}`
 * Consistent with source attribution's createSourceSectionKey.
 */
export function createChapterLocatorKey(locator: ChapterHeadingLocator): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}
