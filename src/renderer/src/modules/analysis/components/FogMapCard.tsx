import { Button, Tag, Alert } from 'antd'
import { CheckOutlined, DownOutlined, RightOutlined } from '@ant-design/icons'
import type { FogMapItem, CertaintyLevel } from '@shared/analysis-types'

const CERTAINTY_COLORS: Record<CertaintyLevel, string> = {
  clear: '#52C41A',
  ambiguous: '#FAAD14',
  risky: '#FF4D4F',
}

const CERTAINTY_LABELS: Record<CertaintyLevel, string> = {
  clear: '明确',
  ambiguous: '模糊',
  risky: '风险',
}

const ALERT_TYPE_MAP: Record<CertaintyLevel, 'success' | 'warning' | 'error'> = {
  clear: 'success',
  ambiguous: 'warning',
  risky: 'error',
}

interface FogMapCardProps {
  item: FogMapItem
  onConfirm: (id: string) => void
  expanded: boolean
  onToggle: (id: string) => void
}

export function FogMapCard({
  item,
  onConfirm,
  expanded,
  onToggle,
}: FogMapCardProps): React.JSX.Element {
  const borderColor = item.confirmed ? '#52C41A' : CERTAINTY_COLORS[item.certaintyLevel]
  const description = item.requirement.description
  const truncated = description.length > 80 ? `${description.slice(0, 80)}...` : description

  return (
    <div
      className="mb-2 rounded-md bg-white shadow-sm"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        transition: 'border-color 300ms ease, background-color 300ms ease',
      }}
      data-testid="fog-map-card"
    >
      {/* Collapsed header */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => onToggle(item.id)}
      >
        <span className="text-gray-400">
          {expanded ? <DownOutlined /> : <RightOutlined />}
        </span>
        <span className="min-w-[40px] text-sm font-medium text-gray-500">
          #{item.requirement.sequenceNumber}
        </span>
        <span className="flex-1 truncate text-sm">{truncated}</span>
        {item.confirmed ? (
          <Tag color="green">已确认</Tag>
        ) : (
          <Tag color={CERTAINTY_COLORS[item.certaintyLevel]}>
            {CERTAINTY_LABELS[item.certaintyLevel]}
          </Tag>
        )}
        {!item.confirmed && item.certaintyLevel !== 'clear' && (
          <Button
            size="small"
            type="link"
            icon={<CheckOutlined />}
            onClick={(e) => {
              e.stopPropagation()
              onConfirm(item.id)
            }}
            data-testid="fog-map-card-confirm"
          >
            确认
          </Button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3" data-testid="fog-map-card-detail">
          <div className="mb-3 text-sm text-gray-700">{description}</div>

          <Alert
            type={ALERT_TYPE_MAP[item.certaintyLevel]}
            message="分级原因"
            description={item.reason}
            showIcon
            className="mb-3"
          />

          {item.suggestion && item.suggestion !== '无需补充确认' && (
            <blockquote className="mb-3 border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-sm italic text-gray-600">
              {item.suggestion}
            </blockquote>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            {item.requirement.sourcePages.length > 0 && (
              <span>来源页: {item.requirement.sourcePages.join(', ')}</span>
            )}
            <span>分类: {item.requirement.category}</span>
            <span>优先级: {item.requirement.priority}</span>
          </div>
        </div>
      )}
    </div>
  )
}
