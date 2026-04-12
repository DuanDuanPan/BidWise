import React, { useState, useEffect, useMemo } from 'react'
import { Alert, Badge, Button, Progress, Spin, Switch } from 'antd'
import { ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons'
import { useAttackChecklist } from '../hooks/useAttackChecklist'
import { AttackChecklistItemCard } from './AttackChecklistItemCard'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

interface AttackChecklistPanelProps {
  projectId?: string
  defaultCollapsed?: boolean
  onNavigateToChapter?: (locator: ChapterHeadingLocator) => void
}

function getProgressColor(percent: number): string {
  if (percent < 50) return '#FF4D4F'
  if (percent <= 80) return '#FA8C16'
  return '#52C41A'
}

export const AttackChecklistPanel: React.FC<AttackChecklistPanelProps> = ({
  projectId,
  defaultCollapsed = false,
  onNavigateToChapter,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setCollapsed(defaultCollapsed)
  }, [defaultCollapsed])

  const {
    checklist,
    loading,
    error,
    progress,
    message,
    generateChecklist,
    updateItemStatus,
    clearError,
    stats,
  } = useAttackChecklist(projectId)

  const isGenerating = (loading && !checklist) || checklist?.status === 'generating'
  const hasChecklist = !!checklist && checklist.status === 'generated'
  const isFallback = checklist?.generationSource === 'fallback'

  const displayItems = useMemo(() => {
    const items = checklist?.items ?? []
    if (items.length === 0) return []
    if (showAll) return items
    return items.filter((item) => item.status !== 'dismissed')
  }, [checklist?.items, showAll])

  if (!projectId) return null

  return (
    <div
      data-testid="attack-checklist-panel"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      {/* Section header */}
      <div
        className="flex cursor-pointer items-center justify-between px-4"
        style={{
          height: 40,
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
        }}
        onClick={() => setCollapsed((prev) => !prev)}
        data-testid="attack-checklist-header"
      >
        <div className="flex items-center gap-2">
          <ThunderboltOutlined style={{ fontSize: 14, color: '#FF4D4F' }} />
          <span className="text-h4" style={{ fontSize: 13 }}>
            攻击清单
          </span>
          {hasChecklist && (
            <Badge
              count={`${stats.addressed}/${stats.total}`}
              style={{
                backgroundColor: getProgressColor(stats.progressPercent),
                fontSize: 11,
              }}
              data-testid="checklist-badge"
            />
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {collapsed ? '▸' : '▾'}
        </span>
      </div>

      {/* Panel body */}
      {!collapsed && (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {/* Fallback warning */}
          {isFallback && checklist?.warningMessage && (
            <div style={{ padding: '8px 12px' }}>
              <Alert
                type="warning"
                showIcon
                message={checklist.warningMessage}
                style={{ fontSize: 12 }}
                data-testid="fallback-warning"
              />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div style={{ padding: '8px 12px' }}>
              <Alert
                type="error"
                showIcon
                message={error}
                action={
                  <Button size="small" onClick={clearError}>
                    关闭
                  </Button>
                }
                data-testid="checklist-error"
              />
            </div>
          )}

          {/* Generating state */}
          {isGenerating && (
            <div
              className="flex flex-col items-center gap-2 p-6"
              data-testid="checklist-generating"
            >
              <Spin />
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {message || '正在生成攻击清单...'}
              </span>
              {progress > 0 && (
                <Progress
                  percent={progress}
                  size="small"
                  showInfo={false}
                  style={{ width: '80%' }}
                />
              )}
            </div>
          )}

          {/* Empty state */}
          {!isGenerating && !hasChecklist && (
            <div className="flex flex-col items-center gap-3 p-6" data-testid="checklist-empty">
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  textAlign: 'center',
                  lineHeight: '18px',
                }}
              >
                尚未生成攻击清单。点击&ldquo;生成攻击清单&rdquo;按钮，让 AI 帮您提前发现方案薄弱点。
              </span>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={generateChecklist}
                loading={loading}
                block
                data-testid="generate-checklist-button"
              >
                生成攻击清单
              </Button>
            </div>
          )}

          {/* Items list */}
          {hasChecklist && (
            <>
              {/* Progress bar */}
              <div style={{ padding: '8px 12px 4px' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    已防御 {stats.addressed} / 共 {stats.total} 条
                  </span>
                  <div className="flex items-center gap-2">
                    <Switch
                      size="small"
                      checked={showAll}
                      onChange={setShowAll}
                      data-testid="show-all-switch"
                    />
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                      显示全部
                    </span>
                  </div>
                </div>
                <Progress
                  percent={stats.progressPercent}
                  size="small"
                  showInfo={false}
                  strokeColor={getProgressColor(stats.progressPercent)}
                  data-testid="progress-bar"
                />
              </div>

              {/* Regenerate button */}
              <div style={{ padding: '4px 12px 8px' }}>
                <Button
                  size="small"
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={generateChecklist}
                  loading={loading}
                  data-testid="regenerate-button"
                >
                  重新生成
                </Button>
              </div>

              {/* Item cards */}
              <div className="flex flex-col gap-2" style={{ padding: '0 12px 12px' }}>
                {displayItems.map((item) => (
                  <AttackChecklistItemCard
                    key={item.id}
                    item={item}
                    onUpdateStatus={updateItemStatus}
                    onNavigateToSection={onNavigateToChapter}
                  />
                ))}
                {displayItems.length === 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                      padding: 12,
                    }}
                  >
                    所有条目已处理
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
