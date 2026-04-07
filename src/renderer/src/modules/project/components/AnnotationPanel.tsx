import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  CommentOutlined,
  FileTextOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { Alert, Badge, Button, Skeleton, Tooltip, message } from 'antd'
import {
  useProjectAnnotations,
  usePendingAnnotationCount,
} from '@renderer/modules/annotation/hooks/useAnnotation'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import { AnnotationCard } from '@renderer/modules/annotation/components/AnnotationCard'
import { AnnotationFilters } from '@renderer/modules/annotation/components/AnnotationFilters'
import { useAnnotationFilters } from '@renderer/modules/annotation/hooks/useAnnotationFilters'
import { AnnotationOverloadPanel } from '@renderer/modules/annotation/components/AnnotationOverloadPanel'
import type { OverloadMode } from '@renderer/modules/annotation/components/AnnotationOverloadPanel'
import {
  filterAnnotations,
  countByStatus,
} from '@renderer/modules/annotation/lib/annotationFilters'
import { sortAnnotations } from '@renderer/modules/annotation/lib/annotationSorter'
import {
  scopeToSection,
  getSummaryItems,
  OVERLOAD_THRESHOLD,
} from '@renderer/modules/annotation/lib/annotationSectionScope'
import { AskSystemDialog } from '@renderer/modules/annotation/components/AskSystemDialog'
import { ANNOTATION_TYPE_ACTIONS } from '@renderer/modules/annotation/constants/annotation-colors'
import type { AnnotationRecord } from '@shared/annotation-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

export interface CurrentSectionProp {
  locator: ChapterHeadingLocator
  sectionKey: string
  label: string
}

interface AnnotationPanelProps {
  collapsed: boolean
  isCompact: boolean
  onToggle: () => void
  projectId?: string
  sopPhase?: string
  currentSection?: CurrentSectionProp | null
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

function EmptyContent({
  currentSection,
}: {
  currentSection?: CurrentSectionProp | null
}): React.JSX.Element {
  if (currentSection) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 p-4"
        data-testid="annotation-empty-section"
      >
        <CheckCircleOutlined style={{ fontSize: 36, color: 'var(--color-success)' }} />
        <span className="text-body" style={{ color: 'var(--color-text-secondary)' }}>
          本章节 AI 审查完毕，未发现需要您关注的问题
        </span>
      </div>
    )
  }

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

function ErrorContent({
  message: errorMessage,
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
        description={errorMessage}
        action={
          <Button size="small" onClick={onRetry} data-testid="annotation-retry">
            重试
          </Button>
        }
      />
    </div>
  )
}

function shouldShowLoadingState(state: {
  loading: boolean
  loaded: boolean
  error: string | null
}): boolean {
  if (state.loaded) return false
  return state.loading || !state.error
}

function ListContent({
  items,
  focusedIndex,
  cardRefs,
}: {
  items: AnnotationRecord[]
  focusedIndex: number
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
}): React.JSX.Element {
  return (
    <div
      role="list"
      className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
      data-testid="annotation-list"
    >
      {items.map((item, index) => (
        <AnnotationCard
          key={item.id}
          annotation={item}
          focused={index === focusedIndex}
          ref={(el) => {
            if (el) {
              cardRefs.current.set(index, el)
            } else {
              cardRefs.current.delete(index)
            }
          }}
        />
      ))}
    </div>
  )
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return -1
  if (index < 0) return 0
  if (index >= length) return length - 1
  return index
}

function useKeyboardNavigation({ items, active }: { items: AnnotationRecord[]; active: boolean }): {
  focusedIndex: number
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
} {
  const [rawIndex, setFocusedIndex] = useState(items.length > 0 ? 0 : -1)
  const focusedIndex = clampIndex(rawIndex, items.length)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const updateAnnotation = useAnnotationStore((s) => s.updateAnnotation)

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const el = cardRefs.current.get(focusedIndex)
      el?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [focusedIndex])

  useEffect(() => {
    if (!active || items.length === 0) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return

      // Don't intercept when target is inside an input/editor (check ancestors too)
      const target = e.target
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, [contenteditable="true"], [role="textbox"], [data-testid="plate-editor-content"]'
        )
      ) {
        return
      }

      const key = e.key

      if (key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
        return
      }

      if (key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
        return
      }

      const showUpdateError = (): void => {
        void message.error('批注状态更新失败，请重试')
      }

      // Status-changing shortcuts: only for pending cards
      if (key === 'Enter' || key === 'Backspace' || key === 'd' || key === 'D') {
        e.preventDefault()
        const focused = items[focusedIndex]
        if (!focused) return

        if (focused.status !== 'pending') {
          void message.info('该批注已处理，无需重复操作')
          return
        }

        const actions = ANNOTATION_TYPE_ACTIONS[focused.type]

        if (key === 'Enter') {
          const primary = actions.find((a) => a.primary && a.targetStatus)
          if (primary?.targetStatus) {
            void updateAnnotation({ id: focused.id, status: primary.targetStatus }).then((ok) => {
              if (!ok) showUpdateError()
            })
          }
        } else if (key === 'Backspace') {
          const rejectAction = actions.find((a) => a.targetStatus === 'rejected')
          if (rejectAction) {
            void updateAnnotation({ id: focused.id, status: 'rejected' }).then((ok) => {
              if (!ok) showUpdateError()
            })
          } else {
            void message.info('该类型批注没有驳回操作')
          }
        } else {
          // Alt+D
          void updateAnnotation({ id: focused.id, status: 'needs-decision' }).then((ok) => {
            if (!ok) showUpdateError()
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, items, focusedIndex, updateAnnotation])

  return { focusedIndex, cardRefs }
}

function SectionLabel({ label }: { label: string }): React.JSX.Element {
  return (
    <div
      className="flex shrink-0 items-center px-4 py-1"
      style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-global)',
      }}
      data-testid="section-label"
    >
      <span className="text-caption" style={{ color: 'var(--color-text-tertiary)' }}>
        当前章节: {label}
      </span>
    </div>
  )
}

function PanelBody({
  projectId,
  active,
  sopPhase,
  currentSection,
}: {
  projectId?: string
  active: boolean
  sopPhase?: string
  currentSection?: CurrentSectionProp | null
}): React.JSX.Element {
  const project = useProjectAnnotations(projectId ?? '')
  const loadAnnotations = useAnnotationStore((state) => state.loadAnnotations)
  const { items, loaded, error } = project

  const filters = useAnnotationFilters()
  const [overloadMode, setOverloadMode] = useState<OverloadMode>('none')

  // Reset overload mode when section changes (ref-based to avoid setState in effect)
  const sectionKey = currentSection?.sectionKey ?? null
  const prevSectionKeyRef = useRef(sectionKey)
  if (prevSectionKeyRef.current !== sectionKey) {
    prevSectionKeyRef.current = sectionKey
    if (overloadMode !== 'none') {
      setOverloadMode('none')
    }
  }

  // Pipeline: scope → filter → sort
  const scopedItems = useMemo(() => scopeToSection(items, sectionKey), [items, sectionKey])

  const filteredItems = useMemo(
    () => filterAnnotations(scopedItems, filters.typeFilter, filters.statusFilter),
    [scopedItems, filters.typeFilter, filters.statusFilter]
  )

  const sortedItems = useMemo(
    () =>
      sortAnnotations(filteredItems, {
        sopPhase: (sopPhase ?? 'proposal-writing') as Parameters<
          typeof sortAnnotations
        >[1]['sopPhase'],
      }),
    [filteredItems, sopPhase]
  )

  // Display items: apply summary mode if active
  const displayItems = useMemo(() => {
    if (overloadMode === 'summary') {
      return getSummaryItems(scopedItems, sopPhase ?? 'proposal-writing')
    }
    return sortedItems
  }, [overloadMode, sortedItems, scopedItems, sopPhase])

  // Status counts for badges (based on scoped + type-filtered items)
  const statusCounts = useMemo(
    () => countByStatus(scopedItems, filters.typeFilter),
    [scopedItems, filters.typeFilter]
  )

  // Pending count for overload detection (scoped + type-filtered)
  const scopedPendingCount = useMemo(
    () => filterAnnotations(scopedItems, filters.typeFilter, 'pending').length,
    [scopedItems, filters.typeFilter]
  )

  const { focusedIndex, cardRefs } = useKeyboardNavigation({
    items: displayItems,
    active: active && !!projectId,
  })

  if (!projectId) {
    return <EmptyContent />
  }
  if (shouldShowLoadingState(project)) {
    return <LoadingContent />
  }
  if (!loaded && error) {
    return <ErrorContent message={error} onRetry={() => void loadAnnotations(projectId)} />
  }

  return (
    <>
      <AnnotationFilters
        typeFilter={filters.typeFilter}
        statusFilter={filters.statusFilter}
        statusCounts={statusCounts}
        onToggleType={filters.toggleType}
        onStatusChange={filters.setStatusFilter}
      />
      {currentSection && <SectionLabel label={currentSection.label} />}
      {filters.statusFilter === 'pending' && scopedPendingCount > OVERLOAD_THRESHOLD && (
        <AnnotationOverloadPanel pendingCount={scopedPendingCount} onSelectMode={setOverloadMode} />
      )}
      {displayItems.length === 0 ? (
        <EmptyContent currentSection={currentSection} />
      ) : (
        <ListContent items={displayItems} focusedIndex={focusedIndex} cardRefs={cardRefs} />
      )}
      <AskSystemDialog projectId={projectId} currentSection={currentSection ?? null} />
    </>
  )
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
  const showSpinner = shouldShowLoadingState(project)
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
  sopPhase,
  currentSection,
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
              <PanelBody
                projectId={projectId}
                active={true}
                sopPhase={sopPhase}
                currentSection={currentSection}
              />
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

        {/* Content area */}
        <PanelBody
          projectId={projectId}
          active={true}
          sopPhase={sopPhase}
          currentSection={currentSection}
        />
      </div>
    </aside>
  )
}
