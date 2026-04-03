import { useState, useCallback, useEffect } from 'react'
import { Button, Progress, Alert, Collapse, Popover, Popconfirm } from 'antd'
import {
  LoadingOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { FogMapCard } from './FogMapCard'
import type { FogMapItem, FogMapSummary, RequirementItem } from '@shared/analysis-types'

interface FogMapViewProps {
  fogMap: FogMapItem[] | null
  fogMapSummary: FogMapSummary | null
  requirements: RequirementItem[] | null
  generating: boolean
  progress: number
  progressMessage: string
  error: string | null
  onGenerate: () => void
  onConfirm: (id: string) => void
  onBatchConfirm: () => void
  onNavigateToRequirements: () => void
}

function getProgressColor(pct: number): string {
  if (pct < 50) return '#FF4D4F'
  if (pct < 80) return '#FAAD14'
  return '#52C41A'
}

export function FogMapView({
  fogMap,
  fogMapSummary,
  requirements,
  generating,
  progress,
  progressMessage,
  error,
  onGenerate,
  onConfirm,
  onBatchConfirm,
  onNavigateToRequirements,
}: FogMapViewProps): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showTour, setShowTour] = useState(false)

  // Show tour when fogMap data becomes available for the first time
  useEffect(() => {
    if (fogMap !== null && fogMap.length > 0 && !localStorage.getItem('fogMapTourShown')) {
      setShowTour(true)
    }
  }, [fogMap])

  const dismissTour = useCallback(() => {
    setShowTour(false)
    localStorage.setItem('fogMapTourShown', 'true')
  }, [])

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  // Error state
  if (error && !fogMap) {
    return (
      <div data-testid="fog-map-view">
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={`迷雾地图生成失败：${error}`}
          action={
            <Button size="small" onClick={onGenerate}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  // Generating state
  if (generating) {
    return (
      <div data-testid="fog-map-view">
        <div
          className="rounded-lg border border-blue-200 bg-blue-50 p-4"
          data-testid="fog-map-progress"
        >
          <div className="mb-2 flex items-center gap-2 text-blue-600">
            <LoadingOutlined />
            <span className="font-medium">正在生成迷雾地图</span>
          </div>
          <Progress percent={Math.round(progress)} size="small" status="active" />
          <div className="text-text-secondary mt-1 text-xs">{progressMessage || '正在分析...'}</div>
        </div>
      </div>
    )
  }

  // Empty state A: requirements not generated
  if (requirements === null) {
    return (
      <div data-testid="fog-map-view">
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 p-12"
          data-testid="fog-map-empty-no-requirements"
        >
          <ExclamationCircleOutlined style={{ fontSize: 32 }} className="text-gray-400" />
          <div className="text-center">
            <div className="mb-1 text-base font-medium text-gray-600">请先完成需求结构化抽取</div>
            <div className="text-sm text-gray-400">迷雾地图需要基于需求清单进行确定性分级</div>
          </div>
          <Button type="primary" onClick={onNavigateToRequirements}>
            前往需求清单
          </Button>
        </div>
      </div>
    )
  }

  // Empty state B: requirements exist but fog map not generated
  if (fogMap === null) {
    return (
      <div data-testid="fog-map-view">
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 p-12"
          data-testid="fog-map-empty-not-generated"
        >
          <ThunderboltOutlined style={{ fontSize: 32 }} className="text-amber-500" />
          <div className="text-center">
            <div className="mb-1 text-base font-medium text-gray-600">生成迷雾地图</div>
            <div className="text-sm text-gray-400">
              AI 将对 {requirements.length} 条需求进行确定性分级，帮助你识别模糊和风险区域
            </div>
          </div>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={onGenerate}
            data-testid="fog-map-generate"
          >
            生成迷雾地图
          </Button>
        </div>
      </div>
    )
  }

  // Has data — group items by certainty level
  const riskyItems = fogMap.filter((item) => item.certaintyLevel === 'risky')
  const ambiguousItems = fogMap.filter((item) => item.certaintyLevel === 'ambiguous')
  const clearItems = fogMap.filter((item) => item.certaintyLevel === 'clear')

  const pendingCount = fogMap.filter(
    (item) => !item.confirmed && item.certaintyLevel !== 'clear'
  ).length
  const pct = fogMapSummary?.fogClearingPercentage ?? 0

  const riskyConfirmed = riskyItems.filter((i) => i.confirmed).length
  const ambiguousConfirmed = ambiguousItems.filter((i) => i.confirmed).length

  return (
    <div data-testid="fog-map-view">
      {/* Tour popover */}
      {showTour && (
        <Alert
          type="info"
          showIcon
          icon={<QuestionCircleOutlined />}
          message="迷雾地图指南"
          description="绿色=明确需求，黄色=模糊需求（建议确认），红色=风险区域。点击卡片查看详情，点击确认按钮消散迷雾。"
          closable
          onClose={dismissTour}
          className="mb-4"
        />
      )}

      {/* Error banner (has data but error from e.g. regeneration) */}
      {error && <Alert type="error" showIcon message={error} closable className="mb-4" />}

      {/* Fog clearing progress bar */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-base font-medium">雾散进度</span>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: getProgressColor(pct) }}>
              {pct}%
            </span>
            <Popover
              content={
                <div className="text-sm">
                  <p>雾散进度 = (明确 + 已确认) / 总数 × 100%</p>
                  <p className="mt-1 text-gray-400">确认模糊/风险需求可以提高进度</p>
                </div>
              }
              title="计算方式"
            >
              <QuestionCircleOutlined className="cursor-pointer text-gray-400" />
            </Popover>
          </div>
        </div>
        <Progress
          percent={pct}
          showInfo={false}
          strokeColor={getProgressColor(pct)}
          data-testid="fog-map-progress"
        />
        <div className="mt-2 flex gap-4 text-sm text-gray-500">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#52C41A]" />
            明确 {fogMapSummary?.clear ?? 0}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#FAAD14]" />
            模糊 {fogMapSummary?.ambiguous ?? 0}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#FF4D4F]" />
            风险 {fogMapSummary?.risky ?? 0}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#52C41A]" />
            已确认 {fogMapSummary?.confirmed ?? 0}
          </span>
        </div>
      </div>

      {/* Regenerate button */}
      <div className="mb-4 flex justify-end">
        <Popconfirm
          title="重新生成迷雾地图"
          description="将清除现有分级和已确认状态，确定重新生成？"
          onConfirm={onGenerate}
          okText="确定"
          cancelText="取消"
        >
          <Button icon={<ReloadOutlined />} data-testid="fog-map-regenerate">
            重新生成
          </Button>
        </Popconfirm>
      </div>

      {/* Grouped list */}
      <Collapse
        defaultActiveKey={['risky', 'ambiguous']}
        items={[
          {
            key: 'risky',
            label: (
              <span className="font-medium" style={{ color: '#FF4D4F' }}>
                风险需求 ({riskyItems.length} | 已确认 {riskyConfirmed})
              </span>
            ),
            children:
              riskyItems.length > 0 ? (
                riskyItems.map((item) => (
                  <FogMapCard
                    key={item.id}
                    item={item}
                    onConfirm={onConfirm}
                    expanded={expandedId === item.id}
                    onToggle={handleToggle}
                  />
                ))
              ) : (
                <div className="py-4 text-center text-sm text-gray-400">无风险需求</div>
              ),
          },
          {
            key: 'ambiguous',
            label: (
              <span className="font-medium" style={{ color: '#FAAD14' }}>
                模糊需求 ({ambiguousItems.length} | 已确认 {ambiguousConfirmed})
              </span>
            ),
            children:
              ambiguousItems.length > 0 ? (
                ambiguousItems.map((item) => (
                  <FogMapCard
                    key={item.id}
                    item={item}
                    onConfirm={onConfirm}
                    expanded={expandedId === item.id}
                    onToggle={handleToggle}
                  />
                ))
              ) : (
                <div className="py-4 text-center text-sm text-gray-400">无模糊需求</div>
              ),
          },
          {
            key: 'clear',
            label: (
              <span className="font-medium" style={{ color: '#52C41A' }}>
                明确需求 ({clearItems.length})
              </span>
            ),
            children:
              clearItems.length > 0 ? (
                clearItems.map((item) => (
                  <FogMapCard
                    key={item.id}
                    item={item}
                    onConfirm={onConfirm}
                    expanded={expandedId === item.id}
                    onToggle={handleToggle}
                  />
                ))
              ) : (
                <div className="py-4 text-center text-sm text-gray-400">无明确需求</div>
              ),
          },
        ]}
      />

      {/* Batch confirm bar */}
      {pendingCount > 0 && (
        <div className="mt-4 flex justify-center">
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={onBatchConfirm}
            data-testid="fog-map-confirm-all"
          >
            全部确认（{pendingCount} 项待确认）
          </Button>
        </div>
      )}
    </div>
  )
}
