import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { TaskProgressEvent } from '@shared/ai-types'
import type { SourceAttribution, BaselineValidation } from '@shared/source-attribution-types'
import {
  extractRenderableParagraphs,
  extractMarkdownSectionContent,
} from '@shared/chapter-markdown'

type TaskPhase = 'idle' | 'running' | 'completed' | 'failed' | 'skipped'

export interface SectionAttributionState {
  attributions: SourceAttribution[]
  baselineValidations: BaselineValidation[]
  attributionTaskId?: string
  baselineTaskId?: string
  attributionPhase: TaskPhase
  baselinePhase: TaskPhase
}

export interface ParagraphLookupEntry {
  attribution: SourceAttribution
  validation: BaselineValidation | null
  isEdited: boolean
}

export interface UseSourceAttributionReturn {
  sections: Map<string, SectionAttributionState>
  paragraphLookup: Map<string, ParagraphLookupEntry>
  triggerAttribution: (target: ChapterHeadingLocator, content: string) => Promise<void>
  triggerBaselineValidation: (target: ChapterHeadingLocator, content: string) => Promise<void>
  refreshSection: (target: ChapterHeadingLocator) => Promise<void>
  loadPersistedState: () => Promise<void>
  getSectionState: (target: ChapterHeadingLocator) => SectionAttributionState | undefined
  getEditedParagraphs: (target: ChapterHeadingLocator, currentContent: string) => Set<number>
}

function locatorKey(locator: ChapterHeadingLocator): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}

function parseLocatorKey(key: string): ChapterHeadingLocator | null {
  const parts = key.split(':')
  if (parts.length < 3) return null
  return {
    level: Number(parts[0]) as ChapterHeadingLocator['level'],
    title: parts.slice(1, -1).join(':'),
    occurrenceIndex: Number(parts[parts.length - 1]),
  }
}

function defaultSectionState(): SectionAttributionState {
  return {
    attributions: [],
    baselineValidations: [],
    attributionPhase: 'idle',
    baselinePhase: 'idle',
  }
}

export function useSourceAttribution(
  projectId: string,
  documentContent?: string
): UseSourceAttributionReturn {
  const [sections, setSections] = useState<Map<string, SectionAttributionState>>(new Map())
  const taskToSectionRef = useRef(
    new Map<string, { key: string; type: 'attribution' | 'baseline' }>()
  )

  const pollAndRefresh = useCallback(
    async (taskId: string, mapping: { key: string; type: 'attribution' | 'baseline' }) => {
      // Poll task status to confirm completion
      const response = await window.api.taskGetStatus({ taskId })
      if (!response.success || !response.data) return

      const task = response.data
      if (task.status !== 'completed') {
        if (task.status === 'failed') {
          setSections((prev) => {
            const next = new Map(prev)
            const state = { ...(next.get(mapping.key) ?? defaultSectionState()) }
            if (mapping.type === 'attribution') {
              state.attributionPhase = 'failed'
            } else {
              state.baselinePhase = 'failed'
            }
            next.set(mapping.key, state)
            return next
          })
        }
        return
      }

      // Parse the locator from the section key
      const parts = mapping.key.split(':')
      if (parts.length < 3) return
      const target: ChapterHeadingLocator = {
        level: Number(parts[0]) as ChapterHeadingLocator['level'],
        title: parts.slice(1, -1).join(':'),
        occurrenceIndex: Number(parts[parts.length - 1]),
      }

      // Fetch fresh attributions from main process
      const attrResponse = await window.api.sourceGetAttributions({ projectId, target })
      if (!attrResponse.success) return

      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(mapping.key) ?? defaultSectionState()) }
        state.attributions = attrResponse.data.attributions
        state.baselineValidations = attrResponse.data.baselineValidations
        next.set(mapping.key, state)
        return next
      })
    },
    [projectId]
  )

  // Listen for task progress events
  useEffect(() => {
    const cleanup = window.api.onTaskProgress((event: TaskProgressEvent) => {
      const mapping = taskToSectionRef.current.get(event.taskId)
      if (!mapping) return

      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(mapping.key) ?? defaultSectionState()) }

        if (mapping.type === 'attribution') {
          if (event.progress >= 100) {
            state.attributionPhase = event.message === 'skipped' ? 'skipped' : 'completed'
          } else {
            state.attributionPhase = 'running'
          }
        } else {
          if (event.progress >= 100) {
            state.baselinePhase = event.message === 'skipped' ? 'skipped' : 'completed'
          } else {
            state.baselinePhase = 'running'
          }
        }

        next.set(mapping.key, state)
        return next
      })

      // When completed, fetch the actual results
      if (event.progress >= 100) {
        pollAndRefresh(event.taskId, mapping)
      }
    })
    return cleanup
  }, [projectId, pollAndRefresh])

  const triggerAttribution = useCallback(
    async (target: ChapterHeadingLocator, content: string) => {
      const key = locatorKey(target)

      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        state.attributionPhase = 'running'
        next.set(key, state)
        return next
      })

      const response = await window.api.sourceAttribute({ projectId, target, content })
      if (!response.success) {
        setSections((prev) => {
          const next = new Map(prev)
          const state = { ...(next.get(key) ?? defaultSectionState()) }
          state.attributionPhase = 'failed'
          next.set(key, state)
          return next
        })
        return
      }

      taskToSectionRef.current.set(response.data.taskId, { key, type: 'attribution' })
      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        state.attributionTaskId = response.data.taskId
        next.set(key, state)
        return next
      })
    },
    [projectId]
  )

  const triggerBaselineValidation = useCallback(
    async (target: ChapterHeadingLocator, content: string) => {
      const key = locatorKey(target)

      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        state.baselinePhase = 'running'
        next.set(key, state)
        return next
      })

      const response = await window.api.sourceValidateBaseline({ projectId, target, content })
      if (!response.success) {
        setSections((prev) => {
          const next = new Map(prev)
          const state = { ...(next.get(key) ?? defaultSectionState()) }
          state.baselinePhase = 'failed'
          next.set(key, state)
          return next
        })
        return
      }

      taskToSectionRef.current.set(response.data.taskId, { key, type: 'baseline' })
      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        state.baselineTaskId = response.data.taskId
        next.set(key, state)
        return next
      })
    },
    [projectId]
  )

  const refreshSection = useCallback(
    async (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)
      const response = await window.api.sourceGetAttributions({ projectId, target })
      if (!response.success) return

      setSections((prev) => {
        const next = new Map(prev)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        state.attributions = response.data.attributions
        state.baselineValidations = response.data.baselineValidations
        next.set(key, state)
        return next
      })
    },
    [projectId]
  )

  const getSectionState = useCallback(
    (target: ChapterHeadingLocator): SectionAttributionState | undefined => {
      return sections.get(locatorKey(target))
    },
    [sections]
  )

  const getEditedParagraphs = useCallback(
    (target: ChapterHeadingLocator, currentContent: string): Set<number> => {
      const key = locatorKey(target)
      const state = sections.get(key)
      if (!state) return new Set()

      const currentParagraphs = extractRenderableParagraphs(currentContent)
      const editedSet = new Set<number>()

      for (const attr of state.attributions) {
        const currentPara = currentParagraphs.find((p) => p.paragraphIndex === attr.paragraphIndex)
        if (!currentPara || currentPara.digest !== attr.paragraphDigest) {
          editedSet.add(attr.paragraphIndex)
        }
      }

      return editedSet
    },
    [sections]
  )

  // Build a lookup map: current paragraph digest → { attribution, validation, isEdited }
  // Enables SourceAwareParagraph to match by digest without knowing its section context.
  const paragraphLookup = useMemo(() => {
    const lookup = new Map<string, ParagraphLookupEntry>()
    if (!documentContent) return lookup

    for (const [key, state] of sections) {
      if (state.attributions.length === 0) continue

      const locator = parseLocatorKey(key)
      if (!locator) continue

      const sectionContent = extractMarkdownSectionContent(documentContent, locator)
      if (!sectionContent) continue

      const currentParagraphs = extractRenderableParagraphs(sectionContent)

      for (const attr of state.attributions) {
        const currentPara = currentParagraphs.find((p) => p.paragraphIndex === attr.paragraphIndex)
        if (!currentPara) continue

        const val =
          state.baselineValidations.find((v) => v.paragraphIndex === attr.paragraphIndex) ?? null
        const isEdited = currentPara.digest !== attr.paragraphDigest

        lookup.set(currentPara.digest, {
          attribution: attr,
          validation: val,
          isEdited,
        })
      }
    }

    return lookup
  }, [sections, documentContent])

  // Load persisted attributions from sidecar on mount (Finding P1 fix)
  const loadPersistedState = useCallback(async () => {
    if (!projectId) return
    const response = await window.api.documentGetMetadata({ projectId })
    if (!response.success) return

    const meta = response.data
    if (meta.sourceAttributions.length === 0 && meta.baselineValidations.length === 0) return

    setSections((prev) => {
      const next = new Map(prev)

      for (const attr of meta.sourceAttributions) {
        const key = locatorKey(attr.sectionLocator)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        if (state.attributionPhase === 'idle') {
          state.attributionPhase = 'completed'
        }
        state.attributions = meta.sourceAttributions.filter(
          (a) => locatorKey(a.sectionLocator) === key
        )
        next.set(key, state)
      }

      for (const val of meta.baselineValidations) {
        const key = locatorKey(val.sectionLocator)
        const state = { ...(next.get(key) ?? defaultSectionState()) }
        if (state.baselinePhase === 'idle') {
          state.baselinePhase = 'completed'
        }
        state.baselineValidations = meta.baselineValidations.filter(
          (v) => locatorKey(v.sectionLocator) === key
        )
        next.set(key, state)
      }

      return next
    })
  }, [projectId])

  return {
    sections,
    paragraphLookup,
    triggerAttribution,
    triggerBaselineValidation,
    refreshSection,
    loadPersistedState,
    getSectionState,
    getEditedParagraphs,
  }
}
