import { Popover } from 'antd'
import { SourceAssetIcon } from '@renderer/shared/components/icons/SourceAssetIcon'
import { SourceKnowledgeIcon } from '@renderer/shared/components/icons/SourceKnowledgeIcon'
import { SourceAiIcon } from '@renderer/shared/components/icons/SourceAiIcon'
import { SourceDetailPopover } from './SourceDetailPopover'
import type { SourceAttribution } from '@shared/source-attribution-types'

const SOURCE_CONFIG = {
  'asset-library': {
    color: '#1677FF',
    bg: 'rgba(22, 119, 255, 0.06)',
    border: 'rgba(22, 119, 255, 0.15)',
    label: '\u8d44\u4ea7\u5e93',
    Icon: SourceAssetIcon,
  },
  'knowledge-base': {
    color: '#389E0D',
    bg: 'rgba(82, 196, 26, 0.06)',
    border: 'rgba(82, 196, 26, 0.18)',
    label: '\u77e5\u8bc6\u5e93',
    Icon: SourceKnowledgeIcon,
  },
  'ai-inference': {
    color: '#D48806',
    bg: 'rgba(250, 173, 20, 0.06)',
    border: 'rgba(250, 173, 20, 0.18)',
    label: 'AI \u63a8\u7406',
    Icon: SourceAiIcon,
  },
  'no-source': {
    color: '#D48806',
    bg: 'rgba(250, 173, 20, 0.08)',
    border: 'rgba(250, 173, 20, 0.2)',
    label: '\u65e0\u6765\u6e90',
    Icon: SourceAiIcon,
  },
  'user-edited': {
    color: '#8C8C8C',
    bg: 'rgba(0, 0, 0, 0.02)',
    border: 'rgba(0, 0, 0, 0.06)',
    label: '\u5df2\u7f16\u8f91',
    Icon: SourceAiIcon,
  },
} as const

interface SourceAttributionLabelProps {
  attribution: SourceAttribution
  isEdited: boolean
}

export function SourceAttributionLabel({
  attribution,
  isEdited,
}: SourceAttributionLabelProps): React.JSX.Element {
  const effectiveType = isEdited ? 'user-edited' : attribution.sourceType
  const config = SOURCE_CONFIG[effectiveType]
  const { Icon, label, color, bg, border } = config

  const isNoSource = effectiveType === 'no-source'
  const isUserEdited = effectiveType === 'user-edited'

  const tagContent = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        lineHeight: '18px',
        padding: '0 6px',
        borderRadius: 9,
        color,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        cursor: isUserEdited ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        backdropFilter: 'blur(4px)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      data-testid="source-attribution-label"
      data-source-type={effectiveType}
    >
      <Icon size="12px" color={color} />
      {label}
    </span>
  )

  if (isUserEdited) {
    return tagContent
  }

  return (
    <Popover
      content={<SourceDetailPopover attribution={attribution} isNoSource={isNoSource} />}
      trigger="click"
      placement="bottomLeft"
    >
      {tagContent}
    </Popover>
  )
}
