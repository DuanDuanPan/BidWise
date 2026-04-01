import { Badge } from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import type { StrategySeedSummary } from '@shared/analysis-types'

interface StrategySeedBadgeProps {
  summary: StrategySeedSummary | null
}

export function StrategySeedBadge({ summary }: StrategySeedBadgeProps): React.JSX.Element {
  if (!summary || summary.total === 0) {
    return <span>策略种子</span>
  }

  if (summary.pending === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        策略种子 <CheckCircleFilled className="text-green-500" />
      </span>
    )
  }

  return (
    <span>
      策略种子 <Badge count={summary.pending} size="small" offset={[4, -2]} />
    </span>
  )
}
