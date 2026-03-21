import { useEffect } from 'react'
import { message } from 'antd'
import { getAnalysisProjectState, useAnalysisStore } from '@renderer/stores'
import { TenderUploadZone } from './TenderUploadZone'
import { ParseProgressPanel } from './ParseProgressPanel'
import { TenderResultSummary } from './TenderResultSummary'
import type { AnalysisViewProps } from '../types'

export function AnalysisView({ projectId }: AnalysisViewProps): React.JSX.Element {
  const projectState = useAnalysisStore((state) => getAnalysisProjectState(state, projectId))
  const fetchTenderResult = useAnalysisStore((s) => s.fetchTenderResult)
  const reset = useAnalysisStore((s) => s.reset)

  const { parsedTender, importTaskId, parseProgress, parseMessage, loading, error, taskStatus } =
    projectState

  // On mount / project change: check for existing tender result
  useEffect(() => {
    void fetchTenderResult(projectId)
  }, [projectId, fetchTenderResult])

  const handleCancel = async (): Promise<void> => {
    if (!importTaskId) return
    try {
      const res = await window.api.taskCancel(importTaskId)
      if (res.success) {
        reset(projectId)
      } else {
        message.error(`取消失败：${res.error.message}`)
      }
    } catch {
      message.error('取消失败，请重试')
    }
  }

  // Determine view state
  const isParsing = importTaskId !== null
  const isParseCompleted =
    importTaskId !== null && taskStatus === 'completed' && parsedTender === null
  const hasParsedResult = parsedTender !== null

  if (hasParsedResult) {
    return (
      <div className="flex-1 overflow-auto" data-testid="analysis-view">
        <TenderResultSummary parsedTender={parsedTender} />
        <div className="border-border border-t p-4">
          <TenderUploadZone projectId={projectId} disabled={loading} />
        </div>
      </div>
    )
  }

  if (isParsing || isParseCompleted) {
    return (
      <div className="flex flex-1 items-center justify-center" data-testid="analysis-view">
        <ParseProgressPanel
          progress={parseProgress}
          message={parseMessage}
          onCancel={handleCancel}
          onViewResult={() => {
            void fetchTenderResult(projectId)
          }}
          completed={isParseCompleted}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4"
        data-testid="analysis-view"
      >
        <div className="text-red-500">{error}</div>
        <TenderUploadZone projectId={projectId} disabled={loading} />
      </div>
    )
  }

  // Default: upload zone (empty state)
  return (
    <div className="flex flex-1 items-center justify-center" data-testid="analysis-view">
      <TenderUploadZone projectId={projectId} disabled={loading} />
    </div>
  )
}
