import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Spin, Tag, Typography, message } from 'antd'
import { ASSET_TYPE_LABELS } from '@shared/asset-types'
import type { AssetDetail } from '@shared/asset-types'

const { Title, Text, Paragraph } = Typography

interface RecommendationDetailDrawerProps {
  assetId: string | null
  matchScore?: number
  accepted: boolean
  open: boolean
  onClose: () => void
  onInsert: (assetId: string, content: string) => void
}

export function RecommendationDetailDrawer({
  assetId,
  matchScore,
  accepted,
  open,
  onClose,
  onInsert,
}: RecommendationDetailDrawerProps): React.JSX.Element {
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !assetId) {
      // Reset detail when drawer closes — legitimate direct initialization
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetail(null)
      return
    }

    setLoading(true)
    window.api
      .assetGet({ id: assetId })
      .then((response) => {
        if (response.success) {
          setDetail(response.data)
        } else {
          void message.error(response.error.message)
        }
      })
      .catch((err: Error) => {
        void message.error(err.message)
      })
      .finally(() => setLoading(false))
  }, [open, assetId])

  const handleInsert = useCallback(() => {
    if (!detail) return
    onInsert(detail.id, detail.content)
  }, [detail, onInsert])

  return (
    <Drawer
      title="资产详情"
      width={480}
      open={open}
      onClose={onClose}
      data-testid="recommendation-detail-drawer"
      footer={
        <div className="flex justify-end gap-2">
          {!accepted && (
            <Button type="primary" onClick={handleInsert} disabled={!detail || loading}>
              插入到编辑器
            </Button>
          )}
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
    >
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <Spin />
        </div>
      )}

      {!loading && detail && (
        <div className="space-y-4">
          <div>
            <Title level={4}>{detail.title}</Title>
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="blue">{ASSET_TYPE_LABELS[detail.assetType]}</Tag>
              {matchScore !== undefined && <Text type="secondary">匹配度 {matchScore}%</Text>}
            </div>
          </div>

          {detail.sourceProject && (
            <div>
              <Text type="secondary" className="text-xs">
                来源项目
              </Text>
              <div>
                <Text>{detail.sourceProject}</Text>
              </div>
            </div>
          )}

          {detail.sourceSection && (
            <div>
              <Text type="secondary" className="text-xs">
                来源章节
              </Text>
              <div>
                <Text>{detail.sourceSection}</Text>
              </div>
            </div>
          )}

          {detail.tags.length > 0 && (
            <div>
              <Text type="secondary" className="text-xs">
                标签
              </Text>
              <div className="mt-1 flex flex-wrap gap-1">
                {detail.tags.map((tag) => (
                  <Tag key={tag.id}>{tag.name}</Tag>
                ))}
              </div>
            </div>
          )}

          <div>
            <Text type="secondary" className="text-xs">
              正文内容
            </Text>
            <div className="mt-1 max-h-96 overflow-y-auto rounded border bg-gray-50 p-3">
              <Paragraph className="whitespace-pre-wrap">{detail.content}</Paragraph>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
