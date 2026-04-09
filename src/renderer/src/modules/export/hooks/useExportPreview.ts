import { useState, useCallback, useEffect, useRef } from 'react'
import { message } from 'antd'
import type { PreviewTaskResult } from '@shared/export-types'

export type PreviewPhase = 'idle' | 'loading' | 'ready' | 'error'

export interface UseExportPreviewState {
  phase: PreviewPhase
  projectId: string | null
  taskId: string | null
  progress: number
  progressMessage: string | null
  previewMeta: PreviewTaskResult | null
  docxBase64: string | null
  error: string | null
}

export interface UseExportPreviewActions {
  triggerPreview: (projectId: string) => void
  cancelPreview: () => void
  retryPreview: () => void
  closePreview: () => void
  confirmExport: () => void
}

export type UseExportPreviewReturn = UseExportPreviewState & UseExportPreviewActions

const INITIAL_STATE: UseExportPreviewState = {
  phase: 'idle',
  projectId: null,
  taskId: null,
  progress: 0,
  progressMessage: null,
  previewMeta: null,
  docxBase64: null,
  error: null,
}

export function useExportPreview(): UseExportPreviewReturn {
  const [state, setState] = useState<UseExportPreviewState>(INITIAL_STATE)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const currentTaskIdRef = useRef<string | null>(null)

  const cleanupSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }
  }, [])

  const doCleanup = useCallback((projectId: string | null, tempPath?: string) => {
    if (!projectId) return
    window.api.exportCleanupPreview({ projectId, tempPath }).catch(() => {
      // Best-effort cleanup
    })
  }, [])

  const handleTaskComplete = useCallback(async (taskId: string, projectId: string) => {
    try {
      const statusRes = await window.api.taskGetStatus({ taskId })
      if (!statusRes.success || !statusRes.data) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: '无法获取任务状态',
        }))
        return
      }

      const task = statusRes.data
      if (task.status === 'failed') {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: task.error ?? '预览渲染失败',
        }))
        return
      }

      if (task.status === 'cancelled') {
        setState(INITIAL_STATE)
        return
      }

      if (task.status !== 'completed' || !task.output) {
        return
      }

      const meta: PreviewTaskResult =
        typeof task.output === 'string' ? JSON.parse(task.output) : task.output

      setState((prev) => ({
        ...prev,
        previewMeta: meta,
        progress: 90,
        progressMessage: '正在加载预览内容',
      }))

      const loadRes = await window.api.exportLoadPreview({
        projectId,
        tempPath: meta.tempPath,
      })

      if (!loadRes.success) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: '加载预览内容失败',
        }))
        return
      }

      setState((prev) => ({
        ...prev,
        phase: 'ready',
        progress: 100,
        progressMessage: null,
        docxBase64: loadRes.data.docxBase64,
      }))
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : '预览加载失败',
      }))
    }
  }, [])

  const triggerPreview = useCallback(
    async (projectId: string) => {
      cleanupSubscription()

      setState({
        ...INITIAL_STATE,
        phase: 'loading',
        projectId,
        progress: 0,
        progressMessage: '正在加载方案',
      })

      try {
        const res = await window.api.exportPreview({ projectId })
        if (!res.success) {
          const errMsg = !res.success && 'error' in res ? res.error.message : '启动预览失败'
          setState((prev) => ({
            ...prev,
            phase: 'error',
            error: errMsg,
          }))
          return
        }

        const { taskId } = res.data
        currentTaskIdRef.current = taskId
        setState((prev) => ({ ...prev, taskId }))

        const unsubscribe = window.api.onTaskProgress((event) => {
          if (event.taskId !== taskId) return

          setState((prev) => ({
            ...prev,
            progress: Math.min(event.progress, 90),
            progressMessage: event.message ?? prev.progressMessage,
          }))

          if (event.progress >= 100 || event.message === 'completed') {
            handleTaskComplete(taskId, projectId)
          } else if (event.message === 'failed') {
            setState((prev) => ({
              ...prev,
              phase: 'error',
              error: '预览渲染失败',
            }))
          } else if (event.message === 'cancelled') {
            setState(INITIAL_STATE)
          }
        })

        unsubscribeRef.current = unsubscribe
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: err instanceof Error ? err.message : '启动预览失败',
        }))
      }
    },
    [cleanupSubscription, handleTaskComplete]
  )

  const cancelPreview = useCallback(() => {
    const { taskId, projectId } = state
    if (taskId) {
      window.api.taskCancel(taskId).catch(() => {})
    }
    cleanupSubscription()
    currentTaskIdRef.current = null
    doCleanup(projectId)
    setState(INITIAL_STATE)
  }, [state, cleanupSubscription, doCleanup])

  const closePreview = useCallback(() => {
    const { projectId, previewMeta } = state
    cleanupSubscription()
    currentTaskIdRef.current = null
    doCleanup(projectId, previewMeta?.tempPath)
    setState(INITIAL_STATE)
  }, [state, cleanupSubscription, doCleanup])

  const retryPreview = useCallback(() => {
    const { projectId } = state
    if (!projectId) return
    triggerPreview(projectId)
  }, [state, triggerPreview])

  const confirmExport = useCallback(async () => {
    const { projectId, previewMeta } = state
    if (!projectId || !previewMeta) return

    try {
      const res = await window.api.exportConfirm({
        projectId,
        tempPath: previewMeta.tempPath,
      })

      if (!res.success) {
        message.error('导出失败')
        return
      }

      if (res.data.cancelled) {
        // User cancelled save dialog — keep modal open
        return
      }

      // Export successful
      cleanupSubscription()
      currentTaskIdRef.current = null
      setState(INITIAL_STATE)
      message.success(`方案已导出到 ${res.data.outputPath}`)
    } catch {
      message.error('导出过程中出现错误')
    }
  }, [state, cleanupSubscription])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscription()
      if (state.projectId) {
        doCleanup(state.projectId, state.previewMeta?.tempPath)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    ...state,
    triggerPreview,
    cancelPreview,
    retryPreview,
    closePreview,
    confirmExport,
  }
}
