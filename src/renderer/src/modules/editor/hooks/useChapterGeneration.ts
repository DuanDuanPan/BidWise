import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChapterHeadingLocator,
  ChapterStreamProgressPayload,
  ChapterGenerationPhase,
  ChapterGenerationStatus,
  SkeletonExpandPlan,
  BatchSectionProgressPayload,
  BatchSectionRetryingPayload,
  BatchSectionFailedPayload,
  BatchCompletePayload,
  BatchSectionStatus,
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
  if (message === 'batch-section-complete') return 'batch-generating'
  if (message === 'batch-section-retrying') return 'batch-generating'
  if (message === 'batch-section-failed') return 'batch-generating'
  if (message === 'batch-complete') return 'completed'
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

function isBatchSectionCompletePayload(payload: unknown): payload is BatchSectionProgressPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === 'batch-section-complete'
  )
}

function isBatchSectionRetryingPayload(payload: unknown): payload is BatchSectionRetryingPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === 'batch-section-retrying'
  )
}

function isBatchSectionFailedPayload(payload: unknown): payload is BatchSectionFailedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === 'batch-section-failed'
  )
}

function isBatchCompletePayload(payload: unknown): payload is BatchCompletePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === 'batch-complete'
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

function buildBatchStepMessage(
  sectionIndex: number,
  totalCount: number,
  sectionTitle?: string
): string {
  const prefix = `正在生成子章节 ${sectionIndex + 1}/${totalCount}`
  return sectionTitle ? `${prefix}：${sectionTitle}` : prefix
}

function buildInitialBatchSnapshot(plan: SkeletonExpandPlan): string {
  return plan.sections
    .map((section) => {
      const lines = [`${'#'.repeat(section.level)} ${section.title}`, '']
      if (section.guidanceHint?.trim()) {
        lines.push(`> ${section.guidanceHint.trim()}`, '')
      }
      lines.push('> [待生成]')
      return lines.join('\n')
    })
    .join('\n\n')
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

  const tag = `[gen-debug:resolveTerminal] "${target.title}"(L${target.level}#${target.occurrenceIndex})`

  console.debug(
    `${tag} currentDigest=${currentDigest}, baselineDigest=${baselineDigest ?? 'undefined'}`
  )
  console.debug(
    `${tag} currentLen=${normalizedCurrent.length}, baselineLen=${normalizedBaseline?.length ?? 'N/A'}, streamLen=${normalizedStream?.length ?? 'N/A'}, finalLen=${normalizedFinal?.length ?? 'N/A'}`
  )

  if (
    (baselineDigest !== undefined && currentDigest === baselineDigest) ||
    (normalizedBaseline !== undefined && normalizedCurrent === normalizedBaseline)
  ) {
    console.debug(
      `${tag} → completed (baseline match: digest=${currentDigest === baselineDigest}, text=${normalizedCurrent === normalizedBaseline})`
    )
    return 'completed'
  }

  if (
    (normalizedStream !== undefined && normalizedCurrent === normalizedStream) ||
    (normalizedFinal !== undefined && normalizedCurrent === normalizedFinal)
  ) {
    console.debug(
      `${tag} → completed (stream/final match: stream=${normalizedCurrent === normalizedStream}, final=${normalizedCurrent === normalizedFinal})`
    )
    return 'completed'
  }

  // Conflict detected — dump diff hints for debugging
  console.warn(`${tag} → CONFLICTED`)
  if (normalizedBaseline !== undefined && normalizedCurrent !== normalizedBaseline) {
    const diffIdx = [...normalizedCurrent].findIndex((ch, i) => ch !== normalizedBaseline[i])
    console.warn(`${tag} baseline vs current first diff at char ${diffIdx}`)
    if (diffIdx >= 0) {
      console.warn(
        `${tag}   current[${diffIdx}..+40]: ${JSON.stringify(normalizedCurrent.slice(diffIdx, diffIdx + 40))}`
      )
      console.warn(
        `${tag}   baseline[${diffIdx}..+40]: ${JSON.stringify(normalizedBaseline.slice(diffIdx, diffIdx + 40))}`
      )
    }
  }
  if (normalizedFinal !== undefined && normalizedCurrent !== normalizedFinal) {
    const diffIdx = [...normalizedCurrent].findIndex((ch, i) => ch !== normalizedFinal[i])
    console.warn(`${tag} final vs current first diff at char ${diffIdx}`)
    if (diffIdx >= 0) {
      console.warn(
        `${tag}   current[${diffIdx}..+40]: ${JSON.stringify(normalizedCurrent.slice(diffIdx, diffIdx + 40))}`
      )
      console.warn(
        `${tag}   final[${diffIdx}..+40]: ${JSON.stringify(normalizedFinal.slice(diffIdx, diffIdx + 40))}`
      )
    }
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
  /** Exit batch error state to allow manual editing without skipping the section */
  manualEdit: (target: ChapterHeadingLocator) => void
  notifySectionCleared: (target: ChapterHeadingLocator) => void
  /** Advance baseline to the current editor section content after a streaming patch is applied */
  advanceBaseline: (target: ChapterHeadingLocator) => void
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
      const currentStatusEntry = statusesRef.current.get(key)
      const isProgressiveBatch = currentStatusEntry?.operationType === 'batch-generate'
      // ── Progressive batch payloads ──
      if (isBatchSectionCompletePayload(event.payload)) {
        const p = event.payload
        // Register next sub-task's taskId for progress routing
        if (p.nextTaskId) {
          taskToLocatorRef.current.set(p.nextTaskId, locator)
        }
        taskToLocatorRef.current.delete(event.taskId)
        updateStatus(key, (prev) => {
          const sections = prev.batchSections ? [...prev.batchSections] : []
          if (sections[p.sectionIndex]) {
            sections[p.sectionIndex] = {
              ...sections[p.sectionIndex],
              phase: 'completed',
              content: p.sectionMarkdown,
            }
          }
          // Mark next section as generating
          if (p.nextSectionIndex !== undefined && sections[p.nextSectionIndex]) {
            sections[p.nextSectionIndex] = {
              ...sections[p.nextSectionIndex],
              phase: 'generating',
              taskId: p.nextTaskId,
            }
          }
          return {
            ...prev,
            phase: 'batch-generating',
            progress: event.progress,
            taskId: p.nextTaskId ?? prev.taskId,
            message:
              p.nextSectionIndex !== undefined && sections[p.nextSectionIndex]
                ? buildBatchStepMessage(
                    p.nextSectionIndex,
                    sections.length,
                    sections[p.nextSectionIndex].title
                  )
                : '正在组装章节内容',
            batchSections: sections,
            streamedContent: p.assembledSnapshot,
            streamRevision: (prev.streamRevision ?? 0) + 1,
            error: undefined,
          }
        })
        return
      }

      if (isBatchSectionRetryingPayload(event.payload)) {
        const p = event.payload
        // Register newTaskId for progress routing when auto-retry dispatch completes
        if (p.newTaskId) {
          taskToLocatorRef.current.set(p.newTaskId, locator)
          // Old taskId is no longer active — clean up
          taskToLocatorRef.current.delete(event.taskId)
        }
        updateStatus(key, (prev) => {
          const sections = prev.batchSections ? [...prev.batchSections] : []
          if (sections[p.sectionIndex]) {
            sections[p.sectionIndex] = {
              ...sections[p.sectionIndex],
              phase: p.newTaskId ? 'generating' : 'retrying',
              taskId: p.newTaskId ?? sections[p.sectionIndex].taskId,
              retryCount: p.retryCount,
              retryInSeconds: p.retryInSeconds,
              error: undefined,
            }
          }
          return {
            ...prev,
            phase: 'batch-generating',
            progress: event.progress,
            taskId: p.newTaskId ?? prev.taskId,
            message: p.newTaskId
              ? sections.length > 0
                ? buildBatchStepMessage(
                    p.sectionIndex,
                    sections.length,
                    sections[p.sectionIndex]?.title
                  )
                : '正在重试子章节生成'
              : `正在重试（第 ${p.retryCount}/${p.maxRetries} 次，${p.retryInSeconds}s 后）`,
            batchSections: sections,
            error: undefined,
          }
        })
        return
      }

      if (isBatchSectionFailedPayload(event.payload)) {
        const p = event.payload
        taskToLocatorRef.current.delete(event.taskId)
        updateStatus(key, (prev) => {
          const sections = prev.batchSections ? [...prev.batchSections] : []
          if (sections[p.sectionIndex]) {
            sections[p.sectionIndex] = {
              ...sections[p.sectionIndex],
              phase: 'failed',
              error: p.error,
            }
          }
          return {
            ...prev,
            phase: 'batch-generating',
            progress: event.progress,
            message: `子章节生成失败：${p.sectionTitle}`,
            batchSections: sections,
            error: p.error,
            locked: false,
          }
        })
        return
      }

      if (isBatchCompletePayload(event.payload)) {
        const p = event.payload
        updateStatus(key, (prev) => ({
          ...prev,
          phase: p.failedSections.length > 0 ? 'failed' : 'completed',
          progress: 100,
          message: 'batch-complete',
          generatedContent: p.assembledMarkdown,
          streamedContent: p.assembledMarkdown,
          locked: false,
          error:
            p.failedSections.length > 0 ? `${p.failedSections.length} 个子章节生成失败` : undefined,
        }))
        // Refresh annotations
        void useAnnotationStore.getState().loadAnnotations(projectIdRef.current)
        taskToLocatorRef.current.delete(event.taskId)
        return
      }

      const streamPayload = isChapterStreamPayload(event.payload) ? event.payload : null

      if (isProgressiveBatch) {
        if (streamPayload || phase === 'completed' || hasTerminalMessage) {
          return
        }

        updateStatus(key, (prev) => ({
          ...prev,
          phase: 'batch-generating',
          progress: prev.progress,
          latestDiagramPatch: undefined,
        }))
        return
      }

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

            console.debug(
              `[gen-debug:taskComplete] "${locator.title}" currentDigest=${currentDigest}, currentSectionLen=${currentSectionContent.length}, generatedContentLen=${status.result!.content.length}`
            )

            updateStatus(key, (prev) => {
              console.debug(
                `[gen-debug:taskComplete] "${locator.title}" prevBaselineDigest=${prev.baselineDigest ?? 'undefined'}, prevBaselineLen=${prev.baselineSectionContent?.length ?? 'N/A'}, streamedLen=${prev.streamedContent?.length ?? 'N/A'}`
              )
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
              : inputMode === 'skeleton-batch' || inputMode === 'skeleton-batch-single'
                ? 'batch-generate'
                : input.additionalContext !== undefined
                  ? 'regenerate'
                  : 'generate'

          // Recover batchId for batch-generate tasks so retry/skip IPC works after restore
          const restoredBatchId =
            operationType === 'batch-generate' ? (input.batchId as string | undefined) : undefined

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
                  batchId: restoredBatchId,
                })
                continue
              }

              if (status.status === 'failed' || status.status === 'cancelled') {
                // For batch tasks, keep taskId routed so in-flight auto-retry handoff payloads arrive
                if (operationType === 'batch-generate') {
                  taskToLocatorRef.current.set(task.id, target)
                }
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
                  batchId: restoredBatchId,
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
              batchId: restoredBatchId,
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
              batchId: restoredBatchId,
            })
            continue
          }

          if (status.status === 'failed' || status.status === 'cancelled') {
            if (operationType === 'batch-generate') {
              taskToLocatorRef.current.set(task.id, target)
            }
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
              batchId: restoredBatchId,
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

      console.debug(
        `[gen-debug:startGeneration] "${target.title}" baselineDigest=${baselineDigest}, baselineLen=${baselineSectionContent.length}, docLen=${currentContent.length}`
      )

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

      // Build initial batchSections from the skeleton plan
      const currentStatusEntry = statusesRef.current.get(key)
      const skeletonPlan = currentStatusEntry?.skeletonPlan
      const initialBatchSections: BatchSectionStatus[] = skeletonPlan
        ? skeletonPlan.sections.map((s, i) => ({
            index: i,
            title: s.title,
            level: s.level,
            phase: i === 0 ? 'generating' : 'pending',
          }))
        : []
      const initialBatchSnapshot = skeletonPlan
        ? buildInitialBatchSnapshot(skeletonPlan)
        : undefined
      const initialBatchMessage =
        initialBatchSections.length > 0
          ? buildBatchStepMessage(0, initialBatchSections.length, initialBatchSections[0]?.title)
          : '正在生成子章节'

      setStatuses((prev) => {
        const next = new Map(prev)
        const existing = prev.get(key)
        next.set(key, {
          ...(existing ?? { target, taskId: '' }),
          target,
          phase: 'batch-generating',
          progress: 5,
          taskId: existing?.taskId ?? '',
          operationType: 'batch-generate',
          baselineDigest,
          baselineSectionContent,
          message: initialBatchMessage,
          batchSections: initialBatchSections,
          streamedContent: initialBatchSnapshot,
          streamRevision: initialBatchSnapshot ? (existing?.streamRevision ?? 0) + 1 : 0,
          locked: true,
        })
        return next
      })

      const res = await window.api.chapterBatchGenerate({ projectId, target, sectionId })
      if (!res.success) {
        updateStatus(key, (prev) => ({
          ...prev,
          phase: 'failed',
          error: res.error.message,
          locked: false,
        }))
        return
      }

      taskToLocatorRef.current.set(res.data.taskId, target)
      updateStatus(key, (prev) => ({
        ...prev,
        taskId: res.data.taskId,
        batchId: res.data.batchId,
      }))
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
        const batchId = currentStatus.batchId
        if (!batchId) {
          await startGeneration(target)
          return
        }
        const failedSection = currentStatus.batchSections?.find((s) => s.phase === 'failed')
        // Call IPC with explicit index if known, or omit to let service auto-detect
        const res = await window.api.chapterBatchRetrySection({
          projectId,
          batchId,
          sectionIndex: failedSection?.index,
        })
        if (res.success) {
          taskToLocatorRef.current.set(res.data.taskId, target)
          updateStatus(key, (prev) => {
            const sections = prev.batchSections ? [...prev.batchSections] : []
            const idx = res.data.sectionIndex
            if (sections[idx]) {
              sections[idx] = {
                ...sections[idx],
                phase: 'generating',
                taskId: res.data.taskId,
                error: undefined,
              }
            }
            return {
              ...prev,
              phase: 'batch-generating',
              taskId: res.data.taskId,
              message:
                sections.length > 0
                  ? buildBatchStepMessage(idx, sections.length, sections[idx]?.title)
                  : '正在重试子章节生成',
              batchSections: sections,
              error: undefined,
              locked: true,
            }
          })
        } else {
          updateStatus(key, (prev) => ({
            ...prev,
            error: res.error.message,
          }))
        }
      } else {
        await startGeneration(target)
      }
    },
    [projectId, updateStatus, startGeneration, startRegeneration, startSkeletonGenerate]
  )

  const dismissError = useCallback(
    (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)
      const currentStatus = statusesRef.current.get(key)

      // Local fallback when the backend batch orchestration is gone (e.g. after
      // an app restart rehydrated a failed batch status from SQLite). Without
      // this, a failed skip IPC leaves the stale task + error on every launch.
      const purgeBatchLocally = (): void => {
        const taskIds = new Set<string>()
        if (currentStatus?.taskId) taskIds.add(currentStatus.taskId)
        for (const section of currentStatus?.batchSections ?? []) {
          if (section.taskId) taskIds.add(section.taskId)
        }
        for (const taskId of taskIds) {
          taskToLocatorRef.current.delete(taskId)
          void window.api.taskDelete(taskId)
        }
        setStatuses((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
      }

      // In batch mode, "dismiss" means "skip this section and continue"
      if (currentStatus?.operationType === 'batch-generate' && currentStatus.batchId) {
        const failedSection = currentStatus.batchSections?.find((s) => s.phase === 'failed')
        // Call IPC with explicit index if known, or omit to let service auto-detect
        void window.api
          .chapterBatchSkipSection({
            projectId,
            batchId: currentStatus.batchId,
            sectionIndex: failedSection?.index,
          })
          .then((res) => {
            if (!res.success) {
              // Orchestration lost (post-restart) — purge tasks so error does not persist
              purgeBatchLocally()
              return
            }

            const skippedIdx = res.data.skippedSectionIndex
            const snapshot = res.data.assembledSnapshot

            if (res.data.nextTaskId) {
              // Mid-batch: continue chain
              taskToLocatorRef.current.set(res.data.nextTaskId, target)
              updateStatus(key, (prev) => {
                const sections = prev.batchSections ? [...prev.batchSections] : []
                if (sections[skippedIdx]) {
                  sections[skippedIdx] = {
                    ...sections[skippedIdx],
                    phase: 'completed',
                    content: '> [已跳过 - 请手动补充]',
                    error: undefined,
                  }
                }
                if (
                  res.data.nextSectionIndex !== undefined &&
                  sections[res.data.nextSectionIndex]
                ) {
                  sections[res.data.nextSectionIndex] = {
                    ...sections[res.data.nextSectionIndex],
                    phase: 'generating',
                    taskId: res.data.nextTaskId,
                  }
                }
                const nextTitle =
                  res.data.nextSectionIndex !== undefined
                    ? sections[res.data.nextSectionIndex]?.title
                    : undefined
                return {
                  ...prev,
                  phase: 'batch-generating',
                  taskId: res.data.nextTaskId ?? prev.taskId,
                  message:
                    sections.length > 0
                      ? buildBatchStepMessage(
                          res.data.nextSectionIndex ?? 0,
                          sections.length,
                          nextTitle
                        )
                      : '正在继续生成子章节',
                  batchSections: sections,
                  error: undefined,
                  locked: true,
                  streamedContent: snapshot ?? prev.streamedContent,
                  streamRevision: snapshot ? (prev.streamRevision ?? 0) + 1 : prev.streamRevision,
                }
              })
            } else {
              // Terminal: batch completed after skip
              updateStatus(key, (prev) => {
                const sections = prev.batchSections ? [...prev.batchSections] : []
                if (sections[skippedIdx]) {
                  sections[skippedIdx] = {
                    ...sections[skippedIdx],
                    phase: 'completed',
                    content: '> [已跳过 - 请手动补充]',
                    error: undefined,
                  }
                }
                return {
                  ...prev,
                  phase: 'completed',
                  progress: 100,
                  message: 'batch-complete',
                  batchSections: sections,
                  error: undefined,
                  locked: false,
                  generatedContent: snapshot ?? prev.streamedContent,
                  streamedContent: snapshot ?? prev.streamedContent,
                  streamRevision: snapshot ? (prev.streamRevision ?? 0) + 1 : prev.streamRevision,
                }
              })
              // Refresh annotations
              void useAnnotationStore.getState().loadAnnotations(projectIdRef.current)
            }
          })
        return
      }

      // Non-batch: clear the status entirely
      const taskId = currentStatus?.taskId
      if (taskId) {
        taskToLocatorRef.current.delete(taskId)
        void window.api.taskDelete(taskId)
      }
      setStatuses((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
    },
    [projectId, updateStatus]
  )

  const manualEdit = useCallback((target: ChapterHeadingLocator) => {
    const key = locatorKey(target)
    const currentStatus = statusesRef.current.get(key)

    if (currentStatus?.operationType === 'batch-generate') {
      // Exit error state and delete task so re-entry doesn't resurrect it
      const taskId = currentStatus.taskId
      if (taskId) {
        taskToLocatorRef.current.delete(taskId)
        void window.api.taskDelete(taskId)
      }
      setStatuses((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }

    // Non-batch: same as dismissError (clear status entirely)
    const taskId = currentStatus?.taskId
    if (taskId) {
      taskToLocatorRef.current.delete(taskId)
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
      console.debug(`[gen-debug:sectionCleared] "${target.title}" emptyDigest=${emptyDigest}`)
      updateStatus(key, (prev) => ({
        ...prev,
        baselineDigest: emptyDigest,
        baselineSectionContent: '',
      }))
    },
    [updateStatus]
  )

  /** Advance baseline to current editor content so streaming patches are not mistaken for manual edits */
  const advanceBaseline = useCallback(
    (target: ChapterHeadingLocator) => {
      const key = locatorKey(target)
      const currentContent = useDocumentStore.getState().content
      const sectionContent = extractMarkdownSectionContent(currentContent, target)
      const digest = createContentDigest(sectionContent)
      console.debug(
        `[gen-debug:advanceBaseline] "${target.title}" newDigest=${digest}, sectionLen=${sectionContent.length}`
      )
      updateStatus(key, (prev) => {
        console.debug(
          `[gen-debug:advanceBaseline] "${target.title}" prevDigest=${prev.baselineDigest ?? 'undefined'} → ${digest}`
        )
        return {
          ...prev,
          baselineDigest: digest,
          baselineSectionContent: sectionContent,
        }
      })
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
      manualEdit,
      notifySectionCleared,
      advanceBaseline,
      getStatus,
    }),
    [
      advanceBaseline,
      confirmSkeleton,
      dismissError,
      getStatus,
      manualEdit,
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
