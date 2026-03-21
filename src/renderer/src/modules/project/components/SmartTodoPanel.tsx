import { useEffect, useRef, useCallback } from 'react'
import { Badge, Button, Empty, Tooltip } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CalendarOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTodoStore } from '@renderer/stores'
import { SOP_STAGE_CONFIG } from '../types'
import type { ProjectWithPriority } from '@shared/ipc-types'
import type { SopStageKey } from '../types'

interface SmartTodoPanelProps {
  collapsed: boolean
  isCompact: boolean
  onToggle: () => void
  onCreateProject: () => void
}

const TODO_PANEL_WIDTH = 320
const TODO_PANEL_ICON_BAR_WIDTH = 48
const TOP_NAV_HEIGHT = 56

function getDeadlineStyle(deadline: string | null): { text: string; className: string } {
  if (!deadline) {
    return { text: '未设定', className: 'text-text-tertiary' }
  }
  const deadlineDate = new Date(deadline)
  if (Number.isNaN(deadlineDate.getTime())) {
    return { text: '未设定', className: 'text-text-tertiary' }
  }
  const now = new Date()
  const diffMs = deadlineDate.getTime() - now.getTime()
  const daysLeft = Math.ceil(diffMs / (24 * 60 * 60 * 1000))

  const month = String(deadlineDate.getMonth() + 1).padStart(2, '0')
  const day = String(deadlineDate.getDate()).padStart(2, '0')
  const dateStr = `${month}-${day}`

  if (daysLeft < 0) {
    return { text: `${dateStr}（已过期）`, className: 'text-danger' }
  }
  if (daysLeft <= 3) {
    const suffix = daysLeft === 0 ? '（今天截止）' : `（${daysLeft}天后）`
    return { text: `${dateStr}${suffix}`, className: 'text-warning' }
  }
  return { text: dateStr, className: 'text-text-tertiary' }
}

function getSopStageDisplay(sopStage: string): { label: string; color: string } {
  const config = SOP_STAGE_CONFIG[sopStage as SopStageKey]
  if (!config) return { label: '未启动', color: 'var(--color-sop-idle)' }
  return config
}

function TodoItem({
  item,
  onClick,
}: {
  item: ProjectWithPriority
  onClick: (id: string) => void
}): React.JSX.Element {
  const deadline = getDeadlineStyle(item.deadline)
  const stage = getSopStageDisplay(item.sopStage)

  return (
    <div
      className="hover:bg-bg-content cursor-pointer border-b px-4 py-2 transition-colors hover:rounded-md"
      style={{ borderColor: 'var(--color-border)' }}
      role="listitem"
      tabIndex={0}
      onClick={() => onClick(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(item.id)
      }}
      data-testid={`todo-item-${item.id}`}
    >
      <div className="truncate text-sm font-medium">{item.name}</div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: stage.color }}
        />
        <span className="text-caption" style={{ color: stage.color }}>
          {stage.label}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        <CalendarOutlined className={`text-caption ${deadline.className}`} />
        <span className={`text-caption ${deadline.className}`}>{deadline.text}</span>
      </div>
      <div className="text-text-tertiary text-caption mt-1">下一步：{item.nextAction}</div>
    </div>
  )
}

function TodoEmptyState({ onCreateProject }: { onCreateProject: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center" data-testid="todo-empty-state">
      <Empty description={false}>
        <div className="mb-1 text-base text-gray-500">暂无待办事项</div>
        <div className="text-text-tertiary text-caption mb-4">创建第一个投标项目开始</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreateProject}>
          新建项目
        </Button>
      </Empty>
    </div>
  )
}

export function SmartTodoPanel({
  collapsed,
  isCompact,
  onToggle,
  onCreateProject,
}: SmartTodoPanelProps): React.JSX.Element {
  const { todoItems } = useTodoStore()
  const navigate = useNavigate()
  const flyoutRef = useRef<HTMLDivElement>(null)
  const collapsedTriggerRef = useRef<HTMLButtonElement>(null)
  const iconBarRef = useRef<HTMLDivElement>(null)

  const handleItemClick = useCallback(
    (id: string) => {
      navigate(`/project/${id}`)
    },
    [navigate]
  )

  // Close flyout on outside click or Escape
  useEffect(() => {
    if (!isCompact || collapsed) return

    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(target) &&
        !(iconBarRef.current && iconBarRef.current.contains(target))
      ) {
        onToggle()
      }
    }

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onToggle()
        collapsedTriggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isCompact, collapsed, onToggle])

  // Focus management: focus flyout when opened
  useEffect(() => {
    if (isCompact && !collapsed && flyoutRef.current) {
      flyoutRef.current.focus()
    }
  }, [isCompact, collapsed])

  const panelContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center justify-between border-b px-4"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-h4">智能待办</span>
          <Badge
            count={todoItems.length}
            showZero
            style={{ backgroundColor: 'var(--color-brand)' }}
          />
        </div>
        <Button
          type="text"
          size="small"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="todo-panel"
          aria-label={collapsed ? '展开智能待办面板' : '折叠智能待办面板'}
          data-testid="todo-panel-toggle"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto" role="list" aria-label="待办列表">
        {todoItems.length === 0 ? (
          <TodoEmptyState onCreateProject={onCreateProject} />
        ) : (
          todoItems.map((item) => <TodoItem key={item.id} item={item} onClick={handleItemClick} />)
        )}
      </div>
    </div>
  )

  // Compact mode: collapsed = 48px icon bar
  if (isCompact) {
    return (
      <>
        {/* Icon bar (always visible in compact mode) */}
        <div
          ref={iconBarRef}
          className="bg-bg-sidebar flex shrink-0 flex-col items-center border-r pt-3"
          style={{
            width: TODO_PANEL_ICON_BAR_WIDTH,
            borderColor: 'var(--color-border)',
          }}
          data-testid="todo-panel-icon-bar"
        >
          <Tooltip title="智能待办" placement="right">
            <button
              ref={collapsedTriggerRef}
              type="button"
              className="hover:bg-bg-hover relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-controls="todo-panel"
              aria-label={collapsed ? '展开智能待办面板' : '折叠智能待办面板'}
              data-testid="todo-panel-icon-trigger"
            >
              <UnorderedListOutlined style={{ fontSize: 18, color: 'var(--color-brand)' }} />
              {todoItems.length > 0 && (
                <span className="bg-danger absolute top-1 right-1 h-2 w-2 rounded-full" />
              )}
            </button>
          </Tooltip>
        </div>

        {/* Flyout overlay */}
        {!collapsed && (
          <div
            ref={flyoutRef}
            id="todo-panel"
            className="bg-bg-sidebar fixed z-50 flex flex-col border-r"
            style={{
              top: TOP_NAV_HEIGHT,
              left: TODO_PANEL_ICON_BAR_WIDTH,
              width: TODO_PANEL_WIDTH,
              height: `calc(100vh - ${TOP_NAV_HEIGHT}px)`,
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-modal)',
              animation: 'flyout-slide-in var(--duration-panel) var(--ease-in-out)',
            }}
            role="dialog"
            aria-label="智能待办面板"
            tabIndex={-1}
            data-testid="todo-panel-flyout"
          >
            {panelContent}
          </div>
        )}
      </>
    )
  }

  // Standard mode: expand/collapse with transition
  return (
    <div
      id="todo-panel"
      className="bg-bg-sidebar relative flex shrink-0 flex-col border-r"
      style={{
        width: collapsed ? 0 : TODO_PANEL_WIDTH,
        minWidth: collapsed ? 0 : TODO_PANEL_WIDTH,
        borderColor: 'var(--color-border)',
        borderRightWidth: collapsed ? 0 : 1,
        overflow: collapsed ? 'visible' : 'hidden',
        transition: 'width var(--duration-panel) var(--ease-in-out)',
      }}
      role="complementary"
      aria-label="智能待办"
      data-testid="todo-panel"
    >
      {collapsed ? (
        <div className="pointer-events-none absolute top-3 left-3 z-10">
          <Tooltip title="展开智能待办" placement="right">
            <button
              ref={collapsedTriggerRef}
              type="button"
              className="hover:bg-bg-hover pointer-events-auto relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border-none bg-[var(--color-bg-sidebar)] transition-colors"
              onClick={onToggle}
              aria-expanded={false}
              aria-controls="todo-panel"
              aria-label="展开智能待办面板"
              data-testid="todo-panel-toggle"
            >
              <UnorderedListOutlined style={{ fontSize: 18, color: 'var(--color-brand)' }} />
              {todoItems.length > 0 && (
                <span className="bg-danger absolute top-1 right-1 h-2 w-2 rounded-full" />
              )}
            </button>
          </Tooltip>
        </div>
      ) : (
        panelContent
      )}
    </div>
  )
}
