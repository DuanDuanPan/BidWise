import {
  CheckCircleOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { Button } from 'antd'
import type { AutoSaveIndicatorProps, AutoSaveIndicatorStatus } from '@modules/editor/types'
import { getAutoSaveIndicatorStatus } from '@modules/editor/lib/autoSaveIndicator'

const STATUS_CONFIG: Record<
  AutoSaveIndicatorStatus,
  {
    icon: React.ReactNode
    label: string
    color: string
  }
> = {
  saved: {
    icon: <CheckCircleOutlined />,
    label: '已保存',
    color: 'var(--color-success)',
  },
  saving: {
    icon: <LoadingOutlined spin />,
    label: '保存中...',
    color: 'var(--color-brand)',
  },
  unsaved: {
    icon: <EditOutlined />,
    label: '未保存更改',
    color: 'var(--color-warning)',
  },
  error: {
    icon: <ExclamationCircleOutlined />,
    label: '保存失败',
    color: 'var(--color-danger)',
  },
}

export function AutoSaveIndicator({
  autoSave,
  onRetry,
}: AutoSaveIndicatorProps): React.JSX.Element {
  const status = getAutoSaveIndicatorStatus(autoSave)
  const statusConfig = STATUS_CONFIG[status]

  return (
    <div className="flex items-center gap-2" data-testid="auto-save-indicator">
      <span
        className="text-caption flex items-center gap-1"
        style={{ color: statusConfig.color }}
        data-testid="auto-save-status"
      >
        {statusConfig.icon}
        {statusConfig.label}
      </span>
      {status === 'error' && onRetry ? (
        <Button
          type="link"
          size="small"
          icon={<RedoOutlined />}
          className="px-0"
          onClick={onRetry}
          data-testid="auto-save-retry"
        >
          重试保存
        </Button>
      ) : null}
    </div>
  )
}
