import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChapterHeadingLocator,
  ChapterGenerationPhase,
  ChapterGenerationStatus,
} from '@shared/chapter-types'
import type { TaskProgressEvent } from '@shared/ai-types'
import { createContentDigest, extractMarkdownSectionContent } from '@shared/chapter-markdown'
import { useDocumentStore } from '@renderer/stores'

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

function resolveTerminalPhase(params: {
  currentDigest: string
  currentSectionContent: string
  baselineDigest?: string
  baselineSectionContent?: string
}): Extract<ChapterGenerationPhase, 'completed' | 'conflicted'> {
  const { currentDigest, currentSectionContent, baselineDigest, baselineSectionContent } = params
  const hasConflict =
    (baselineDigest !== undefined && currentDigest !== baselineDigest) ||
    (baselineDigest === undefined &&
      baselineSectionContent !== undefined &&
      currentSectionContent !== baselineSectionContent)

  return hasConflict ? 'conflicted' : 'completed'
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
  const statusesRef = useRef(statuses)

  useEffect(() => {
    statusesRef.current = statuses
  }, [statuses])

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
      const hasTerminalMessage = event.message === 'failed' || event.message === 'cancelled'

      if (phase === 'completed' || hasTerminalMessage) {
        // Fetch final result
        void window.api.agentStatus(event.taskId).then((res) => {
          if (!res.success) return
          const status = res.data
          if (status.status === 'completed' && status.result) {
            // Conflict detection: compare current section content with baseline
            const currentContent = useDocumentStore.getState().content
            const currentSectionContent = extractMarkdownSectionContent(currentContent, locator)
            const currentDigest = createContentDigest(currentSectionContent)

            updateStatus(key, (prev) => {
              return {
                ...prev,
                phase: resolveTerminalPhase({
                  currentDigest,
                  currentSectionContent,
                  baselineDigest: prev.baselineDigest,
                  baselineSectionContent: prev.baselineSectionContent,
                }),
                progress: 100,
                generatedContent: status.result!.content,
              }
            })
            taskToLocatorRef.current.delete(event.taskId)
          } else if (status.status === 'failed') {
            updateStatus(key, (prev) => ({
              ...prev,
              phase: 'failed',
              progress: prev.progress,
              error: status.error?.message ?? '生成失败',
            }))
            taskToLocatorRef.current.delete(event.taskId)
          } else if (status.status === 'cancelled') {
            updateStatus(key, (prev) => ({
              ...prev,
              phase: 'failed',
              progress: prev.progress,
              error: status.error?.message ?? '任务已取消',
            }))
            taskToLocatorRef.current.delete(event.taskId)
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

    void window.api.taskList({ category: 'ai-agent', agentType: 'generate' }).then(async (res) => {
      if (!res.success) return
      const restorableTasks = res.data.filter((task) =>
        ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(task.status)
      )
      if (restorableTasks.length === 0) return
      const documentRes = await window.api.documentLoad({ projectId })
      const persistedDocumentContent = documentRes.success
        ? documentRes.data.content
        : useDocumentStore.getState().content

      const restoredStatuses = new Map<string, ChapterGenerationStatus>()
      for (const task of restorableTasks) {
        try {
          const input = JSON.parse(task.input) as Record<string, unknown>
          // Filter: only restore tasks belonging to this project
          if (input.projectId !== projectId) continue
          const target = input.target as ChapterHeadingLocator | undefined
          if (!target) continue
          const key = locatorKey(target)
          const baselineSectionContent = input.baselineSectionContent as string | undefined
          const baselineDigest =
            (input.baselineDigest as string | undefined) ??
            (baselineSectionContent !== undefined
              ? createContentDigest(baselineSectionContent)
              : undefined)
          const currentDocumentContent = persistedDocumentContent
          const currentSectionContent = extractMarkdownSectionContent(
            currentDocumentContent,
            target
          )
          const currentDigest = createContentDigest(currentSectionContent)
          const terminalPhase = resolveTerminalPhase({
            currentDigest,
            currentSectionContent,
            baselineDigest,
            baselineSectionContent,
          })

          if (task.status === 'pending' || task.status === 'running') {
            const statusRes = await window.api.agentStatus(task.id)
            if (statusRes.success) {
              const status = statusRes.data
              if (status.status === 'completed' && status.result) {
                restoredStatuses.set(key, {
                  target,
                  phase: terminalPhase,
                  progress: 100,
                  taskId: task.id,
                  generatedContent: status.result.content,
                  baselineDigest,
                  baselineSectionContent,
                })
                continue
              }

              if (status.status === 'failed' || status.status === 'cancelled') {
                restoredStatuses.set(key, {
                  target,
                  phase: 'failed',
                  progress: task.progress,
                  taskId: task.id,
                  error:
                    status.error?.message ??
                    (status.status === 'cancelled' ? '任务已取消' : '生成失败'),
                  baselineDigest,
                  baselineSectionContent,
                })
                continue
              }
            }

            taskToLocatorRef.current.set(task.id, target)
            restoredStatuses.set(key, {
              target,
              phase: task.status === 'pending' ? 'queued' : progressToPhase(task.progress),
              progress: task.progress,
              taskId: task.id,
              baselineDigest,
              baselineSectionContent,
            })
            continue
          }

          const statusRes = await window.api.agentStatus(task.id)
          if (!statusRes.success) continue
          const status = statusRes.data

          if (status.status === 'completed' && status.result) {
            restoredStatuses.set(key, {
              target,
              phase: terminalPhase,
              progress: 100,
              taskId: task.id,
              generatedContent: status.result.content,
              baselineDigest,
              baselineSectionContent,
            })
            continue
          }

          if (status.status === 'failed' || status.status === 'cancelled') {
            restoredStatuses.set(key, {
              target,
              phase: 'failed',
              progress: task.progress,
              taskId: task.id,
              error:
                status.error?.message ??
                (status.status === 'cancelled' ? '任务已取消' : '生成失败'),
              baselineDigest,
              baselineSectionContent,
            })
          }
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
      const baselineSectionContent = extractMarkdownSectionContent(currentContent, target)
      const baselineDigest = createContentDigest(baselineSectionContent)

      // Set initial queued status
      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
          operationType: 'generate',
          baselineDigest,
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
            baselineDigest,
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
      const baselineSectionContent = extractMarkdownSectionContent(currentContent, target)
      const baselineDigest = createContentDigest(baselineSectionContent)

      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'queued',
          progress: 0,
          taskId: '',
          operationType: 'regenerate',
          additionalContext,
          baselineDigest,
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
            baselineDigest,
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
      const currentStatus = statusesRef.current.get(key)

      // Use the correct operation type for retry
      if (currentStatus?.operationType === 'regenerate') {
        await startRegeneration(target, currentStatus.additionalContext ?? '')
      } else {
        await startGeneration(target)
      }
    },
    [startGeneration, startRegeneration]
  )

  const dismissError = useCallback((target: ChapterHeadingLocator) => {
    const key = locatorKey(target)
    const taskId = statusesRef.current.get(key)?.taskId
    if (taskId) {
      taskToLocatorRef.current.delete(taskId)
    }
    setStatuses((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  const getStatus = useCallback(
    (target: ChapterHeadingLocator): ChapterGenerationStatus | undefined => {
      return statusesRef.current.get(locatorKey(target))
    },
    []
  )

  return useMemo(
    () => ({
      currentProjectId: projectId,
      statuses,
      startGeneration,
      startRegeneration,
      retry,
      dismissError,
      getStatus,
    }),
    [dismissError, getStatus, projectId, retry, startGeneration, startRegeneration, statuses]
  )
}

export { locatorKey }
