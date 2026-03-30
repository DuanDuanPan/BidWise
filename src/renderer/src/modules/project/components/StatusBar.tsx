import { CheckCircleOutlined, DashboardOutlined, FileTextOutlined } from '@ant-design/icons'

const zhNumberFormat = new Intl.NumberFormat('zh-CN')

interface StatusBarProps {
  currentStageName?: string
  leftExtra?: React.ReactNode
  wordCount?: number
}

export function StatusBar({
  currentStageName,
  leftExtra,
  wordCount,
}: StatusBarProps): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="项目状态栏"
      className="flex shrink-0 items-center justify-between px-4"
      style={{
        height: 32,
        borderTop: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-content)',
      }}
      data-testid="status-bar"
    >
      {/* Left: current SOP stage + extra content */}
      <div className="flex items-center gap-4">
        {currentStageName && (
          <span
            className="text-caption"
            style={{ color: 'var(--color-text-tertiary)' }}
            data-testid="status-sop-stage"
          >
            {currentStageName}
          </span>
        )}
        {leftExtra}
      </div>

      {/* Right: metrics */}
      <div className="flex items-center gap-4">
        <span
          className="text-caption flex items-center gap-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="status-wordcount"
        >
          <FileTextOutlined style={{ fontSize: 12 }} />
          字数 {wordCount != null ? zhNumberFormat.format(wordCount) : '--'}
        </span>
        <span
          className="text-caption flex items-center gap-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="status-compliance"
        >
          <CheckCircleOutlined style={{ fontSize: 12 }} />
          合规分 --
        </span>
        <span
          className="text-caption flex items-center gap-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="status-quality"
        >
          <DashboardOutlined style={{ fontSize: 12 }} />
          质量分 --
        </span>
      </div>
    </div>
  )
}
