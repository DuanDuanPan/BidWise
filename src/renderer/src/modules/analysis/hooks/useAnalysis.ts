import { useEffect, useRef, useCallback } from 'react'
import { message } from 'antd'
import {
  findAnalysisProjectIdByTaskId,
  getAnalysisProjectState,
  useAnalysisStore,
} from '@renderer/stores'

/** Stale threshold before polling starts (ms) */
const PROGRESS_STALE_THRESHOLD = 10_000
/** Polling interval for task status (ms) */
const POLL_INTERVAL = 3_000

/**
 * Monitor active parse tasks at app level.
 * Handles progress subscription, terminal-state polling, and toast callbacks
 * regardless of which project workspace is currently mounted.
 */
export function useAnalysisTaskMonitor(): void {
  const projects = useAnalysisStore((s) => s.projects)
  const updateParseProgress = useAnalysisStore((s) => s.updateParseProgress)
  const setParseTaskStatus = useAnalysisStore((s) => s.setParseTaskStatus)
  const fetchTenderResult = useAnalysisStore((s) => s.fetchTenderResult)
  const setError = useAnalysisStore((s) => s.setError)
  const reset = useAnalysisStore((s) => s.reset)

  const lastProgressTimeRef = useRef<Record<string, number>>({})
  const terminalHandledRef = useRef<Set<string>>(new Set())

  const clearTaskTracking = useCallback((taskId: string): void => {
    delete lastProgressTimeRef.current[taskId]
    terminalHandledRef.current.delete(taskId)
  }, [])

  useEffect(() => {
    const now = Date.now()
    const activeTaskIds = new Set<string>()

    for (const projectState of Object.values(projects)) {
      if (!projectState.importTaskId) {
        continue
      }

      activeTaskIds.add(projectState.importTaskId)
      if (lastProgressTimeRef.current[projectState.importTaskId] === undefined) {
        lastProgressTimeRef.current[projectState.importTaskId] = now
      }
    }

    for (const taskId of Object.keys(lastProgressTimeRef.current)) {
      if (!activeTaskIds.has(taskId)) {
        clearTaskTracking(taskId)
      }
    }
  }, [clearTaskTracking, projects])

  const checkTaskStatus = useCallback(
    async (projectId: string, taskId: string): Promise<void> => {
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
          setParseTaskStatus(projectId, 'completed')
          await fetchTenderResult(projectId)
          message.success('招标文件解析完成')
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'failed') {
          terminalHandledRef.current.add(taskId)
          const errMsg = task.error ?? '解析失败'
          setError(projectId, errMsg)
          message.error({ content: `解析失败：${errMsg}`, duration: 0 })
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'cancelled') {
          terminalHandledRef.current.add(taskId)
          reset(projectId)
          clearTaskTracking(taskId)
          return
        }

        setParseTaskStatus(projectId, task.status)
      } catch {
        // Polling failure is non-fatal; the next interval will retry.
      }
    },
    [clearTaskTracking, fetchTenderResult, reset, setError, setParseTaskStatus]
  )

  useEffect(() => {
    const unlisten = window.api.onTaskProgress((event) => {
      const state = useAnalysisStore.getState()
      const projectId = findAnalysisProjectIdByTaskId(state, event.taskId)
      if (!projectId) {
        return
      }

      lastProgressTimeRef.current[event.taskId] = Date.now()
      updateParseProgress(projectId, event.progress, event.message ?? '')

      if (event.progress >= 100) {
        void checkTaskStatus(projectId, event.taskId)
      }
    })

    return () => unlisten()
  }, [checkTaskStatus, updateParseProgress])

  useEffect(() => {
    const pollTimer = setInterval(() => {
      const now = Date.now()
      const state = useAnalysisStore.getState()

      for (const [projectId, projectState] of Object.entries(state.projects)) {
        if (!projectState.importTaskId) {
          continue
        }

        const taskId = projectState.importTaskId
        const shouldPoll =
          projectState.parseProgress >= 100 ||
          now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

        if (shouldPoll) {
          void checkTaskStatus(projectId, taskId)
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
