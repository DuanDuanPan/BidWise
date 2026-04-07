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

type TaskKind = 'import' | 'extraction' | 'mandatory' | 'seed' | 'fog-map' | 'matrix' | 'addendum'

/** Determine whether a taskId is an import, extraction, mandatory, seed, matrix, or addendum task within a project */
function classifyTask(projectState: AnalysisProjectState, taskId: string): TaskKind | null {
  if (projectState.importTaskId === taskId) return 'import'
  if (projectState.extractionTaskId === taskId) return 'extraction'
  if (projectState.mandatoryDetectionTaskId === taskId) return 'mandatory'
  if (projectState.seedGenerationTaskId === taskId) return 'seed'
  if (projectState.fogMapTaskId === taskId) return 'fog-map'
  if (projectState.matrixGenerationTaskId === taskId) return 'matrix'
  if (projectState.addendumImportTaskId === taskId) return 'addendum'
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
  const fetchMatrix = useAnalysisStore((s) => s.fetchMatrix)
  const fetchMatrixStats = useAnalysisStore((s) => s.fetchMatrixStats)
  const setExtractionCompleted = useAnalysisStore((s) => s.setExtractionCompleted)
  const setError = useAnalysisStore((s) => s.setError)
  const reset = useAnalysisStore((s) => s.reset)
  const updateMandatoryDetectionProgress = useAnalysisStore(
    (s) => s.updateMandatoryDetectionProgress
  )
  const setMandatoryDetectionCompleted = useAnalysisStore((s) => s.setMandatoryDetectionCompleted)
  const updateSeedGenerationProgress = useAnalysisStore((s) => s.updateSeedGenerationProgress)
  const setSeedGenerationCompleted = useAnalysisStore((s) => s.setSeedGenerationCompleted)
  const updateFogMapProgress = useAnalysisStore((s) => s.updateFogMapProgress)
  const setFogMapCompleted = useAnalysisStore((s) => s.setFogMapCompleted)
  const updateMatrixGenerationProgress = useAnalysisStore((s) => s.updateMatrixGenerationProgress)
  const setMatrixGenerationCompleted = useAnalysisStore((s) => s.setMatrixGenerationCompleted)
  const updateAddendumImportProgress = useAnalysisStore((s) => s.updateAddendumImportProgress)
  const setAddendumImportCompleted = useAnalysisStore((s) => s.setAddendumImportCompleted)

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
      for (const taskId of [
        projectState.importTaskId,
        projectState.extractionTaskId,
        projectState.mandatoryDetectionTaskId,
        projectState.seedGenerationTaskId,
        projectState.fogMapTaskId,
        projectState.matrixGenerationTaskId,
        projectState.addendumImportTaskId,
      ]) {
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
        const latestProjectState = getAnalysisProjectState(useAnalysisStore.getState(), projectId)
        if (classifyTask(latestProjectState, taskId) !== kind) {
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'completed') {
          terminalHandledRef.current.add(taskId)
          if (kind === 'import') {
            setParseTaskStatus(projectId, 'completed')
            await fetchTenderResult(projectId)
            message.success('招标文件解析完成')
          } else if (kind === 'extraction') {
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
          } else if (kind === 'mandatory') {
            await setMandatoryDetectionCompleted(projectId)
            message.success('必响应项检测完成')
          } else if (kind === 'seed') {
            await setSeedGenerationCompleted(projectId)
            message.success('策略种子生成完成')
          } else if (kind === 'fog-map') {
            await setFogMapCompleted(projectId, taskId)
            message.success('迷雾地图生成完成')
          } else if (kind === 'matrix') {
            await setMatrixGenerationCompleted(projectId)
            message.success('追溯矩阵生成完成')
          } else if (kind === 'addendum') {
            await setAddendumImportCompleted(projectId)
            message.success('补遗导入完成')
          }
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'failed') {
          terminalHandledRef.current.add(taskId)
          const errMsgMap: Record<TaskKind, string> = {
            import: '解析失败',
            extraction: '抽取失败',
            mandatory: '*项检测失败',
            seed: '策略种子生成失败',
            'fog-map': '迷雾地图生成失败',
            matrix: '追溯矩阵生成失败',
            addendum: '补遗导入失败',
          }
          const errMsg = task.error ?? errMsgMap[kind]
          if (kind === 'addendum' && errMsg.includes('追溯映射更新')) {
            await fetchRequirements(projectId)
            await fetchMatrix(projectId)
            await fetchMatrixStats(projectId)
          }
          setError(projectId, errMsg, kind)
          message.error({
            content: `${errMsgMap[kind]}：${errMsg}`,
            duration: 0,
          })
          clearTaskTracking(taskId)
          return
        }

        if (task.status === 'cancelled') {
          terminalHandledRef.current.add(taskId)
          if (kind === 'import') {
            reset(projectId)
          } else {
            const cancelledMsgMap: Record<Exclude<TaskKind, 'import'>, string> = {
              extraction: '抽取任务已取消',
              mandatory: '*项检测已取消',
              seed: '策略种子生成已取消',
              'fog-map': '迷雾地图生成已取消',
              matrix: '追溯矩阵生成已取消',
              addendum: '补遗导入已取消',
            }
            setError(projectId, cancelledMsgMap[kind], kind)
          }
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
      fetchMatrix,
      fetchMatrixStats,
      fetchRequirements,
      fetchScoringModel,
      fetchTenderResult,
      reset,
      setError,
      setExtractionCompleted,
      setFogMapCompleted,
      setMandatoryDetectionCompleted,
      setMatrixGenerationCompleted,
      setAddendumImportCompleted,
      setParseTaskStatus,
      setSeedGenerationCompleted,
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
      const progressMessage =
        event.message && event.message !== 'failed' && event.message !== 'cancelled'
          ? event.message
          : undefined

      if (kind === 'import') {
        updateParseProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'extraction') {
        updateExtractionProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'mandatory') {
        updateMandatoryDetectionProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'seed') {
        updateSeedGenerationProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'fog-map') {
        updateFogMapProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'matrix') {
        updateMatrixGenerationProgress(projectId, event.progress, progressMessage)
      } else if (kind === 'addendum') {
        updateAddendumImportProgress(projectId, event.progress, progressMessage)
      }

      if (event.progress >= 100) {
        void checkTaskStatus(projectId, event.taskId, kind)
      }
    })

    return () => unlisten()
  }, [
    checkTaskStatus,
    updateExtractionProgress,
    updateFogMapProgress,
    updateMandatoryDetectionProgress,
    updateSeedGenerationProgress,
    updateMatrixGenerationProgress,
    updateAddendumImportProgress,
    updateParseProgress,
  ])

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

        // Check mandatory detection task
        if (projectState.mandatoryDetectionTaskId) {
          const taskId = projectState.mandatoryDetectionTaskId
          const shouldPoll =
            projectState.mandatoryDetectionProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'mandatory')
          }
        }

        // Check seed generation task
        if (projectState.seedGenerationTaskId) {
          const taskId = projectState.seedGenerationTaskId
          const shouldPoll =
            projectState.seedGenerationProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'seed')
          }
        }

        // Check fog map generation task
        if (projectState.fogMapTaskId) {
          const taskId = projectState.fogMapTaskId
          const shouldPoll =
            projectState.fogMapProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'fog-map')
          }
        }

        // Check matrix generation task
        if (projectState.matrixGenerationTaskId) {
          const taskId = projectState.matrixGenerationTaskId
          const shouldPoll =
            projectState.matrixGenerationProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'matrix')
          }
        }

        // Check addendum import task
        if (projectState.addendumImportTaskId) {
          const taskId = projectState.addendumImportTaskId
          const shouldPoll =
            projectState.addendumImportProgress >= 100 ||
            now - (lastProgressTimeRef.current[taskId] ?? now) > PROGRESS_STALE_THRESHOLD

          if (shouldPoll) {
            void checkTaskStatus(projectId, taskId, 'addendum')
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
