import { Typography } from 'antd'
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

const SOURCE_TYPE_COLORS: Record<string, string> = {
  'asset-library': '#1677FF',
  'knowledge-base': '#389E0D',
  'ai-inference': '#D48806',
  'no-source': '#D48806',
}

export function SourceDetailPopover({
  attribution,
  isNoSource,
}: SourceDetailPopoverProps): React.JSX.Element {
  if (isNoSource) {
    return (
      <div style={{ maxWidth: 280, padding: '4px 0' }} data-testid="source-detail-popover">
        <Text type="warning" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {
            '\u6b64\u6bb5\u843d\u65e0\u660e\u786e\u6765\u6e90\uff0c\u8bf7\u4eba\u5de5\u786e\u8ba4\u5185\u5bb9\u7684\u51c6\u786e\u6027\u3002'
          }
        </Text>
      </div>
    )
  }

  const accentColor = SOURCE_TYPE_COLORS[attribution.sourceType] ?? '#8C8C8C'
  const confidence = Math.round(attribution.confidence * 100)

  return (
    <div style={{ maxWidth: 340, padding: '4px 0' }} data-testid="source-detail-popover">
      {/* Type badge */}
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: accentColor,
            flexShrink: 0,
          }}
        />
        <Text strong style={{ fontSize: 13 }}>
          {SOURCE_TYPE_LABELS[attribution.sourceType] ?? attribution.sourceType}
        </Text>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#8C8C8C',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {`${confidence}% \u5339\u914d`}
        </span>
      </div>

      {/* Source ref */}
      {attribution.sourceRef && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: '#8C8C8C', marginBottom: 2 }}>
            {'\u539f\u59cb\u51fa\u5904'}
          </div>
          <Text copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {attribution.sourceRef}
          </Text>
        </div>
      )}

      {/* Snippet */}
      {attribution.snippet && (
        <div
          style={{
            fontSize: 12,
            color: '#595959',
            fontStyle: 'italic',
            borderLeft: `2px solid ${accentColor}`,
            paddingLeft: 8,
            lineHeight: 1.6,
          }}
        >
          {attribution.snippet}
        </div>
      )}
    </div>
  )
}
