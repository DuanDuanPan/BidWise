import { Typography, Descriptions } from 'antd'
import type { SourceAttribution } from '@shared/source-attribution-types'

const { Text } = Typography

interface SourceDetailPopoverProps {
  attribution: SourceAttribution
  isNoSource: boolean
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  'asset-library': '\u8d44\u4ea7\u5e93\u7d20\u6750',
  'knowledge-base': '\u77e5\u8bc6\u5e93\u6587\u6863',
  'ai-inference': 'AI \u63a8\u7406\u751f\u6210',
  'no-source': '\u65e0\u660e\u786e\u6765\u6e90',
}

export function SourceDetailPopover({
  attribution,
  isNoSource,
}: SourceDetailPopoverProps): React.JSX.Element {
  if (isNoSource) {
    return (
      <div style={{ maxWidth: 280 }} data-testid="source-detail-popover">
        <Text type="warning">
          {
            '\u6b64\u6bb5\u843d\u65e0\u660e\u786e\u6765\u6e90\uff0c\u8bf7\u4eba\u5de5\u786e\u8ba4\u5185\u5bb9\u7684\u51c6\u786e\u6027\u3002'
          }
        </Text>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 360 }} data-testid="source-detail-popover">
      <Descriptions column={1} size="small">
        <Descriptions.Item label={'\u6765\u6e90\u7c7b\u578b'}>
          {SOURCE_TYPE_LABELS[attribution.sourceType] ?? attribution.sourceType}
        </Descriptions.Item>
        {attribution.sourceRef && (
          <Descriptions.Item label={'\u539f\u59cb\u51fa\u5904'}>
            <Text copyable style={{ fontSize: 12 }}>
              {attribution.sourceRef}
            </Text>
          </Descriptions.Item>
        )}
        {attribution.snippet && (
          <Descriptions.Item label={'\u5339\u914d\u7247\u6bb5'}>
            <Text
              style={{ fontSize: 12, fontStyle: 'italic', maxWidth: 280, display: 'block' }}
              ellipsis={{ tooltip: true }}
            >
              {attribution.snippet}
            </Text>
          </Descriptions.Item>
        )}
        <Descriptions.Item label={'\u5339\u914d\u5ea6'}>
          {`${Math.round(attribution.confidence * 100)}%`}
        </Descriptions.Item>
      </Descriptions>
    </div>
  )
}
