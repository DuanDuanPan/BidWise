import { useState } from 'react'
import { Badge, Spin, Typography } from 'antd'
import { CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons'
import { RecommendationCard } from './RecommendationCard'
import type { AssetRecommendation } from '@shared/recommendation-types'

const { Text } = Typography

interface RecommendationPanelProps {
  recommendations: AssetRecommendation[]
  loading: boolean
  acceptedAssetIds: Set<string>
  onInsert: (assetId: string) => void
  onIgnore: (assetId: string) => void
  onViewDetail: (assetId: string) => void
}

export function RecommendationPanel({
  recommendations,
  loading,
  acceptedAssetIds,
  onInsert,
  onIgnore,
  onViewDetail,
}: RecommendationPanelProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div data-testid="recommendation-panel">
      <div
        className="flex cursor-pointer items-center gap-1 px-2 py-1.5"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <CaretRightOutlined className="text-text-tertiary text-xs" />
        ) : (
          <CaretDownOutlined className="text-text-tertiary text-xs" />
        )}
        <Text strong className="text-sm">
          资产推荐
        </Text>
        {recommendations.length > 0 && (
          <Badge
            count={recommendations.length}
            size="small"
            style={{ backgroundColor: '#52C41A' }}
          />
        )}
        {loading && <Spin size="small" className="ml-auto" />}
      </div>

      {!collapsed && (
        <div className="space-y-2 px-2 pb-2">
          {!loading && recommendations.length === 0 && (
            <div className="py-6 text-center">
              <Text type="secondary" className="text-sm">
                当前章节暂无推荐资产
              </Text>
            </div>
          )}

          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.assetId}
              recommendation={rec}
              accepted={acceptedAssetIds.has(rec.assetId)}
              onInsert={() => onInsert(rec.assetId)}
              onIgnore={() => onIgnore(rec.assetId)}
              onViewDetail={() => onViewDetail(rec.assetId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
