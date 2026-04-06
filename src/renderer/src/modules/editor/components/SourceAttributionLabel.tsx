import { Tag, Popover } from 'antd'
import { SourceAssetIcon } from '@renderer/shared/components/icons/SourceAssetIcon'
import { SourceKnowledgeIcon } from '@renderer/shared/components/icons/SourceKnowledgeIcon'
import { SourceAiIcon } from '@renderer/shared/components/icons/SourceAiIcon'
import { SourceDetailPopover } from './SourceDetailPopover'
import type { SourceAttribution } from '@shared/source-attribution-types'

const SOURCE_CONFIG = {
  'asset-library': {
    color: '#1677FF',
    bg: '#E6F4FF',
    label: '\u8d44\u4ea7\u5e93',
    Icon: SourceAssetIcon,
  },
  'knowledge-base': {
    color: '#52C41A',
    bg: '#F6FFED',
    label: '\u77e5\u8bc6\u5e93',
    Icon: SourceKnowledgeIcon,
  },
  'ai-inference': {
    color: '#FAAD14',
    bg: '#FFFBE6',
    label: 'AI \u63a8\u7406',
    Icon: SourceAiIcon,
  },
  'no-source': {
    color: '#D48806',
    bg: '#FFFBE6',
    label: '\u65e0\u6765\u6e90',
    Icon: SourceAiIcon,
  },
  'user-edited': {
    color: '#8C8C8C',
    bg: '#F5F5F5',
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
  const { Icon, label, color, bg } = config

  const isNoSource = effectiveType === 'no-source'
  const isUserEdited = effectiveType === 'user-edited'

  const tagContent = (
    <Tag
      style={{
        fontSize: 12,
        lineHeight: '16px',
        padding: '0 4px',
        margin: 0,
        color,
        backgroundColor: bg,
        border: 'none',
        cursor: isUserEdited ? 'default' : 'pointer',
      }}
      data-testid="source-attribution-label"
      data-source-type={effectiveType}
    >
      <Icon size="1rem" color={color} />
      <span style={{ marginLeft: 2 }}>{label}</span>
    </Tag>
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
