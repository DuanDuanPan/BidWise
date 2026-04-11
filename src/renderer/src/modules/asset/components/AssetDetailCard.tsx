import { Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { ASSET_TYPE_LABELS } from '@shared/asset-types'
import type { AssetDetail, UpdateAssetTagsInput } from '@shared/asset-types'
import { TagEditor } from './TagEditor'

interface AssetDetailCardProps {
  asset: AssetDetail
  matchScore: number | null
  onBack: () => void
  onUpdateTags: (input: UpdateAssetTagsInput) => Promise<void>
}

export function AssetDetailCard({
  asset,
  matchScore,
  onBack,
  onUpdateTags,
}: AssetDetailCardProps): React.JSX.Element {
  const handleAddTag = (tagName: string): void => {
    const existing = asset.tags.map((t) => t.name)
    if (!existing.some((n) => n.toLowerCase() === tagName.toLowerCase())) {
      onUpdateTags({ assetId: asset.id, tagNames: [...existing, tagName] })
    }
  }

  const handleRemoveTag = (tagName: string): void => {
    const remaining = asset.tags.filter((t) => t.name !== tagName).map((t) => t.name)
    onUpdateTags({ assetId: asset.id, tagNames: remaining })
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #1677FF',
        borderRadius: 8,
        padding: 24,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <a onClick={onBack} style={{ fontSize: 13, color: '#1677FF', cursor: 'pointer' }}>
          <ArrowLeftOutlined style={{ marginRight: 4 }} />
          返回搜索结果
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: '#1F1F1F', margin: 0 }}>
          {asset.title}
        </h2>
        <Tag color="processing">{ASSET_TYPE_LABELS[asset.assetType]}</Tag>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 12 }}>
        {matchScore !== null && (
          <span style={{ fontWeight: 600, color: '#52C41A' }}>匹配度 {matchScore}%</span>
        )}
        {asset.sourceProject && (
          <span style={{ color: '#8C8C8C' }}>来源：{asset.sourceProject}</span>
        )}
      </div>

      <div
        style={{
          fontSize: 14,
          color: '#595959',
          lineHeight: 1.8,
          marginBottom: 24,
          whiteSpace: 'pre-wrap',
        }}
      >
        {asset.content}
      </div>

      <div style={{ borderTop: '1px solid #F0F0F0', paddingTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1F1F1F', marginBottom: 12 }}>
          标签管理
        </div>
        <TagEditor tags={asset.tags} onAdd={handleAddTag} onRemove={handleRemoveTag} />
      </div>
    </div>
  )
}
