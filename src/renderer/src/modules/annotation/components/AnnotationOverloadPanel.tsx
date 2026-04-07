import { useState } from 'react'
import { Card, message } from 'antd'
import {
  OrderedListOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import { OVERLOAD_THRESHOLD } from '../lib/annotationSectionScope'

export type OverloadMode = 'none' | 'step-through' | 'summary'

interface AnnotationOverloadPanelProps {
  pendingCount: number
  onSelectMode: (mode: OverloadMode) => void
}

export function AnnotationOverloadPanel({
  pendingCount,
  onSelectMode,
}: AnnotationOverloadPanelProps): React.JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || pendingCount <= OVERLOAD_THRESHOLD) return null

  const handleStepThrough = (): void => {
    setDismissed(true)
    onSelectMode('step-through')
  }

  const handleRegenerate = (): void => {
    void message.info('功能将在后续版本实现')
  }

  const handleSummary = (): void => {
    setDismissed(true)
    onSelectMode('summary')
  }

  return (
    <div
      className="flex shrink-0 flex-col gap-2 border-b p-3"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-global)',
      }}
      data-testid="annotation-overload-panel"
    >
      <div className="flex items-center justify-between">
        <span className="text-body font-medium" style={{ color: 'var(--color-text-primary)' }}>
          本章节有 {pendingCount} 条待处理批注
        </span>
        <button
          type="button"
          className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-0.5"
          onClick={() => setDismissed(true)}
          aria-label="关闭应急面板"
          data-testid="overload-close"
        >
          <CloseOutlined style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Card
          size="small"
          className="cursor-pointer transition-shadow hover:shadow-sm"
          onClick={handleStepThrough}
          data-testid="overload-step-through"
        >
          <div className="flex items-center gap-2">
            <OrderedListOutlined style={{ color: 'var(--color-brand)' }} />
            <span className="text-caption font-medium">逐条处理</span>
          </div>
        </Card>

        <Card
          size="small"
          className="cursor-pointer transition-shadow hover:shadow-sm"
          onClick={handleRegenerate}
          data-testid="overload-regenerate"
        >
          <div className="flex items-center gap-2">
            <ReloadOutlined style={{ color: 'var(--color-text-tertiary)' }} />
            <span
              className="text-caption font-medium"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              补充上下文后重新生成
            </span>
          </div>
        </Card>

        <Card
          size="small"
          className="cursor-pointer transition-shadow hover:shadow-sm"
          onClick={handleSummary}
          data-testid="overload-summary"
        >
          <div className="flex items-center gap-2">
            <ThunderboltOutlined style={{ color: '#FAAD14' }} />
            <span className="text-caption font-medium">仅查看高优先级摘要</span>
          </div>
        </Card>
      </div>
    </div>
  )
}
