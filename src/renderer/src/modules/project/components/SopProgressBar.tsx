import { useCallback } from 'react'
import { CheckOutlined, ExclamationOutlined } from '@ant-design/icons'
import { SOP_STAGES } from '../types'
import type { SopStageKey, SopStageStatus, SopStageDefinition } from '../types'

type ActiveStageKey = Exclude<SopStageKey, 'not-started'>

interface SopProgressBarProps {
  currentStageKey: ActiveStageKey
  stageStatuses: Record<ActiveStageKey, SopStageStatus>
  onStageClick: (key: ActiveStageKey) => void
}

const statusStyles: Record<
  SopStageStatus,
  { bg: string; border: string; labelColor: string; iconColor: string }
> = {
  'not-started': {
    bg: 'transparent',
    border: '2px solid var(--color-sop-idle)',
    labelColor: 'var(--color-sop-idle)',
    iconColor: 'var(--color-sop-idle)',
  },
  'in-progress': {
    bg: 'var(--color-sop-active)',
    border: 'none',
    labelColor: 'var(--color-sop-active)',
    iconColor: 'var(--color-bg-content)',
  },
  completed: {
    bg: 'var(--color-sop-done)',
    border: 'none',
    labelColor: 'var(--color-sop-done)',
    iconColor: 'var(--color-bg-content)',
  },
  warning: {
    bg: 'var(--color-sop-warning)',
    border: 'none',
    labelColor: 'var(--color-sop-warning)',
    iconColor: 'var(--color-bg-content)',
  },
}

function lineColor(status: SopStageStatus): string {
  switch (status) {
    case 'completed':
      return 'var(--color-sop-done)'
    case 'in-progress':
      return 'var(--color-sop-active)'
    case 'warning':
      return 'var(--color-sop-warning)'
    default:
      return 'var(--color-sop-idle)'
  }
}

function StageNode({
  stage,
  status,
  isCurrent,
  onClick,
}: {
  stage: SopStageDefinition
  status: SopStageStatus
  isCurrent: boolean
  onClick: () => void
}): React.JSX.Element {
  const styles = statusStyles[status]
  const Icon = stage.icon

  return (
    <button
      type="button"
      className="sop-stage-node flex cursor-pointer flex-col items-center gap-1 rounded border-none bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
      onClick={onClick}
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={`${stage.label}${isCurrent ? '（当前阶段）' : ''}`}
      data-testid={`sop-stage-${stage.key}`}
    >
      <div
        className={[
          'sop-stage-circle flex items-center justify-center rounded-full',
          status === 'in-progress' && 'sop-pulse',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: 28,
          height: 28,
          background: styles.bg,
          border: styles.border,
        }}
      >
        {status === 'completed' ? (
          <CheckOutlined style={{ fontSize: 14, color: styles.iconColor }} />
        ) : status === 'warning' ? (
          <ExclamationOutlined style={{ fontSize: 14, color: styles.iconColor }} />
        ) : (
          <Icon size="1rem" color={styles.iconColor} />
        )}
      </div>
      <span
        className="text-caption font-medium whitespace-nowrap"
        style={{ color: styles.labelColor }}
      >
        {stage.label}
      </span>
    </button>
  )
}

export function SopProgressBar({
  currentStageKey,
  stageStatuses,
  onStageClick,
}: SopProgressBarProps): React.JSX.Element {
  const handleClick = useCallback((key: ActiveStageKey) => () => onStageClick(key), [onStageClick])

  return (
    <nav
      role="navigation"
      aria-label="SOP 进度条"
      className="sop-progress-bar flex shrink-0 items-center bg-[var(--color-bg-content)] px-8"
      style={{
        height: 48,
        borderBottom: '1px solid var(--color-border)',
      }}
      data-testid="sop-progress-bar"
    >
      <div className="flex flex-1 items-center justify-between">
        {SOP_STAGES.map((stage, idx) => (
          <div
            key={stage.key}
            className="flex items-center"
            style={{ flex: idx < SOP_STAGES.length - 1 ? 1 : undefined }}
          >
            <StageNode
              stage={stage}
              status={stageStatuses[stage.key]}
              isCurrent={stage.key === currentStageKey}
              onClick={handleClick(stage.key)}
            />
            {idx < SOP_STAGES.length - 1 && (
              <div
                className="sop-connector mx-2 flex-1"
                style={{
                  height: 2,
                  minWidth: 40,
                  backgroundColor: lineColor(stageStatuses[stage.key]),
                }}
                data-testid={`sop-connector-${idx}`}
              />
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}
