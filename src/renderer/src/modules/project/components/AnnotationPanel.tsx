import { useState, useEffect, useCallback, useRef } from 'react'
import { CommentOutlined, FileTextOutlined, LoadingOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Skeleton, Tag, Tooltip } from 'antd'
import {
  useProjectAnnotations,
  usePendingAnnotationCount,
} from '@renderer/modules/annotation/hooks/useAnnotation'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { formatRelativeTime } from '@renderer/shared/lib/format-time'
import type { AnnotationRecord, AnnotationType, AnnotationStatus } from '@shared/annotation-types'

interface AnnotationPanelProps {
  collapsed: boolean
  isCompact: boolean
  onToggle: () => void
  projectId?: string
}

const TYPE_LABELS: Record<AnnotationType, string> = {
  'ai-suggestion': 'AI 建议',
  'asset-recommendation': '资产推荐',
  'score-warning': '评分预警',
  adversarial: '对抗攻击',
  human: '人工批注',
  'cross-role': '跨角色',
}

const TYPE_COLORS: Record<AnnotationType, string> = {
  'ai-suggestion': 'blue',
  'asset-recommendation': 'green',
  'score-warning': 'orange',
  adversarial: 'red',
  human: 'purple',
  'cross-role': 'cyan',
}

const STATUS_LABELS: Record<AnnotationStatus, string> = {
  pending: '待处理',
  accepted: '已采纳',
  rejected: '已拒绝',
  'needs-decision': '待决策',
}

const STATUS_COLORS: Record<AnnotationStatus, string> = {
  pending: 'default',
  accepted: 'success',
  rejected: 'error',
  'needs-decision': 'processing',
}

function AnnotationItem({ item }: { item: AnnotationRecord }): React.JSX.Element {
  return (
    <div
      role="listitem"
      className="flex flex-col gap-1 rounded-md p-3"
      style={{ backgroundColor: 'var(--color-bg-global)' }}
      data-testid="annotation-item"
    >
      <div className="flex items-center gap-1.5">
        <Tag color={TYPE_COLORS[item.type]} style={{ margin: 0, fontSize: 11 }}>
          {TYPE_LABELS[item.type]}
        </Tag>
        <Tag color={STATUS_COLORS[item.status]} style={{ margin: 0, fontSize: 11 }}>
          {STATUS_LABELS[item.status]}
        </Tag>
      </div>
      <p className="text-caption m-0 line-clamp-3" style={{ color: 'var(--color-text-primary)' }}>
        {item.content}
      </p>
      <span className="text-caption" style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>
        {item.author} · {formatRelativeTime(item.createdAt)}
      </span>
    </div>
  )
}

function LoadingContent(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4" data-testid="annotation-loading">
      <Skeleton active paragraph={{ rows: 2 }} title={false} />
      <Skeleton active paragraph={{ rows: 2 }} title={false} />
      <Skeleton active paragraph={{ rows: 2 }} title={false} />
      <p className="text-caption text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        正在加载批注数据...
      </p>
    </div>
  )
}

function EmptyContent(): React.JSX.Element {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 p-4"
      data-testid="annotation-empty"
    >
      <FileTextOutlined style={{ fontSize: 36, color: 'var(--color-text-quaternary)' }} />
      <span className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
        本项目暂无批注
      </span>
      <p className="text-caption m-0 text-center" style={{ color: 'var(--color-text-tertiary)' }}>
        批注将在 AI 生成、评分分析、对抗检测等流程中自动创建
      </p>
    </div>
  )
}

function ListContent({ items }: { items: AnnotationRecord[] }): React.JSX.Element {
  return (
    <div
      role="list"
      className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
      data-testid="annotation-list"
    >
      {items.map((item) => (
        <AnnotationItem key={item.id} item={item} />
      ))}
    </div>
  )
}

function ErrorContent({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center p-4" data-testid="annotation-error">
      <Alert
        type="error"
        showIcon
        message="批注加载失败"
        description={message}
        action={
          <Button size="small" onClick={onRetry} data-testid="annotation-retry">
            重试
          </Button>
        }
      />
    </div>
  )
}

function isInitialLoadPending(state: { loaded: boolean; error: string | null }): boolean {
  return !state.loaded && !state.error
}

function PanelContent({ projectId }: { projectId?: string }): React.JSX.Element {
  const project = useProjectAnnotations(projectId ?? '')
  const loadAnnotations = useAnnotationStore((state) => state.loadAnnotations)
  const { items, loaded, error } = project

  if (!projectId) {
    return <EmptyContent />
  }
  if (isInitialLoadPending(project)) {
    return <LoadingContent />
  }
  if (!loaded && error) {
    return <ErrorContent message={error} onRetry={() => void loadAnnotations(projectId)} />
  }
  if (items.length === 0) {
    return <EmptyContent />
  }
  return <ListContent items={items} />
}

function PendingPill({ projectId }: { projectId?: string }): React.JSX.Element | null {
  const count = usePendingAnnotationCount(projectId ?? '')
  if (!projectId || count === 0) return null
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: 'var(--color-brand)', color: '#fff' }}
      data-testid="annotation-pending-pill"
    >
      {count} 待处理
    </span>
  )
}

function HeaderSpinner({ projectId }: { projectId?: string }): React.JSX.Element | null {
  const project = useProjectAnnotations(projectId ?? '')
  const showSpinner = project.loading || isInitialLoadPending(project)
  if (!projectId || !showSpinner) return null
  return (
    <LoadingOutlined
      style={{ fontSize: 14, color: 'var(--color-brand)' }}
      spin
      data-testid="annotation-header-spinner"
    />
  )
}

export function AnnotationPanel({
  collapsed,
  isCompact,
  onToggle,
  projectId,
}: AnnotationPanelProps): React.JSX.Element {
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const iconBarRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pendingCount = usePendingAnnotationCount(projectId ?? '')

  const closeFlyout = useCallback(() => {
    setFlyoutOpen(false)
    triggerRef.current?.focus()
  }, [])

  const toggleFlyout = useCallback(() => {
    setFlyoutOpen((prev) => !prev)
  }, [])

  // Close flyout on outside click
  useEffect(() => {
    if (!flyoutOpen) return

    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        iconBarRef.current &&
        !iconBarRef.current.contains(target)
      ) {
        closeFlyout()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [flyoutOpen, closeFlyout])

  // Close flyout on Escape
  useEffect(() => {
    if (!flyoutOpen) return

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFlyout()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [flyoutOpen, closeFlyout])

  // Focus management: move focus into flyout when opened
  useEffect(() => {
    if (flyoutOpen && flyoutRef.current) {
      flyoutRef.current.focus()
    }
  }, [flyoutOpen])

  // Compact mode + collapsed: show icon bar
  if (isCompact && collapsed) {
    return (
      <div className="relative shrink-0" style={{ width: 48 }}>
        {/* Icon bar */}
        <div
          ref={iconBarRef}
          className="flex h-full flex-col items-center pt-3"
          style={{
            width: 48,
            borderLeft: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-content)',
          }}
          data-testid="annotation-icon-bar"
        >
          <Tooltip title="智能批注" placement="left">
            <button
              ref={triggerRef}
              type="button"
              className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-2 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
              onClick={toggleFlyout}
              aria-expanded={flyoutOpen}
              aria-controls="annotation-flyout"
              aria-label="智能批注"
              data-testid="annotation-icon-button"
            >
              <Badge count={pendingCount} size="small" offset={[4, -4]}>
                <CommentOutlined style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }} />
              </Badge>
            </button>
          </Tooltip>
        </div>

        {/* Flyout panel */}
        {flyoutOpen && (
          <div
            ref={flyoutRef}
            id="annotation-flyout"
            role="dialog"
            aria-label="智能批注面板"
            tabIndex={-1}
            className="absolute top-0 h-full"
            style={{
              right: 48,
              width: 320,
              zIndex: 10,
              backgroundColor: 'var(--color-bg-content)',
              borderLeft: '1px solid var(--color-border)',
              animation: 'flyout-slide-in var(--duration-panel) var(--ease-in-out)',
            }}
            data-testid="annotation-flyout"
          >
            <div className="flex h-full flex-col">
              <div
                className="flex shrink-0 items-center justify-between px-4"
                style={{ height: 48, borderBottom: '1px solid var(--color-border)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-h4">批注</span>
                  <PendingPill projectId={projectId} />
                  <HeaderSpinner projectId={projectId} />
                </div>
              </div>
              <PanelContent projectId={projectId} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // Standard mode, collapsed: narrow strip with expand button
  if (collapsed) {
    return (
      <aside
        id="annotation-panel"
        role="complementary"
        aria-label="智能批注"
        className="shrink-0"
        style={{
          width: 40,
          borderLeft: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-content)',
          transition: 'width var(--duration-panel) var(--ease-in-out)',
        }}
        data-testid="annotation-panel"
      >
        <div className="flex h-full flex-col items-center pt-3" style={{ width: 40 }}>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
            onClick={onToggle}
            aria-expanded={false}
            aria-controls="annotation-panel"
            aria-label="展开智能批注"
            data-testid="annotation-toggle"
          >
            <CommentOutlined style={{ fontSize: 14 }} />
          </button>
        </div>
      </aside>
    )
  }

  // Standard mode, expanded: full panel
  return (
    <aside
      id="annotation-panel"
      role="complementary"
      aria-label="智能批注"
      aria-live="polite"
      className="shrink-0 overflow-hidden"
      style={{
        width: 320,
        borderLeft: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-content)',
        transition: 'width var(--duration-panel) var(--ease-in-out)',
      }}
      data-testid="annotation-panel"
    >
      <div className="flex h-full flex-col" style={{ width: 320 }}>
        {/* Title bar */}
        <div
          className="flex shrink-0 items-center justify-between px-4"
          style={{ height: 48, borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-h4">批注</span>
            <PendingPill projectId={projectId} />
            <HeaderSpinner projectId={projectId} />
          </div>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center rounded border-none bg-transparent p-1 transition-colors outline-none hover:bg-[var(--color-bg-global)] focus-visible:ring-2 focus-visible:ring-[var(--color-sop-active)] focus-visible:ring-offset-2"
            onClick={onToggle}
            aria-expanded={true}
            aria-controls="annotation-panel"
            aria-label="折叠智能批注"
            data-testid="annotation-toggle"
          >
            <CommentOutlined style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Content area — loading / empty / list */}
        <PanelContent projectId={projectId} />
      </div>
    </aside>
  )
}
