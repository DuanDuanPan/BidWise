import { useState, useEffect, useCallback, useRef } from 'react'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import { resolveSectionIdFromLocator } from '@shared/chapter-identity'
import { useDocumentStore } from '@renderer/stores'

export interface CurrentSectionInfo {
  locator: ChapterHeadingLocator
  /** Story 11.1: locator-key view used for DOM bridging / scroll alignment. */
  sectionKey: string
  /**
   * Story 11.1: canonical project-level UUID, resolved via
   * `proposal.meta.json.sectionIndex`. Undefined when metadata has not yet
   * loaded or the heading is not indexed (e.g. freshly typed unsynced
   * heading). Consumers that persist this value MUST fall through to
   * `sectionKey` only as a read-bridge, never as a persistence id.
   */
  sectionId?: string
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
  const sectionIndex = useDocumentStore((s) => s.sectionIndex)
  const [section, setSection] = useState<CurrentSectionInfo | null>(null)
  const lastKeyRef = useRef<string | null>(null)
  const detectFrameRef = useRef<number | null>(null)
  const pointerSelectingRef = useRef(false)

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
    // Story 11.1: resolve canonical UUID when sectionIndex is available so
    // downstream persistence (annotations, traceability) has a stable id.
    const sectionId = sectionIndex.length
      ? resolveSectionIdFromLocator(sectionIndex, locator)
      : undefined

    lastKeyRef.current = sectionKey
    setSection({ locator, sectionKey, sectionId, label: text })
  }, [minLevel, maxLevel, sectionIndex])

  useEffect(() => {
    const container = document.querySelector(
      '[data-editor-scroll-container="true"]'
    ) as HTMLElement | null

    // Initial DOM measurement on mount — legitimate direct detection
    // eslint-disable-next-line react-hooks/set-state-in-effect
    detect()

    const scheduleDetect = (): void => {
      if (detectFrameRef.current !== null) {
        window.cancelAnimationFrame(detectFrameRef.current)
      }
      detectFrameRef.current = window.requestAnimationFrame(() => {
        detectFrameRef.current = null
        detect()
      })
    }

    // Scroll events on editor container
    if (container) {
      container.addEventListener('scroll', scheduleDetect, { passive: true })
    }

    const handlePointerDown = (event: PointerEvent): void => {
      pointerSelectingRef.current = Boolean(
        container && event.target instanceof Node && container.contains(event.target)
      )
    }

    const handlePointerUp = (): void => {
      const wasPointerSelecting = pointerSelectingRef.current
      pointerSelectingRef.current = false
      if (wasPointerSelecting) {
        scheduleDetect()
      }
    }

    const handleSelectionChange = (): void => {
      if (pointerSelectingRef.current) return
      scheduleDetect()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('keyup', scheduleDetect)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('pointerup', handlePointerUp, true)

    return () => {
      if (detectFrameRef.current !== null) {
        window.cancelAnimationFrame(detectFrameRef.current)
      }
      if (container) {
        container.removeEventListener('scroll', scheduleDetect)
      }
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('keyup', scheduleDetect)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('pointerup', handlePointerUp, true)
    }
  }, [detect])

  return section
}
