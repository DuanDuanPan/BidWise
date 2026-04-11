import { Button, Tag, Typography } from 'antd'
import type { AssetRecommendation } from '@shared/recommendation-types'

const { Text, Paragraph } = Typography

const MAX_VISIBLE_TAGS = 3

interface RecommendationCardProps {
  recommendation: AssetRecommendation
  accepted: boolean
  onInsert: () => void
  onIgnore: () => void
  onViewDetail: () => void
}

export function RecommendationCard({
  recommendation,
  accepted,
  onInsert,
  onIgnore,
  onViewDetail,
}: RecommendationCardProps): React.JSX.Element {
  const { title, summary, matchScore, tags } = recommendation
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAGS)
  const overflowCount = tags.length - MAX_VISIBLE_TAGS

  return (
    <div
      data-testid="recommendation-card"
      className="relative rounded-md border p-3"
      style={{
        borderColor: accepted ? '#d9d9d9' : '#52C41A',
        backgroundColor: accepted ? '#fafafa' : '#f6ffed',
        opacity: accepted ? 0.7 : 1,
      }}
    >
      {accepted && (
        <div className="absolute top-1 right-1">
          <Tag color="default" className="text-xs">
            已插入
          </Tag>
        </div>
      )}

      <div className="mb-1 flex items-center gap-2">
        <Text strong className="flex-1 truncate text-sm" title={title}>
          {title}
        </Text>
        <Text type="secondary" className="shrink-0 text-xs">
          {matchScore}%
        </Text>
      </div>

      <Paragraph type="secondary" className="mb-2 !text-xs" ellipsis={{ rows: 2 }}>
        {summary}
      </Paragraph>

      {tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {visibleTags.map((tag) => (
            <Tag key={tag.id} className="text-xs">
              {tag.name}
            </Tag>
          ))}
          {overflowCount > 0 && <Tag className="text-xs">+{overflowCount}</Tag>}
        </div>
      )}

      {!accepted && (
        <div className="flex gap-1">
          <Button type="primary" size="small" onClick={onInsert}>
            插入
          </Button>
          <Button type="text" size="small" onClick={onIgnore}>
            忽略
          </Button>
          <Button type="text" size="small" onClick={onViewDetail}>
            查看详情
          </Button>
        </div>
      )}
    </div>
  )
}
