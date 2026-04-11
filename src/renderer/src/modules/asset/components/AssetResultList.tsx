import { Empty } from 'antd'
import type { AssetSearchResult } from '@shared/asset-types'
import { AssetResultCard } from './AssetResultCard'

interface AssetResultListProps {
  results: AssetSearchResult[]
  total: number
  selectedAssetId: string | null
  onSelect: (id: string) => void
}

export function AssetResultList({
  results,
  total,
  selectedAssetId,
  onSelect,
}: AssetResultListProps): React.JSX.Element {
  if (results.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Empty
          description={
            <div>
              <div style={{ fontSize: 14, color: '#595959', marginBottom: 8 }}>未找到匹配资产</div>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                尝试：调整关键词 / 减少筛选条件 / 浏览全部资产
              </div>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 16 }}>找到 {total} 个资产</div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {results.map((asset) => (
          <AssetResultCard
            key={asset.id}
            asset={asset}
            selected={selectedAssetId === asset.id}
            onClick={() => onSelect(asset.id)}
          />
        ))}
      </div>
    </div>
  )
}
