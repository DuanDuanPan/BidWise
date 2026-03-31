import { Badge } from 'antd'
import { CheckCircleFilled } from '@ant-design/icons'
import type { MandatoryItemSummary } from '@shared/analysis-types'

export interface MandatoryItemsBadgeProps {
  summary: MandatoryItemSummary | null
}

export function MandatoryItemsBadge({ summary }: MandatoryItemsBadgeProps): React.JSX.Element {
  if (!summary || summary.total === 0) {
    return <span>*项检测</span>
  }

  // All items reviewed (confirmed or dismissed)
  if (summary.pending === 0) {
    return (
      <span className="inline-flex items-center gap-1">
        *项检测
        <CheckCircleFilled style={{ color: '#52C41A', fontSize: 14 }} />
      </span>
    )
  }

  // Has pending items
  return (
    <span className="inline-flex items-center gap-1">
      *项检测
      <Badge count={summary.pending} size="small" style={{ backgroundColor: '#FF4D4F' }} />
    </span>
  )
}
