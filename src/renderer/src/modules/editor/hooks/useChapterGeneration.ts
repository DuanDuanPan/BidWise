import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChapterHeadingLocator,
  ChapterStreamProgressPayload,
  ChapterGenerationPhase,
  ChapterGenerationStatus,
  SkeletonExpandPlan,
} from '@shared/chapter-types'
import type { TaskProgressEvent } from '@shared/ai-types'
import {
  createContentDigest,
  extractMarkdownSectionContent,
  normalizeGeneratedHeadingLevels,
  sanitizeGeneratedChapterMarkdown,
} from '@shared/chapter-markdown'
import { useDocumentStore } from '@renderer/stores'
import { useAnnotationStore } from '@renderer/stores/annotationStore'

/** Construct a stable map key from a heading locator */
function locatorKey(locator: ChapterHeadingLocator): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}

/** Map progress message strings to generation phases */
function progressToPhase(progress: number, message?: string): ChapterGenerationPhase {
  if (progress >= 100) return 'completed'
  if (message === 'analyzing') return 'analyzing'
  if (message === 'generating-text') return 'generating-text'
  if (message === 'validating-text') return 'validating-text'
  if (message === 'generating-diagrams') return 'generating-diagrams'
  if (message === 'validating-diagrams') return 'validating-diagrams'
  if (message === 'composing') return 'composing'
  if (message === 'validating-coherence') return 'validating-coherence'
  if (message === 'annotating-sources') return 'annotating-sources'
  if (message === 'skeleton-generating') return 'skeleton-generating'
  if (message === 'skeleton-ready') return 'skeleton-ready'
  if (message === 'batch-generating') return 'batch-generating'
  if (message === 'batch-composing') return 'batch-composing'
  if (progress >= 90) return 'validating-coherence'
  if (progress >= 80) return 'composing'
  if (progress >= 60) return 'validating-diagrams'
  if (progress >= 35) return 'generating-diagrams'
  if (progress >= 20) return 'validating-text'
  if (progress >= 10) return 'generating-text'
  return 'analyzing'
}

function isChapterStreamPayload(payload: unknown): payload is ChapterStreamProgressPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    (payload as { kind?: unknown }).kind === 'chapter-stream' &&
    'markdown' in payload &&
    typeof (payload as { markdown?: unknown }).markdown === 'string'
  )
}

function normalizeComparableGeneratedContent(
  target: ChapterHeadingLocator,
  content?: string
): string | undefined {
  if (typeof content !== 'string') return undefined
  const deduped = sanitizeGeneratedChapterMarkdown(content, target)
  return normalizeGeneratedHeadingLevels(deduped, target.level).trim()
}

function resolveTerminalPhase(params: {
  target: ChapterHeadingLocator
  currentDigest: string
  currentSectionContent: string
  baselineDigest?: string
  baselineSectionContent?: string
  streamedContent?: string
  finalContent?: string
}): Extract<ChapterGenerationPhase, 'completed' | 'conflicted'> {
  const {
    target,
    currentDigest,
    currentSectionContent,
    baselineDigest,
    baselineSectionContent,
    streamedContent,
    finalContent,
  } = params
  const normalizedCurrent = currentSectionContent.trim()
  const normalizedBaseline = baselineSectionContent?.trim()
  const normalizedStream = normalizeComparableGeneratedContent(target, streamedContent)
  const normalizedFinal = normalizeComparableGeneratedContent(target, finalContent)

  if (
    (baselineDigest !== undefined && currentDigest === baselineDigest) ||
    (normalizedBaseline !== undefined && normalizedCurrent === normalizedBaseline)
  ) {
    return 'completed'
  }

  if (
    (normalizedStream !== undefined && normalizedCurrent === normalizedStream) ||
    (normalizedFinal !== undefined && normalizedCurrent === normalizedFinal)
  ) {
    return 'completed'
  }

  return 'conflicted'
}

export interface UseChapterGenerationReturn {
  currentProjectId: string
  statuses: Map<string, ChapterGenerationStatus>
  startGeneration: (target: ChapterHeadingLocator) => Promise<void>
  startRegeneration: (target: ChapterHeadingLocator, additionalContext: string) => Promise<void>
  startSkeletonGenerate: (target: ChapterHeadingLocator) => Promise<void>
  confirmSkeleton: (
    target: ChapterHeadingLocator,
    sectionId: string,
    plan: SkeletonExpandPlan
  ) => Promise<boolean>
  startBatchGenerate: (target: ChapterHeadingLocator, sectionId: string) => Promise<void>
  retry: (target: ChapterHeadingLocator) => Promise<void>
  dismissError: (target: ChapterHeadingLocator) => void
  notifySectionCleared: (target: ChapterHeadingLocator) => void
  getStatus: (target: ChapterHeadingLocator) => ChapterGenerationStatus | undefined
}

export function useChapterGeneration(projectId: string): UseChapterGenerationReturn {
  const [statuses, setStatuses] = useState<Map<string, ChapterGenerationStatus>>(new Map())
  const taskToLocatorRef = useRef<Map<string, ChapterHeadingLocator>>(new Map())
  const statusesRef = useRef(statuses)
  const projectIdRef = useRef(projectId)
  const startGenerationRef = useRef<(target: ChapterHeadingLocator) => Promise<void>>(() =>
    Promise.resolve()
  )

  useEffect(() => {
    statusesRef.current = statuses
  }, [statuses])

  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

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
      const streamPayload = isChapterStreamPayload(event.payload) ? event.payload : null

      if (streamPayload) {
        updateStatus(key, (prev) => ({
          ...prev,
          phase,
          progress: event.progress,
          message: event.message,
          streamedContent: streamPayload.markdown,
          latestDiagramPatch: streamPayload.patch,
          streamRevision: (prev.streamRevision ?? 0) + 1,
        }))

        if (!hasTerminalMessage && phase !== 'completed') {
          return
        }
      }

      if (phase === 'completed' || hasTerminalMessage) {
        // Fetch final result
        void window.api.agentStatus(event.taskId).then((res) => {
          if (!res.success) return
          const status = res.data
          if (status.status === 'completed' && status.result) {
            // Check if this is a skeleton-generate completion
            const currentStatusEntry = statusesRef.current.get(key)
            if (currentStatusEntry?.operationType === 'skeleton-generate') {
              try {
                const parsed = JSON.parse(status.result.content) as {
                  fallback?: boolean
                  reason?: string
                  plan?: SkeletonExpandPlan
                }
                if (parsed.fallback) {
                  // Auto-fallback to standard generation
                  updateStatus(key, (prev) => ({
                    ...prev,
                    phase: 'queued',
                    progress: 0,
                    operationType: 'generate',
                    message: '骨架生成失败，已切换为标准生成',
                  }))
                  taskToLocatorRef.current.delete(event.taskId)
                  void window.api.taskDelete(event.taskId)
                  void startGenerationRef.current(locator)
                  return
                }
                if (parsed.plan) {
                  updateStatus(key, (prev) => ({
                    ...prev,
                    phase: 'skeleton-ready',
                    progress: 100,
                    skeletonPlan: parsed.plan,
                  }))
                  taskToLocatorRef.current.delete(event.taskId)
                  // Task delivered its value — clean up persistent record
                  void window.api.taskDelete(event.taskId)
                  return
                }
              } catch {
                // JSON parse failed — fallback
                updateStatus(key, (prev) => ({
                  ...prev,
                  phase: 'queued',
                  progress: 0,
                  operationType: 'generate',
                  message: '骨架生成失败，已切换为标准生成',
                }))
                taskToLocatorRef.current.delete(event.taskId)
                void window.api.taskDelete(event.taskId)
                void startGenerationRef.current(locator)
                return
              }
            }

            // Standard / batch generation completion — conflict detection
            const currentContent = useDocumentStore.getState().content
            const currentSectionContent = extractMarkdownSectionContent(currentContent, locator)
            const currentDigest = createContentDigest(currentSectionContent)

            updateStatus(key, (prev) => {
              return {
                ...prev,
                phase: resolveTerminalPhase({
                  target: locator,
                  currentDigest,
                  currentSectionContent,
                  baselineDigest: prev.baselineDigest,
                  baselineSectionContent: prev.baselineSectionContent,
                  streamedContent: prev.streamedContent,
                  finalContent: status.result!.content,
                }),
                progress: 100,
                generatedContent: status.result!.content,
              }
            })
            // Refresh annotations — post-processor may have created terminology annotations
            void useAnnotationStore.getState().loadAnnotations(projectIdRef.current)
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
        latestDiagramPatch: undefined,
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

          // Rebuild operationType from the mode that was dispatched
          const inputMode = input.mode as string | undefined
          const operationType: ChapterGenerationStatus['operationType'] =
            inputMode === 'skeleton-generate'
              ? 'skeleton-generate'
              : inputMode === 'skeleton-batch'
                ? 'batch-generate'
                : input.additionalContext !== undefined
                  ? 'regenerate'
                  : 'generate'

          // skeleton-generate tasks produce JSON, not markdown — handle separately
          if (operationType === 'skeleton-generate') {
            const statusRes = await window.api.agentStatus(task.id)
            if (statusRes.success) {
              const status = statusRes.data

              if (status.status === 'completed' && status.result) {
                // Attempt to restore the plan so user can confirm without re-generating
                try {
                  const parsed = JSON.parse(status.result.content) as {
                    fallback?: boolean
                    plan?: SkeletonExpandPlan
                  }
                  if (parsed.plan && !parsed.fallback) {
                    restoredStatuses.set(key, {
                      target,
                      phase: 'skeleton-ready',
                      progress: 100,
                      taskId: task.id,
                      operationType,
                      skeletonPlan: parsed.plan,
                    })
                    // Task delivered its value — clean up persistent record
                    void window.api.taskDelete(task.id)
                  }
                  // fallback=true results are transient; discard and clean up
                  if (parsed.fallback) {
                    void window.api.taskDelete(task.id)
                  }
                } catch {
                  // Unparseable — discard silently
                  void window.api.taskDelete(task.id)
                }
              } else if (status.status === 'failed' || status.status === 'cancelled') {
                restoredStatuses.set(key, {
                  target,
                  phase: 'failed',
                  progress: task.progress,
                  taskId: task.id,
                  operationType,
                  error:
                    status.error?.message ??
                    (status.status === 'cancelled' ? '任务已取消' : '骨架生成失败'),
                })
              } else {
                // Still pending/running — register for progress events
                taskToLocatorRef.current.set(task.id, target)
                restoredStatuses.set(key, {
                  target,
                  phase: 'skeleton-generating',
                  progress: task.progress,
                  taskId: task.id,
                  operationType,
                })
              }
            } else if (task.status === 'pending' || task.status === 'running') {
              // agentStatus call failed but task is queued — still register
              taskToLocatorRef.current.set(task.id, target)
              restoredStatuses.set(key, {
                target,
                phase: 'skeleton-generating',
                progress: task.progress,
                taskId: task.id,
                operationType,
              })
            }
            continue
          }

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
          if (task.status === 'pending' || task.status === 'running') {
            const statusRes = await window.api.agentStatus(task.id)
            if (statusRes.success) {
              const status = statusRes.data
              if (status.status === 'completed' && status.result) {
                const terminalPhase = resolveTerminalPhase({
                  target,
                  currentDigest,
                  currentSectionContent,
                  baselineDigest,
                  baselineSectionContent,
                  finalContent: status.result.content,
                })
                restoredStatuses.set(key, {
                  target,
                  phase: terminalPhase,
                  progress: 100,
                  taskId: task.id,
                  operationType,
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
                  operationType,
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
              operationType,
              baselineDigest,
              baselineSectionContent,
            })
            continue
          }

          const statusRes = await window.api.agentStatus(task.id)
          if (!statusRes.success) continue
          const status = statusRes.data

          if (status.status === 'completed' && status.result) {
            const terminalPhase = resolveTerminalPhase({
              target,
              currentDigest,
              currentSectionContent,
              baselineDigest,
              baselineSectionContent,
              finalContent: status.result.content,
            })
            restoredStatuses.set(key, {
              target,
              phase: terminalPhase,
              progress: 100,
              taskId: task.id,
              operationType,
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
              operationType,
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

  useEffect(() => {
    startGenerationRef.current = startGeneration
  }, [startGeneration])

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

  const startSkeletonGenerate = useCallback(
    async (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)

      const currentContent = useDocumentStore.getState().content
      const baselineSectionContent = extractMarkdownSectionContent(currentContent, target)
      const baselineDigest = createContentDigest(baselineSectionContent)

      setStatuses((prev) => {
        const next = new Map(prev)
        next.set(key, {
          target,
          phase: 'skeleton-generating',
          progress: 0,
          taskId: '',
          operationType: 'skeleton-generate',
          baselineDigest,
          baselineSectionContent,
        })
        return next
      })

      const res = await window.api.chapterSkeletonGenerate({ projectId, target })
      if (!res.success) {
        setStatuses((prev) => {
          const next = new Map(prev)
          next.set(key, {
            target,
            phase: 'failed',
            progress: 0,
            taskId: '',
            error: res.error.message,
            operationType: 'skeleton-generate',
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

  const confirmSkeleton = useCallback(
    async (
      target: ChapterHeadingLocator,
      sectionId: string,
      plan: SkeletonExpandPlan
    ): Promise<boolean> => {
      const key = locatorKey(target)
      const res = await window.api.chapterSkeletonConfirm({ projectId, sectionId, plan })
      if (!res.success) {
        updateStatus(key, (prev) => ({
          ...prev,
          phase: 'failed',
          error: '骨架确认失败',
        }))
        return false
      }
      updateStatus(key, (prev) => ({
        ...prev,
        phase: 'skeleton-ready',
        skeletonPlan: plan,
      }))
      return true
    },
    [projectId, updateStatus]
  )

  const startBatchGenerate = useCallback(
    async (target: ChapterHeadingLocator, sectionId: string) => {
      const key = locatorKey(target)

      const currentContent = useDocumentStore.getState().content
      const baselineSectionContent = extractMarkdownSectionContent(currentContent, target)
      const baselineDigest = createContentDigest(baselineSectionContent)

      setStatuses((prev) => {
        const next = new Map(prev)
        const existing = prev.get(key)
        next.set(key, {
          ...(existing ?? { target, taskId: '' }),
          target,
          phase: 'batch-generating',
          progress: 0,
          taskId: existing?.taskId ?? '',
          operationType: 'batch-generate',
          baselineDigest,
          baselineSectionContent,
        })
        return next
      })

      const res = await window.api.chapterBatchGenerate({ projectId, target, sectionId })
      if (!res.success) {
        updateStatus(key, (prev) => ({
          ...prev,
          phase: 'failed',
          error: res.error.message,
        }))
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
      } else if (currentStatus?.operationType === 'skeleton-generate') {
        await startSkeletonGenerate(target)
      } else if (currentStatus?.operationType === 'batch-generate') {
        // For batch retry, we need the sectionId — derive from target
        // The sectionId is constructed the same way as locatorKey
        await startBatchGenerate(target, locatorKey(target))
      } else {
        await startGeneration(target)
      }
    },
    [startGeneration, startRegeneration, startSkeletonGenerate, startBatchGenerate]
  )

  const dismissError = useCallback((target: ChapterHeadingLocator) => {
    const key = locatorKey(target)
    const taskId = statusesRef.current.get(key)?.taskId
    if (taskId) {
      taskToLocatorRef.current.delete(taskId)
      // Remove the task from persistent storage so it won't be restored on next app launch
      void window.api.taskDelete(taskId)
    }
    setStatuses((prev) => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [])

  /** Reset baseline after the editor section is cleared for regeneration */
  const notifySectionCleared = useCallback(
    (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)
      const emptyDigest = createContentDigest('')
      updateStatus(key, (prev) => ({
        ...prev,
        baselineDigest: emptyDigest,
        baselineSectionContent: '',
      }))
    },
    [updateStatus]
  )

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
      startSkeletonGenerate,
      confirmSkeleton,
      startBatchGenerate,
      retry,
      dismissError,
      notifySectionCleared,
      getStatus,
    }),
    [
      confirmSkeleton,
      dismissError,
      getStatus,
      notifySectionCleared,
      projectId,
      retry,
      startBatchGenerate,
      startGeneration,
      startRegeneration,
      startSkeletonGenerate,
      statuses,
    ]
  )
}

export { locatorKey }
