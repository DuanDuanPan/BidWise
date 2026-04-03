import { Badge } from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import type { FogMapSummary } from '@shared/analysis-types'

interface FogMapBadgeProps {
  summary: FogMapSummary | null
}

export function FogMapBadge({ summary }: FogMapBadgeProps): React.JSX.Element {
  if (!summary || summary.total === 0) {
    return <span data-testid="fog-map-badge">迷雾地图</span>
  }

  const pendingCount = summary.ambiguous + summary.risky - summary.confirmed
  if (pendingCount <= 0) {
    return (
      <span className="inline-flex items-center gap-1" data-testid="fog-map-badge">
        迷雾地图 <CheckCircleFilled className="text-green-500" />
      </span>
    )
  }

  return (
    <span data-testid="fog-map-badge">
      迷雾地图{' '}
      <Badge count={pendingCount} size="small" offset={[4, -2]} />
    </span>
  )
}
