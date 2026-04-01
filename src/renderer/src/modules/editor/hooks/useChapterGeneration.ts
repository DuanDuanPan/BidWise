import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChapterHeadingLocator,
  ChapterGenerationPhase,
  ChapterGenerationStatus,
} from '@shared/chapter-types'
import type { TaskProgressEvent } from '@shared/ai-types'

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

export interface UseChapterGenerationReturn {
  statuses: Map<string, ChapterGenerationStatus>
  startGeneration: (projectId: string, target: ChapterHeadingLocator) => Promise<void>
  startRegeneration: (
    projectId: string,
    target: ChapterHeadingLocator,
    additionalContext: string
  ) => Promise<void>
  retry: (projectId: string, target: ChapterHeadingLocator) => Promise<void>
  dismissError: (target: ChapterHeadingLocator) => void
  getStatus: (target: ChapterHeadingLocator) => ChapterGenerationStatus | undefined
}

export function useChapterGeneration(): UseChapterGenerationReturn {
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
            updateStatus(key, (prev) => ({
              ...prev,
              phase: 'completed',
              progress: 100,
              generatedContent: status.result!.content,
            }))
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

  // Restore active tasks on mount
  useEffect(() => {
    void window.api.taskList({ category: 'ai-agent', agentType: 'generate' }).then((res) => {
      if (!res.success) return
      const activeTasks = res.data.filter((t) => t.status === 'pending' || t.status === 'running')
      if (activeTasks.length === 0) return

      const restoredStatuses = new Map<string, ChapterGenerationStatus>()
      for (const task of activeTasks) {
        try {
          const input = JSON.parse(task.input) as Record<string, unknown>
          const target = input.target as ChapterHeadingLocator | undefined
          if (!target) continue
          const key = locatorKey(target)
          taskToLocatorRef.current.set(task.id, target)
          restoredStatuses.set(key, {
            target,
            phase: progressToPhase(task.progress),
            progress: task.progress,
            taskId: task.id,
            baselineDigest: input.baselineDigest as string | undefined,
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
  }, [])

  const startGeneration = useCallback(
    async (projectId: string, target: ChapterHeadingLocator) => {
      const key = locatorKey(target)

      // Set initial queued status
      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
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
          })
          return next
        })
        return
      }

      taskToLocatorRef.current.set(res.data.taskId, target)
      updateStatus(key, (prev) => ({ ...prev, taskId: res.data.taskId }))
    },
    [updateStatus]
  )

  const startRegeneration = useCallback(
    async (projectId: string, target: ChapterHeadingLocator, additionalContext: string) => {
      const key = locatorKey(target)

      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
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
          })
          return next
        })
        return
      }

      taskToLocatorRef.current.set(res.data.taskId, target)
      updateStatus(key, (prev) => ({ ...prev, taskId: res.data.taskId }))
    },
    [updateStatus]
  )

  const retry = useCallback(
    async (projectId: string, target: ChapterHeadingLocator) => {
      // Retry is just a new generation call
      await startGeneration(projectId, target)
    },
    [startGeneration]
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
    statuses,
    startGeneration,
    startRegeneration,
    retry,
    dismissError,
    getStatus,
  }
}

export { locatorKey }
