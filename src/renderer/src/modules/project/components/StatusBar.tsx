import { DashboardOutlined, FileTextOutlined, LoadingOutlined } from '@ant-design/icons'

const zhNumberFormat = new Intl.NumberFormat('zh-CN')

function getComplianceColor(rate: number): string {
  if (rate >= 80) return 'var(--color-success, #52c41a)'
  if (rate >= 60) return 'var(--color-warning, #faad14)'
  return 'var(--color-error, #ff4d4f)'
}

interface StatusBarProps {
  currentStageName?: string
  leftExtra?: React.ReactNode
  wordCount?: number
  complianceRate?: number | null
  complianceLoading?: boolean
  complianceReady?: boolean
}

export function StatusBar({
  currentStageName,
  leftExtra,
  wordCount,
  complianceRate,
  complianceLoading,
  complianceReady,
}: StatusBarProps): React.JSX.Element {
  const renderComplianceIndicator = (): React.JSX.Element => {
    if (complianceLoading) {
      return (
        <span
          className="text-caption flex items-center gap-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="status-compliance"
        >
          <LoadingOutlined style={{ fontSize: 12 }} />
          合规分 --
        </span>
      )
    }

    if (!complianceReady || complianceRate == null) {
      return (
        <span
          className="text-caption flex items-center gap-1"
          style={{ color: 'var(--color-text-tertiary)' }}
          data-testid="status-compliance"
        >
          <span
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--color-text-quaternary, #d9d9d9)',
            }}
          />
          合规分 --
        </span>
      )
    }

    const color = getComplianceColor(complianceRate)
    return (
      <span
        className="text-caption flex items-center gap-1"
        style={{ color }}
        data-testid="status-compliance"
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
          }}
        />
        合规分 {complianceRate}
      </span>
    )
  }

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
        {renderComplianceIndicator()}
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
