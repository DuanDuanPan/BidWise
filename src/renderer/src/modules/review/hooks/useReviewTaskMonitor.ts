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
 * Monitor active adversarial lineup generation AND review execution tasks at app level.
 * Handles progress subscription, terminal-state polling, and toast callbacks
 * regardless of which project workspace is currently mounted.
 */
export function useReviewTaskMonitor(): void {
  const projects = useReviewStore((s) => s.projects)
  const setLineupProgress = useReviewStore((s) => s.setLineupProgress)
  const setLineupTaskError = useReviewStore((s) => s.setLineupTaskError)
  const loadLineup = useReviewStore((s) => s.loadLineup)
  const updateReviewProgress = useReviewStore((s) => s.updateReviewProgress)
  const setReviewTaskError = useReviewStore((s) => s.setReviewTaskError)
  const loadReview = useReviewStore((s) => s.loadReview)

  const lastProgressTimeRef = useRef<Record<string, number>>({})
  const terminalHandledRef = useRef<Set<string>>(new Set())

  const clearTaskTracking = useCallback((taskId: string): void => {
    delete lastProgressTimeRef.current[taskId]
    terminalHandledRef.current.delete(taskId)
  }, [])

  // Track active task IDs (lineup + review)
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
      if (projectState.reviewTaskId) {
        activeTaskIds.add(projectState.reviewTaskId)
        if (lastProgressTimeRef.current[projectState.reviewTaskId] === undefined) {
          lastProgressTimeRef.current[projectState.reviewTaskId] = now
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
    async (projectId: string, taskId: string, taskKind: 'lineup' | 'review'): Promise<void> => {
      if (terminalHandledRef.current.has(taskId)) return

      try {
        const res = await window.api.taskGetStatus({ taskId })
        if (!res.success || !res.data) return

        const task = res.data
        const latestProjectState = getReviewProjectState(useReviewStore.getState(), projectId)

        // Check if taskId still matches
        if (taskKind === 'lineup' && latestProjectState.lineupTaskId !== taskId) {
          clearTaskTracking(taskId)
          return
        }
        if (taskKind === 'review' && latestProjectState.reviewTaskId !== taskId) {
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'completed') {
          terminalHandledRef.current.add(taskId)

          if (taskKind === 'lineup') {
            const loaded = await loadLineup(projectId)
            if (!loaded) {
              setLineupTaskError(projectId, '阵容加载失败，请重试')
              message.error('对抗角色阵容加载失败')
            } else {
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
          } else {
            // Review task completed
            await loadReview(projectId)
            const freshState = getReviewProjectState(useReviewStore.getState(), projectId)
            const sessionStatus = freshState.reviewSession?.status
            if (sessionStatus === 'partial') {
              const failedCount =
                freshState.reviewSession?.roleResults.filter((r) => r.status === 'failed').length ??
                0
              message.warning(`${failedCount}个角色评审失败，可单独重试`)
            } else {
              message.success('对抗评审完成')
            }
          }
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'failed') {
          terminalHandledRef.current.add(taskId)

          if (taskKind === 'lineup') {
            const errMsg = task.error ?? '对抗角色生成失败'
            setLineupTaskError(projectId, errMsg)
            message.error({ content: `对抗角色生成失败：${errMsg}`, duration: 0 })
          } else {
            // Review task failed — still load review to show failed session state
            await loadReview(projectId)
            const errMsg = task.error ?? '对抗评审失败'
            setReviewTaskError(projectId, errMsg)
            message.error(`对抗评审失败：${errMsg}`)
          }
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'cancelled') {
          terminalHandledRef.current.add(taskId)

          if (taskKind === 'lineup') {
            setLineupTaskError(projectId, '对抗角色生成已取消')
          } else {
            setReviewTaskError(projectId, '对抗评审已取消')
          }
          clearTaskTracking(taskId)
          return
        }
      } catch {
        // Polling failure is non-fatal
      }
    },
    [clearTaskTracking, loadLineup, loadReview, setLineupTaskError, setReviewTaskError]
  )

  // Subscribe to progress events
  useEffect(() => {
    const unlisten = window.api.onTaskProgress((event) => {
      const state = useReviewStore.getState()
      const match = findReviewProjectIdByTaskId(state, event.taskId)
      if (!match) return

      const { projectId, taskKind } = match
      lastProgressTimeRef.current[event.taskId] = Date.now()
      const hasTerminalMessage = event.message === 'failed' || event.message === 'cancelled'
      const progressMessage = event.message && !hasTerminalMessage ? event.message : undefined

      if (taskKind === 'lineup') {
        setLineupProgress(projectId, event.progress, progressMessage)
      } else {
        updateReviewProgress(projectId, event.progress, progressMessage)
      }

      if (event.progress >= 100 || hasTerminalMessage) {
        void checkTaskStatus(projectId, event.taskId, taskKind)
      }
    })

    return () => unlisten()
  }, [checkTaskStatus, setLineupProgress, updateReviewProgress])

  // Poll for stale or completed tasks
  useEffect(() => {
    const pollTimer = setInterval(() => {
      const now = Date.now()
      const state = useReviewStore.getState()

      for (const [projectId, projectState] of Object.entries(state.projects)) {
        // Poll lineup tasks
        if (projectState.lineupTaskId) {
          const taskId = projectState.lineupTaskId
          const shouldPoll =
            projectState.lineupProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'lineup')
          }
        }

        // Poll review tasks
        if (projectState.reviewTaskId) {
          const taskId = projectState.reviewTaskId
          const shouldPoll =
            projectState.reviewProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'review')
          }
        }
      }
    }, POLL_INTERVAL)

    return () => clearInterval(pollTimer)
  }, [checkTaskStatus, projects])
}
