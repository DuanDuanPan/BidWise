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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="export-preview-loading-overlay"
    >
      <div className="w-80 rounded-lg bg-white p-6 shadow-lg" data-testid="loading-card">
        <div className="mb-4 flex items-center gap-3">
          <LoadingOutlined style={{ fontSize: 24, color: 'var(--color-brand)' }} spin />
          <span className="text-base font-medium">正在生成预览</span>
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
        <div className="mt-4 text-center">
          <button
            className="text-sm text-gray-400 underline hover:text-gray-600"
            onClick={onCancel}
            data-testid="cancel-preview-btn"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
