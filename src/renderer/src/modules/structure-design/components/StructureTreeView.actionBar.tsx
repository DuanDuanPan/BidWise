import { Button } from 'antd'
import { ArrowLeftOutlined, StarFilled, RightOutlined } from '@ant-design/icons'

interface StructureActionBarProps {
  total: number
  keyFocus: number
  showStats: boolean
  confirmLabel: string
  /** When true, the primary CTA shows an AntD loading spinner and blocks clicks. */
  confirmLoading?: boolean
  onConfirm?: () => void
  onReselectTemplate?: () => void
}

/**
 * Story 11.9 底部操作栏。工业风：墨黑 ink-bar 左链接 + mono 统计 + 强化 CTA。
 * 两端回调皆缺省时整个 bar 自动隐藏。
 */
export function StructureActionBar({
  total,
  keyFocus,
  showStats,
  confirmLabel,
  confirmLoading,
  onConfirm,
  onReselectTemplate,
}: StructureActionBarProps): React.JSX.Element | null {
  if (!onConfirm && !onReselectTemplate) return null
  return (
    <div
      className="relative flex items-stretch border-t-2 border-[#0E1015] bg-[#FBFAF6]"
      data-testid="structure-tree-action-bar"
    >
      {onReselectTemplate && (
        <button
          type="button"
          onClick={onReselectTemplate}
          data-testid="regenerate-btn"
          className="group flex items-center gap-2 border-r border-[var(--color-border)] px-5 py-3 text-[13px] font-medium text-[#5E626B] transition-colors hover:text-[#0E1015]"
        >
          <ArrowLeftOutlined style={{ fontSize: 11, color: '#FF5A1F' }} />
          重新选择模板
        </button>
      )}

      {showStats && (
        <div className="flex flex-1 items-center gap-3 px-5 text-[12px] text-[#5E626B]">
          <StarFilled style={{ fontSize: 11, color: '#FF5A1F' }} aria-hidden />
          <span data-testid="structure-tree-stats">
            {total} 个章节，{keyFocus} 个重点章节
          </span>
        </div>
      )}

      {onConfirm && (
        <div className="flex items-stretch border-l-2 border-[#0E1015]">
          <Button
            type="primary"
            onClick={onConfirm}
            loading={confirmLoading}
            disabled={confirmLoading}
            data-testid="confirm-skeleton-btn"
            icon={!confirmLoading ? <RightOutlined /> : undefined}
            style={{
              height: '100%',
              minHeight: 48,
              padding: '0 28px',
              borderRadius: 0,
              fontWeight: 600,
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      )}
    </div>
  )
}
