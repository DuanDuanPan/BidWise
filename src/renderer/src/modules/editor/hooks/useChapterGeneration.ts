import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChapterHeadingLocator,
  ChapterGenerationPhase,
  ChapterGenerationStatus,
} from '@shared/chapter-types'
import type { TaskProgressEvent } from '@shared/ai-types'
import { useDocumentStore } from '@renderer/stores'

const HEADING_RE = /^(#{1,4})\s+(.+?)\s*$/

/** Construct a stable map key from a heading locator */
function locatorKey(locator: ChapterHeadingLocator): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}

/** Map progress message strings to generation phases */
function progressToPhase(progress: number, message?: string): ChapterGenerationPhase {
  if (message === 'analyzing') return 'analyzing'
  if (message === 'matching-assets') return 'matching-assets'
  if (message === 'generating') return 'generating'
  if (message === 'annotating-sources') return 'annotating-sources'
  if (progress >= 100) return 'completed'
  if (progress >= 90) return 'annotating-sources'
  if (progress >= 50) return 'generating'
  if (progress >= 25) return 'matching-assets'
  return 'analyzing'
}

/** Extract the content lines of a section identified by a heading locator */
function extractSectionContent(markdown: string, locator: ChapterHeadingLocator): string {
  const lines = markdown.split('\n')
  let occurrence = 0
  let headingLineIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const match = HEADING_RE.exec(lines[i])
    if (match && match[1].length === locator.level && match[2].trim() === locator.title) {
      if (occurrence === locator.occurrenceIndex) {
        headingLineIdx = i
        break
      }
      occurrence++
    }
  }

  if (headingLineIdx === -1) return ''

  let endLineIdx = lines.length
  for (let i = headingLineIdx + 1; i < lines.length; i++) {
    const match = HEADING_RE.exec(lines[i])
    if (match && match[1].length <= locator.level) {
      endLineIdx = i
      break
    }
  }

  return lines.slice(headingLineIdx + 1, endLineIdx).join('\n')
}

export interface UseChapterGenerationReturn {
  currentProjectId: string
  statuses: Map<string, ChapterGenerationStatus>
  startGeneration: (target: ChapterHeadingLocator) => Promise<void>
  startRegeneration: (target: ChapterHeadingLocator, additionalContext: string) => Promise<void>
  retry: (target: ChapterHeadingLocator) => Promise<void>
  dismissError: (target: ChapterHeadingLocator) => void
  getStatus: (target: ChapterHeadingLocator) => ChapterGenerationStatus | undefined
}

export function useChapterGeneration(projectId: string): UseChapterGenerationReturn {
  const [statuses, setStatuses] = useState<Map<string, ChapterGenerationStatus>>(new Map())
  const taskToLocatorRef = useRef<Map<string, ChapterHeadingLocator>>(new Map())

  const updateStatus = useCallback(
    (key: string, updater: (prev: ChapterGenerationStatus) => ChapterGenerationStatus) => {
      setStatuses((prev) => {
        const existing = prev.get(key)
        if (!existing) return prev
        const next = new Map(prev)
        next.set(key, updater(existing))
        return next
      })
    },
    []
  )

  // Listen for task progress events
  useEffect(() => {
    const unsubscribe = window.api.onTaskProgress((event: TaskProgressEvent) => {
      const locator = taskToLocatorRef.current.get(event.taskId)
      if (!locator) return
      const key = locatorKey(locator)
      const phase = progressToPhase(event.progress, event.message)

      if (phase === 'completed') {
        // Fetch final result
        void window.api.agentStatus(event.taskId).then((res) => {
          if (!res.success) return
          const status = res.data
          if (status.status === 'completed' && status.result) {
            // Conflict detection: compare current section content with baseline
            const currentContent = useDocumentStore.getState().content
            const currentSectionContent = extractSectionContent(currentContent, locator)

            updateStatus(key, (prev) => {
              const hasConflict =
                prev.baselineSectionContent !== undefined &&
                currentSectionContent !== prev.baselineSectionContent

              return {
                ...prev,
                phase: hasConflict ? 'conflicted' : 'completed',
                progress: 100,
                generatedContent: status.result!.content,
              }
            })
          } else if (status.status === 'failed') {
            updateStatus(key, (prev) => ({
              ...prev,
              phase: 'failed',
              progress: prev.progress,
              error: status.error?.message ?? '生成失败',
            }))
          }
        })
        return
      }

      updateStatus(key, (prev) => ({
        ...prev,
        phase,
        progress: event.progress,
        message: event.message,
      }))
    })

    return unsubscribe
  }, [updateStatus])

  // Restore active tasks on mount — scoped to current project
  useEffect(() => {
    if (!projectId) return

    void window.api.taskList({ category: 'ai-agent', agentType: 'generate' }).then((res) => {
      if (!res.success) return
      const activeTasks = res.data.filter((t) => t.status === 'pending' || t.status === 'running')
      if (activeTasks.length === 0) return

      const restoredStatuses = new Map<string, ChapterGenerationStatus>()
      for (const task of activeTasks) {
        try {
          const input = JSON.parse(task.input) as Record<string, unknown>
          // Filter: only restore tasks belonging to this project
          if (input.projectId !== projectId) continue
          const target = input.target as ChapterHeadingLocator | undefined
          if (!target) continue
          const key = locatorKey(target)
          taskToLocatorRef.current.set(task.id, target)
          restoredStatuses.set(key, {
            target,
            // pending tasks should map to 'queued', not 'analyzing'
            phase: task.status === 'pending' ? 'queued' : progressToPhase(task.progress),
            progress: task.progress,
            taskId: task.id,
            baselineDigest: input.baselineDigest as string | undefined,
            baselineSectionContent: input.baselineSectionContent as string | undefined,
          })
        } catch {
          // Skip tasks with invalid input
        }
      }

      if (restoredStatuses.size > 0) {
        setStatuses((prev) => {
          const next = new Map(prev)
          for (const [k, v] of restoredStatuses) {
            if (!next.has(k)) next.set(k, v)
          }
          return next
        })
      }
    })
  }, [projectId])

  const startGeneration = useCallback(
    async (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)

      // Capture baseline section content for conflict detection
      const currentContent = useDocumentStore.getState().content
      const baselineSectionContent = extractSectionContent(currentContent, target)

      // Set initial queued status
      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
          operationType: 'generate',
          baselineSectionContent,
        })
        return next
      })

      const res = await window.api.chapterGenerate({ projectId, target })
      if (!res.success) {
        setStatuses((prev) => {
          const next = new Map(prev)
          next.set(key, {
            target,
            phase: 'failed',
            progress: 0,
            taskId: '',
            error: res.error.message,
            operationType: 'generate',
            baselineSectionContent,
          })
          return next
        })
        return
      }

      taskToLocatorRef.current.set(res.data.taskId, target)
      updateStatus(key, (prev) => ({ ...prev, taskId: res.data.taskId }))
    },
    [projectId, updateStatus]
  )

  const startRegeneration = useCallback(
    async (target: ChapterHeadingLocator, additionalContext: string) => {
      const key = locatorKey(target)

      // Capture baseline section content for conflict detection
      const currentContent = useDocumentStore.getState().content
      const baselineSectionContent = extractSectionContent(currentContent, target)

      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
          operationType: 'regenerate',
          additionalContext,
          baselineSectionContent,
        })
        return next
      })

      const res = await window.api.chapterRegenerate({ projectId, target, additionalContext })
      if (!res.success) {
        setStatuses((prev) => {
          const next = new Map(prev)
          next.set(key, {
            target,
            phase: 'failed',
            progress: 0,
            taskId: '',
            error: res.error.message,
            operationType: 'regenerate',
            additionalContext,
            baselineSectionContent,
          })
          return next
        })
        return
      }

      taskToLocatorRef.current.set(res.data.taskId, target)
      updateStatus(key, (prev) => ({ ...prev, taskId: res.data.taskId }))
    },
    [projectId, updateStatus]
  )

  const retry = useCallback(
    async (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)
      const currentStatus = statuses.get(key)

      // Use the correct operation type for retry
      if (currentStatus?.operationType === 'regenerate') {
        await startRegeneration(target, currentStatus.additionalContext ?? '')
      } else {
        await startGeneration(target)
      }
    },
    [statuses, startGeneration, startRegeneration]
  )

  const dismissError = useCallback((target: ChapterHeadingLocator) => {
    const key = locatorKey(target)
    setStatuses((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const getStatus = useCallback(
    (target: ChapterHeadingLocator): ChapterGenerationStatus | undefined => {
      return statuses.get(locatorKey(target))
    },
    [statuses]
  )

  return {
    currentProjectId: projectId,
    statuses,
    startGeneration,
    startRegeneration,
    retry,
    dismissError,
    getStatus,
  }
}

export { locatorKey }
