import { useEffect, useRef, useCallback } from 'react'
import { message } from 'antd'
import {
  findAnalysisProjectIdByTaskId,
  getAnalysisProjectState,
  useAnalysisStore,
} from '@renderer/stores'
import type { AnalysisProjectState } from '@renderer/stores'

/** Stale threshold before polling starts (ms) */
const PROGRESS_STALE_THRESHOLD = 10_000
/** Polling interval for task status (ms) */
const POLL_INTERVAL = 3_000

type TaskKind = 'import' | 'extraction'

/** Determine whether a taskId is an import or extraction task within a project */
function classifyTask(projectState: AnalysisProjectState, taskId: string): TaskKind | null {
  if (projectState.importTaskId === taskId) return 'import'
  if (projectState.extractionTaskId === taskId) return 'extraction'
  return null
}

/**
 * Monitor active parse and extraction tasks at app level.
 * Handles progress subscription, terminal-state polling, and toast callbacks
 * regardless of which project workspace is currently mounted.
 */
export function useAnalysisTaskMonitor(): void {
  const projects = useAnalysisStore((s) => s.projects)
  const updateParseProgress = useAnalysisStore((s) => s.updateParseProgress)
  const setParseTaskStatus = useAnalysisStore((s) => s.setParseTaskStatus)
  const fetchTenderResult = useAnalysisStore((s) => s.fetchTenderResult)
  const updateExtractionProgress = useAnalysisStore((s) => s.updateExtractionProgress)
  const fetchRequirements = useAnalysisStore((s) => s.fetchRequirements)
  const fetchScoringModel = useAnalysisStore((s) => s.fetchScoringModel)
  const setExtractionCompleted = useAnalysisStore((s) => s.setExtractionCompleted)
  const setError = useAnalysisStore((s) => s.setError)
  const reset = useAnalysisStore((s) => s.reset)

  const lastProgressTimeRef = useRef<Record<string, number>>({})
  const terminalHandledRef = useRef<Set<string>>(new Set())

  const clearTaskTracking = useCallback((taskId: string): void => {
    delete lastProgressTimeRef.current[taskId]
    terminalHandledRef.current.delete(taskId)
  }, [])

  // Track both importTaskId and extractionTaskId
  useEffect(() => {
    const now = Date.now()
    const activeTaskIds = new Set<string>()

    for (const projectState of Object.values(projects)) {
      for (const taskId of [projectState.importTaskId, projectState.extractionTaskId]) {
        if (!taskId) continue
        activeTaskIds.add(taskId)
        if (lastProgressTimeRef.current[taskId] === undefined) {
          lastProgressTimeRef.current[taskId] = now
        }
      }
    }

    for (const taskId of Object.keys(lastProgressTimeRef.current)) {
      if (!activeTaskIds.has(taskId)) {
        clearTaskTracking(taskId)
      }
    }
  }, [clearTaskTracking, projects])

  const checkTaskStatus = useCallback(
    async (projectId: string, taskId: string, kind: TaskKind): Promise<void> => {
      if (terminalHandledRef.current.has(taskId)) {
        return
      }

      try {
        const res = await window.api.taskGetStatus({ taskId })
        if (!res.success || !res.data) {
          return
        }

        const task = res.data

        if (task.status === 'completed') {
          terminalHandledRef.current.add(taskId)
          if (kind === 'import') {
            setParseTaskStatus(projectId, 'completed')
            await fetchTenderResult(projectId)
            message.success('招标文件解析完成')
          } else {
            await fetchRequirements(projectId)
            await fetchScoringModel(projectId)
            // Get the freshly fetched state
            const freshState = getAnalysisProjectState(useAnalysisStore.getState(), projectId)
            const scoringModel = freshState.scoringModel ?? null
            setExtractionCompleted(projectId, {
              requirements: freshState.requirements ?? [],
              scoringModel,
            })
            if (scoringModel) {
              message.success('需求与评分模型抽取完成')
            } else {
              message.warning('需求抽取完成，但评分模型加载失败，请稍后重试')
            }
          }
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'failed') {
          terminalHandledRef.current.add(taskId)
          const errMsg = task.error ?? (kind === 'import' ? '解析失败' : '抽取失败')
          setError(projectId, errMsg, kind)
          message.error({
            content: kind === 'import' ? `解析失败：${errMsg}` : `抽取失败：${errMsg}`,
            duration: 0,
          })
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'cancelled') {
          terminalHandledRef.current.add(taskId)
          reset(projectId)
          clearTaskTracking(taskId)
          return
        }

        if (kind === 'import') {
          setParseTaskStatus(projectId, task.status)
        }
      } catch {
        // Polling failure is non-fatal; the next interval will retry.
      }
    },
    [
      clearTaskTracking,
      fetchRequirements,
      fetchScoringModel,
      fetchTenderResult,
      reset,
      setError,
      setExtractionCompleted,
      setParseTaskStatus,
    ]
  )

  // Subscribe to progress events for both import and extraction tasks
  useEffect(() => {
    const unlisten = window.api.onTaskProgress((event) => {
      const state = useAnalysisStore.getState()
      const projectId = findAnalysisProjectIdByTaskId(state, event.taskId)
      if (!projectId) {
        return
      }

      const projectState = getAnalysisProjectState(state, projectId)
      const kind = classifyTask(projectState, event.taskId)
      if (!kind) return

      lastProgressTimeRef.current[event.taskId] = Date.now()

      if (kind === 'import') {
        updateParseProgress(projectId, event.progress, event.message ?? '')
      } else {
        updateExtractionProgress(projectId, event.progress, event.message ?? '')
      }

      if (event.progress >= 100) {
        void checkTaskStatus(projectId, event.taskId, kind)
      }
    })

    return () => unlisten()
  }, [checkTaskStatus, updateExtractionProgress, updateParseProgress])

  // Poll for stale or completed tasks
  useEffect(() => {
    const pollTimer = setInterval(() => {
      const now = Date.now()
      const state = useAnalysisStore.getState()

      for (const [projectId, projectState] of Object.entries(state.projects)) {
        // Check import task
        if (projectState.importTaskId) {
          const taskId = projectState.importTaskId
          const shouldPoll =
            projectState.parseProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'import')
          }
        }

        // Check extraction task
        if (projectState.extractionTaskId) {
          const taskId = projectState.extractionTaskId
          const shouldPoll =
            projectState.extractionProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'extraction')
          }
        }
      }
    }, POLL_INTERVAL)

    return () => clearInterval(pollTimer)
  }, [checkTaskStatus, projects])
}

export function useImportTender(projectId: string): {
  importTender: (filePath: string) => Promise<void>
  loading: boolean
  error: string | null
} {
  const storeImport = useAnalysisStore((s) => s.importTender)
  const projectState = useAnalysisStore((s) => getAnalysisProjectState(s, projectId))

  const importTender = useCallback(
    (filePath: string) => storeImport(projectId, filePath),
    [projectId, storeImport]
  )

  return {
    importTender,
    loading: projectState.loading,
    error: projectState.error,
  }
}

export function useTenderResult(projectId: string): void {
  const fetchTenderResult = useAnalysisStore((s) => s.fetchTenderResult)

  useEffect(() => {
    void fetchTenderResult(projectId)
  }, [projectId, fetchTenderResult])
}
