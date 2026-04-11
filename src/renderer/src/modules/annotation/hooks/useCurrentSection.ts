import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'

export interface CurrentSectionInfo {
  locator: ChapterHeadingLocator
  sectionKey: string
  label: string
}

export interface UseCurrentSectionOptions {
  minLevel?: 1 | 2 | 3 | 4
  maxLevel?: 1 | 2 | 3 | 4
}

/**
 * Tracks which chapter section the user is currently viewing/editing.
 * Uses heading marker data attributes placed by OutlineHeadingElement
 * and scroll/selection DOM events to derive the current section.
 * Default range is H2-H4 (annotation scope); pass { minLevel: 1 } for H1-H4 (recommendation scope).
 */
export function useCurrentSection(options?: UseCurrentSectionOptions): CurrentSectionInfo | null {
  const minLevel = options?.minLevel ?? 2
  const maxLevel = options?.maxLevel ?? 4
  const [section, setSection] = useState<CurrentSectionInfo | null>(null)
  const lastKeyRef = useRef<string | null>(null)

  const detect = useCallback(() => {
    const container = document.querySelector(
      '[data-editor-scroll-container="true"]'
    ) as HTMLElement | null
    if (!container) return

    // Find all heading markers with locator keys (H2-H4 only)
    const markers = container.querySelectorAll<HTMLElement>('[data-heading-locator-key]')
    if (markers.length === 0) return

    const containerRect = container.getBoundingClientRect()
    // Threshold: consider headings within top 40% of visible area
    const threshold = containerRect.top + containerRect.height * 0.4

    let best: HTMLElement | null = null

    // Find the last heading that is at or above the threshold
    for (const marker of markers) {
      const rect = marker.getBoundingClientRect()
      if (rect.top <= threshold) {
        best = marker
      }
    }

    // If no heading is above threshold, use the first one if visible
    if (!best && markers.length > 0) {
      const first = markers[0]
      const rect = first.getBoundingClientRect()
      if (rect.top < containerRect.bottom) {
        best = first
      }
    }

    if (!best) {
      if (lastKeyRef.current !== null) {
        lastKeyRef.current = null
        setSection(null)
      }
      return
    }

    const locatorKey = best.getAttribute('data-heading-locator-key')
    if (!locatorKey || locatorKey === lastKeyRef.current) return

    const levelStr = best.getAttribute('data-heading-level')
    const occStr = best.getAttribute('data-heading-occurrence')
    const text = best.getAttribute('data-heading-text')

    if (!levelStr || !occStr || !text) return

    const level = parseInt(levelStr, 10) as 1 | 2 | 3 | 4
    if (level < minLevel || level > maxLevel) return

    const occurrenceIndex = parseInt(occStr, 10)
    const locator: ChapterHeadingLocator = { title: text, level, occurrenceIndex }
    const sectionKey = createChapterLocatorKey(locator)

    lastKeyRef.current = sectionKey
    setSection({ locator, sectionKey, label: text })
  }, [minLevel, maxLevel])

  useEffect(() => {
    const container = document.querySelector(
      '[data-editor-scroll-container="true"]'
    ) as HTMLElement | null

    // Initial DOM measurement on mount — legitimate direct detection
    // eslint-disable-next-line react-hooks/set-state-in-effect
    detect()

    // Scroll events on editor container
    if (container) {
      container.addEventListener('scroll', detect, { passive: true })
    }

    // Selection and input events for cursor-based detection
    document.addEventListener('selectionchange', detect)
    document.addEventListener('keyup', detect)
    document.addEventListener('mouseup', detect)

    return () => {
      if (container) {
        container.removeEventListener('scroll', detect)
      }
      document.removeEventListener('selectionchange', detect)
      document.removeEventListener('keyup', detect)
      document.removeEventListener('mouseup', detect)
    }
  }, [detect])

  return section
}
