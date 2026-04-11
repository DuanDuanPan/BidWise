import { useState, useCallback, useEffect, useRef } from 'react'
import { message } from 'antd'
import type { PreviewTaskResult } from '@shared/export-types'
import type { ExportComplianceGate } from '@shared/analysis-types'

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
  closeComplianceGate: () => void
  forceExport: () => void
}

export interface ComplianceGateState {
  complianceGateOpen: boolean
  complianceGateData: ExportComplianceGate | null
  complianceGateChecking: boolean
}

export type UseExportPreviewReturn = UseExportPreviewState &
  UseExportPreviewActions &
  ComplianceGateState

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
  const projectIdRef = useRef<string | null>(null)
  const previewMetaRef = useRef<PreviewTaskResult | null>(null)
  // Generation counter: guards the async window between exportPreview IPC call
  // and taskId assignment. Incremented on each triggerPreview, cancel, close, and unmount.
  const requestIdRef = useRef(0)

  // Keep refs in sync with state for cleanup access
  const syncRefs = useCallback(
    (s: Partial<Pick<UseExportPreviewState, 'projectId' | 'previewMeta'>>) => {
      if ('projectId' in s) projectIdRef.current = s.projectId ?? null
      if ('previewMeta' in s) previewMetaRef.current = s.previewMeta ?? null
    },
    []
  )

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

  const handleTaskComplete = useCallback(
    async (taskId: string, projectId: string) => {
      // Guard against stale completions: if the task was cancelled or a new preview started, bail out
      if (currentTaskIdRef.current !== taskId) return

      try {
        const statusRes = await window.api.taskGetStatus({ taskId })

        // Re-check after await — user may have cancelled while we were fetching
        if (currentTaskIdRef.current !== taskId) return

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
          syncRefs({ projectId: null, previewMeta: null })
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
        syncRefs({ previewMeta: meta })

        const loadRes = await window.api.exportLoadPreview({
          projectId,
          tempPath: meta.tempPath,
        })

        // Re-check after await
        if (currentTaskIdRef.current !== taskId) return

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
        // Final staleness check
        if (currentTaskIdRef.current !== taskId) return

        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: err instanceof Error ? err.message : '预览加载失败',
        }))
      }
    },
    [syncRefs]
  )

  const triggerPreview = useCallback(
    async (projectId: string) => {
      cleanupSubscription()
      // Cancel the previous in-flight task if known (defense-in-depth with main-process cancellation)
      const previousTaskId = currentTaskIdRef.current
      if (previousTaskId) {
        window.api.taskCancel(previousTaskId).catch(() => {})
      }
      currentTaskIdRef.current = null
      const requestId = ++requestIdRef.current

      setState({
        ...INITIAL_STATE,
        phase: 'loading',
        projectId,
        progress: 0,
        progressMessage: '正在加载方案',
      })
      syncRefs({ projectId, previewMeta: null })

      try {
        const res = await window.api.exportPreview({ projectId })

        // Guard: if cancelled, closed, unmounted, or a new request started during the await, bail
        if (requestIdRef.current !== requestId) {
          // Cancel the orphaned task to free task-queue slot and prevent orphan files
          if (res.success) {
            window.api.taskCancel(res.data.taskId).catch(() => {})
          }
          return
        }

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
          // Guard against events arriving after cancel/close
          if (currentTaskIdRef.current !== taskId) return

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
            syncRefs({ projectId: null, previewMeta: null })
          }
        })

        unsubscribeRef.current = unsubscribe

        // Fix race condition: task may have completed before the listener was registered.
        // Poll current status to catch already-finished tasks.
        handleTaskComplete(taskId, projectId)
      } catch (err) {
        // Guard: if cancelled, closed, unmounted, or a new request started during the await, bail
        if (requestIdRef.current !== requestId) return

        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: err instanceof Error ? err.message : '启动预览失败',
        }))
      }
    },
    [cleanupSubscription, handleTaskComplete, syncRefs]
  )

  const cancelPreview = useCallback(() => {
    const { taskId, projectId } = state
    if (taskId) {
      window.api.taskCancel(taskId).catch(() => {})
    }
    cleanupSubscription()
    requestIdRef.current++
    currentTaskIdRef.current = null
    doCleanup(projectId)
    setState(INITIAL_STATE)
    syncRefs({ projectId: null, previewMeta: null })
  }, [state, cleanupSubscription, doCleanup, syncRefs])

  const closePreview = useCallback(() => {
    const { projectId, previewMeta } = state
    cleanupSubscription()
    requestIdRef.current++
    currentTaskIdRef.current = null
    doCleanup(projectId, previewMeta?.tempPath)
    setState(INITIAL_STATE)
    syncRefs({ projectId: null, previewMeta: null })
  }, [state, cleanupSubscription, doCleanup, syncRefs])

  const retryPreview = useCallback(() => {
    const { projectId } = state
    if (!projectId) return
    triggerPreview(projectId)
  }, [state, triggerPreview])

  // Compliance gate state
  const [complianceGateOpen, setComplianceGateOpen] = useState(false)
  const [complianceGateData, setComplianceGateData] = useState<ExportComplianceGate | null>(null)
  const [complianceGateChecking, setComplianceGateChecking] = useState(false)

  /** Shared helper: actually run the export confirm flow */
  const doExportConfirm = useCallback(
    async (projectId: string, previewMeta: PreviewTaskResult) => {
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
        syncRefs({ projectId: null, previewMeta: null })
        setComplianceGateOpen(false)
        setComplianceGateData(null)
        message.success(`方案已导出到 ${res.data.outputPath}`)
      } catch {
        message.error('导出过程中出现错误')
      }
    },
    [cleanupSubscription, syncRefs]
  )

  const confirmExport = useCallback(async () => {
    const { projectId, previewMeta } = state
    if (!projectId || !previewMeta) return

    // Run compliance gate check first
    setComplianceGateChecking(true)
    try {
      const gateRes = await window.api.complianceExportGate({ projectId })
      setComplianceGateChecking(false)

      if (!gateRes.success) {
        // Gate check failed — proceed with export (best-effort)
        await doExportConfirm(projectId, previewMeta)
        return
      }

      if (gateRes.data.status === 'pass') {
        await doExportConfirm(projectId, previewMeta)
        return
      }

      // blocked or not-ready — open compliance gate modal
      setComplianceGateData(gateRes.data)
      setComplianceGateOpen(true)
    } catch {
      setComplianceGateChecking(false)
      // On error, fallback to export
      await doExportConfirm(projectId, previewMeta)
    }
  }, [state, doExportConfirm])

  const closeComplianceGate = useCallback(() => {
    setComplianceGateOpen(false)
    setComplianceGateData(null)
  }, [])

  const forceExport = useCallback(async () => {
    const { projectId, previewMeta } = state
    if (!projectId || !previewMeta) return

    setComplianceGateOpen(false)
    setComplianceGateData(null)
    await doExportConfirm(projectId, previewMeta)
  }, [state, doExportConfirm])

  // Cleanup on unmount — uses refs to access current values.
  // Writing to requestIdRef.current is intentional (invalidates in-flight requests).
  useEffect(() => {
    return () => {
      cleanupSubscription()
      requestIdRef.current++ // eslint-disable-line react-hooks/exhaustive-deps
      currentTaskIdRef.current = null
      if (projectIdRef.current) {
        doCleanup(projectIdRef.current, previewMetaRef.current?.tempPath)
      }
    }
  }, [cleanupSubscription, doCleanup])

  return {
    ...state,
    triggerPreview,
    cancelPreview,
    retryPreview,
    closePreview,
    confirmExport,
    complianceGateOpen,
    complianceGateData,
    complianceGateChecking,
    closeComplianceGate,
    forceExport,
  }
}
