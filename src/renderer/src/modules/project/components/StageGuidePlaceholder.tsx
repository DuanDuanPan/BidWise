import { Button } from 'antd'
import { SOP_STAGES } from '../types'
import type { SopStageKey } from '../types'

type ActiveStageKey = Exclude<SopStageKey, 'not-started'>

interface StageGuidePlaceholderProps {
  stageKey: ActiveStageKey
  ctaLabel?: string
  onPrimaryAction?: () => void
  primaryActionLoading?: boolean
  primaryActionDisabled?: boolean
}

export function StageGuidePlaceholder({
  stageKey,
  ctaLabel,
  onPrimaryAction,
  primaryActionLoading,
  primaryActionDisabled,
}: StageGuidePlaceholderProps): React.JSX.Element {
  const stage = SOP_STAGES.find((s) => s.key === stageKey)!
  const Icon = stage.icon

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center"
      data-testid="stage-guide-placeholder"
      data-stage={stageKey}
    >
      <div className="flex flex-col items-center" style={{ width: 400, maxWidth: '100%' }}>
        {/* Icon container */}
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 64,
            height: 64,
            backgroundColor: 'var(--color-bg-global)',
          }}
        >
          <Icon size="1.25rem" color="var(--color-text-tertiary)" />
        </div>

        {/* Stage name */}
        <h2 className="text-h2 mt-6 mb-0">{stage.label}</h2>

        {/* Description */}
        <p
          className="text-body mt-3 mb-0 text-center"
          style={{
            color: 'var(--color-text-tertiary)',
            lineHeight: 1.8,
            maxWidth: 360,
          }}
        >
          {stage.description}
        </p>

        {/* CTA button */}
        <Button
          type="primary"
          size="large"
          className="mt-8"
          data-testid="stage-guide-cta"
          onClick={onPrimaryAction}
          loading={primaryActionLoading}
          disabled={primaryActionDisabled}
        >
          {ctaLabel ?? stage.ctaLabel}
        </Button>

        {/* Shortcut hint */}
        {stage.altKey && (
          <span className="text-caption mt-3" style={{ color: 'var(--color-sop-idle)' }}>
            Alt+{stage.altKey} 快捷键可直达此阶段
          </span>
        )}
      </div>
    </div>
  )
}
