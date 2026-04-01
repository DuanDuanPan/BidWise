import { Alert, Button, Space } from 'antd'

interface InlineErrorBarProps {
  error: string
  onRetry: () => void
  onManualEdit: () => void
  onSkip: () => void
}

export function InlineErrorBar({
  error,
  onRetry,
  onManualEdit,
  onSkip,
}: InlineErrorBarProps): React.JSX.Element {
  return (
    <Alert
      type="error"
      message="章节生成失败"
      description={error}
      data-testid="chapter-error-bar"
      action={
        <Space direction="vertical" size="small">
          <Button
            size="small"
            type="primary"
            danger
            onClick={onRetry}
            data-testid="chapter-retry-btn"
          >
            重试
          </Button>
          <Button size="small" onClick={onManualEdit} data-testid="chapter-manual-edit-btn">
            手动编辑
          </Button>
          <Button size="small" type="text" onClick={onSkip} data-testid="chapter-skip-btn">
            跳过
          </Button>
        </Space>
      }
    />
  )
}
