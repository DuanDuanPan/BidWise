import { Progress } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

interface ExportPreviewLoadingOverlayProps {
  progress: number
  progressMessage: string | null
  onCancel: () => void
}

export function ExportPreviewLoadingOverlay({
  progress,
  progressMessage,
  onCancel,
}: ExportPreviewLoadingOverlayProps): React.JSX.Element {
  return (
    <div
      className="fixed right-6 bottom-6 z-50 w-80 rounded-lg bg-white p-5 shadow-lg ring-1 ring-black/5"
      data-testid="export-preview-loading-overlay"
    >
      <div className="mb-3 flex items-center gap-3">
        <LoadingOutlined style={{ fontSize: 20, color: 'var(--color-brand)' }} spin />
        <span className="text-sm font-medium">正在生成预览</span>
      </div>
      <Progress
        percent={Math.round(progress)}
        status="active"
        size="small"
        data-testid="loading-progress"
      />
      {progressMessage && (
        <p className="mt-2 text-xs text-gray-500" data-testid="progress-message">
          {progressMessage}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-gray-400">您可以继续编辑</span>
        <button
          className="text-sm text-gray-400 underline hover:text-gray-600"
          onClick={onCancel}
          data-testid="cancel-preview-btn"
        >
          取消
        </button>
      </div>
    </div>
  )
}
