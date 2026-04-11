import { Tag } from 'antd'
import { ASSET_TYPE_LABELS } from '@shared/asset-types'
import type { AssetSearchResult } from '@shared/asset-types'

interface AssetResultCardProps {
  asset: AssetSearchResult
  selected: boolean
  onClick: () => void
}

export function AssetResultCard({
  asset,
  selected,
  onClick,
}: AssetResultCardProps): React.JSX.Element {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${selected ? '#1677FF' : '#F0F0F0'}`,
        borderRadius: 8,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#ADC6FF'
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#F0F0F0'
        }
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: '#1F1F1F',
          marginBottom: 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {asset.title}
      </div>

      <div
        style={{
          fontSize: 12,
          color: '#595959',
          marginBottom: 8,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {asset.summary}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {asset.tags.map((tag) => (
          <Tag key={tag.id} color="blue" style={{ fontSize: 12, margin: 0 }}>
            {tag.name}
          </Tag>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#52C41A' }}>
          匹配度 {asset.matchScore}%
        </span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          {asset.sourceProject ?? ASSET_TYPE_LABELS[asset.assetType]}
        </span>
      </div>
    </div>
  )
}
