import { useEffect, useRef, useCallback } from 'react'
import { message } from 'antd'
import {
  findReviewProjectIdByTaskId,
  getReviewProjectState,
  useReviewStore,
} from '@renderer/stores'

/** Stale threshold before polling starts (ms) */
const PROGRESS_STALE_THRESHOLD = 10_000
/** Polling interval for task status (ms) */
const POLL_INTERVAL = 3_000

/**
 * Monitor active adversarial lineup generation tasks at app level.
 * Handles progress subscription, terminal-state polling, and toast callbacks
 * regardless of which project workspace is currently mounted.
 */
export function useReviewTaskMonitor(): void {
  const projects = useReviewStore((s) => s.projects)
  const setLineupProgress = useReviewStore((s) => s.setLineupProgress)
  const setLineupTaskError = useReviewStore((s) => s.setLineupTaskError)
  const loadLineup = useReviewStore((s) => s.loadLineup)

  const lastProgressTimeRef = useRef<Record<string, number>>({})
  const terminalHandledRef = useRef<Set<string>>(new Set())

  const clearTaskTracking = useCallback((taskId: string): void => {
    delete lastProgressTimeRef.current[taskId]
    terminalHandledRef.current.delete(taskId)
  }, [])

  // Track active lineup task IDs
  useEffect(() => {
    const now = Date.now()
    const activeTaskIds = new Set<string>()

    for (const projectState of Object.values(projects)) {
      if (projectState.lineupTaskId) {
        activeTaskIds.add(projectState.lineupTaskId)
        if (lastProgressTimeRef.current[projectState.lineupTaskId] === undefined) {
          lastProgressTimeRef.current[projectState.lineupTaskId] = now
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
    async (projectId: string, taskId: string): Promise<void> => {
      if (terminalHandledRef.current.has(taskId)) return

      try {
        const res = await window.api.taskGetStatus({ taskId })
        if (!res.success || !res.data) return

        const task = res.data
        const latestProjectState = getReviewProjectState(useReviewStore.getState(), projectId)
        if (latestProjectState.lineupTaskId !== taskId) {
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'completed') {
          terminalHandledRef.current.add(taskId)
          const loaded = await loadLineup(projectId)

          if (!loaded) {
            setLineupTaskError(projectId, '阵容加载失败，请重试')
            message.error('对抗角色阵容加载失败')
          } else {
            // Check if fallback lineup
            const freshState = getReviewProjectState(useReviewStore.getState(), projectId)
            if (
              freshState.lineup?.generationSource === 'fallback' &&
              freshState.lineup.warningMessage
            ) {
              message.warning(freshState.lineup.warningMessage)
            } else {
              message.success('对抗角色阵容生成完成')
            }
          }
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'failed') {
          terminalHandledRef.current.add(taskId)
          // Task failed means fallback persistence itself failed — no valid lineup
          // exists. Do NOT loadLineup() here: it would retrieve stale pre-regen
          // data and silently swallow the real error.
          const errMsg = task.error ?? '对抗角色生成失败'
          setLineupTaskError(projectId, errMsg)
          message.error({ content: `对抗角色生成失败：${errMsg}`, duration: 0 })
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'cancelled') {
          terminalHandledRef.current.add(taskId)
          setLineupTaskError(projectId, '对抗角色生成已取消')
          clearTaskTracking(taskId)
          return
        }
      } catch {
        // Polling failure is non-fatal
      }
    },
    [clearTaskTracking, loadLineup, setLineupTaskError]
  )

  // Subscribe to progress events
  useEffect(() => {
    const unlisten = window.api.onTaskProgress((event) => {
      const state = useReviewStore.getState()
      const projectId = findReviewProjectIdByTaskId(state, event.taskId)
      if (!projectId) return

      lastProgressTimeRef.current[event.taskId] = Date.now()
      const progressMessage =
        event.message && event.message !== 'failed' && event.message !== 'cancelled'
          ? event.message
          : undefined

      setLineupProgress(projectId, event.progress, progressMessage)

      if (event.progress >= 100) {
        void checkTaskStatus(projectId, event.taskId)
      }
    })

    return () => unlisten()
  }, [checkTaskStatus, setLineupProgress])

  // Poll for stale or completed tasks
  useEffect(() => {
    const pollTimer = setInterval(() => {
      const now = Date.now()
      const state = useReviewStore.getState()

      for (const [projectId, projectState] of Object.entries(state.projects)) {
        if (projectState.lineupTaskId) {
          const taskId = projectState.lineupTaskId
          const shouldPoll =
            projectState.lineupProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId)
          }
        }
      }
    }, POLL_INTERVAL)

    return () => clearInterval(pollTimer)
  }, [checkTaskStatus, projects])
}
