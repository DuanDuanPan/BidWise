import { Tooltip } from 'antd'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import type { BaselineValidation } from '@shared/source-attribution-types'

interface BaselineMismatchMarkerProps {
  validation: BaselineValidation
}

export function BaselineMismatchMarker({
  validation,
}: BaselineMismatchMarkerProps): React.JSX.Element | null {
  if (validation.matched) return null

  const tooltipContent = (
    <div style={{ maxWidth: 300 }} data-testid="baseline-mismatch-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{'\u57fa\u7ebf\u4e0d\u5339\u914d'}</div>
      <div style={{ marginBottom: 4 }}>
        <strong>{'\u58f0\u660e\uff1a'}</strong> {validation.claim}
      </div>
      {validation.baselineRef && (
        <div style={{ marginBottom: 4 }}>
          <strong>{'\u57fa\u7ebf\u53c2\u8003\uff1a'}</strong> {validation.baselineRef}
        </div>
      )}
      {validation.mismatchReason && (
        <div>
          <strong>{'\u4e0d\u5339\u914d\u539f\u56e0\uff1a'}</strong> {validation.mismatchReason}
        </div>
      )}
    </div>
  )

  return (
    <Tooltip title={tooltipContent} placement="topRight" color="#FFF2F0">
      <span
        data-testid="baseline-mismatch-marker"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          marginLeft: 4,
          color: '#FF4D4F',
          cursor: 'help',
          fontSize: 12,
        }}
      >
        <ExclamationCircleOutlined style={{ fontSize: 12 }} />
      </span>
    </Tooltip>
  )
}
