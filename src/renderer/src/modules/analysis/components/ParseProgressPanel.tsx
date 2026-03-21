import { useState, useEffect, useRef } from 'react'
import { Progress, Button } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import type { ParseProgressPanelProps } from '../types'

function formatRemainingTime(elapsedMs: number, progress: number): string {
  if (progress <= 0 || progress >= 100) return ''
  const remainingMs = (elapsedMs / progress) * (100 - progress)
  if (remainingMs < 60_000) return '< 1 分钟'
  const minutes = Math.ceil(remainingMs / 60_000)
  return `约 ${minutes} 分钟`
}

export function ParseProgressPanel({
  progress,
  message: parseMessage,
  onCancel,
  onViewResult,
  completed,
}: ParseProgressPanelProps): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (completed) return
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
    }, 1000)
    return () => clearInterval(interval)
  }, [completed])

  if (completed) {
    return (
      <div className="flex flex-col items-center gap-4 p-8" data-testid="parse-completed">
        <CheckCircleOutlined style={{ fontSize: 48 }} className="text-green-500" />
        <div className="text-body font-medium">解析完成</div>
        <Button type="primary" onClick={onViewResult} data-testid="view-result-btn">
          查看解析结果
        </Button>
      </div>
    )
  }

  const remaining = formatRemainingTime(elapsedMs, progress)

  return (
    <div className="flex flex-col items-center gap-4 p-8" data-testid="parse-progress">
      <div className="w-full max-w-md">
        <Progress percent={Math.round(progress)} status="active" />
      </div>
      <div className="text-text-secondary text-caption">{parseMessage || '正在解析...'}</div>
      {remaining && (
        <div className="text-text-tertiary text-caption">预计剩余时间：{remaining}</div>
      )}
      {onCancel && (
        <Button size="small" onClick={onCancel} data-testid="cancel-parse-btn">
          取消解析
        </Button>
      )}
    </div>
  )
}
