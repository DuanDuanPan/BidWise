import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button, Dropdown, Input, Tooltip, type InputRef } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  HolderOutlined,
  LoadingOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  StarFilled,
  ThunderboltOutlined,
  UndoOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import type { ChapterNodeState, PendingDeleteEntry } from '@renderer/stores/chapterStructureStore'

/**
 * Story 11.9 工业风重构。
 *   - 行布局：grip · code · title · badges · actions，等宽 mono 编号列建立节奏
 *   - 一级节点：墨黑反色，橙色 accent 竖条
 *   - 五态保留：focused / editing / locked / pending-delete / idle
 *   - hover 才显拖拽把手与操作按钮，默认安静
 */

export interface StructureRowProps {
  nodeKey: string
  title: string
  level: number
  /** 章节编号（由容器按树位置注入），例 `02.01` */
  sectionCode: string
  state: ChapterNodeState
  pendingDelete: PendingDeleteEntry | null
  generationPhase?: ChapterGenerationPhase
  isKeyFocus?: boolean
  weightPercent?: number
  /** Always visible so hover-menu tests can open the Dropdown without focus. */
  alwaysShowMore?: boolean
  /** Disable `添加子章节` menu entry when at max depth. */
  canAddChild?: boolean
  onCommitTitle?: (key: string, nextTitle: string) => void | Promise<void>
  onCancelEditing?: () => void
  onStartEditing?: (key: string) => void
  onFocusNode?: (key: string) => void
  onAddSibling?: (key: string) => void
  onAddChild?: (key: string) => void
  onDelete?: (key: string, title: string) => void
  onUndoPendingDelete?: (key: string) => void
}

function subscribeToTick(callback: () => void): () => void {
  const timer = window.setInterval(callback, 250)
  return () => window.clearInterval(timer)
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCountdownSeconds(pendingDelete: PendingDeleteEntry | null): number | null {
  const getSnapshot = useCallback(() => {
    if (!pendingDelete) return null
    const expiry = Date.parse(pendingDelete.expiresAt)
    return Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
  }, [pendingDelete])

  const subscribe = useCallback(
    (cb: () => void) => (pendingDelete ? subscribeToTick(cb) : () => undefined),
    [pendingDelete]
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function StructureRow({
  nodeKey,
  title,
  level,
  sectionCode,
  state,
  pendingDelete,
  generationPhase,
  isKeyFocus,
  weightPercent,
  alwaysShowMore,
  canAddChild,
  onCommitTitle,
  onCancelEditing,
  onStartEditing,
  onFocusNode,
  onAddSibling,
  onAddChild,
  onDelete,
  onUndoPendingDelete,
}: StructureRowProps): React.JSX.Element {
  const remaining = useCountdownSeconds(pendingDelete)
  const isL1 = level === 1

  const handleClick = (): void => {
    if (state === 'locked' || state === 'pending-delete') return
    onFocusNode?.(nodeKey)
  }

  const handleDoubleClick = (): void => {
    if (state === 'locked' || state === 'pending-delete') return
    onStartEditing?.(nodeKey)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (state === 'locked' || state === 'pending-delete') return
    if (e.key === 'F2' && state !== 'editing') {
      e.preventDefault()
      onStartEditing?.(nodeKey)
    }
  }

  const commit = (nextTitle: string): void => {
    const trimmed = nextTitle.trim()
    if (trimmed && trimmed !== title) {
      void onCommitTitle?.(nodeKey, trimmed)
      return
    }
    onCancelEditing?.()
  }

  const cancel = (): void => {
    onCancelEditing?.()
  }

  return (
    <div
      role="treeitem"
      tabIndex={state === 'locked' || state === 'pending-delete' ? -1 : 0}
      aria-selected={state === 'focused' || state === 'editing'}
      aria-disabled={state === 'locked' || state === 'pending-delete' ? true : undefined}
      data-testid={`tree-node-${nodeKey}`}
      data-node-state={state}
      data-node-level={level}
      data-section-code={sectionCode}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={nodeWrapperClassName(state, isL1)}
    >
      {state === 'focused' && (
        <div
          aria-hidden
          data-testid={`tree-node-${nodeKey}-focus-bar`}
          className="bg-brand pointer-events-none absolute inset-y-0 left-0 w-[3px]"
        />
      )}

      {/* 拖拽把手（hover 才显）。AntD Tree 依旧负责真正的 DnD；此把手为视觉提示。 */}
      <span
        aria-hidden
        className={`flex w-5 shrink-0 items-center justify-center text-[12px] leading-none ${
          isL1 ? 'text-[#5A5D64]' : 'text-[#C5C8CE]'
        } opacity-0 transition-opacity group-hover:opacity-100`}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <HolderOutlined />
      </span>

      {/* 章节编号 */}
      <span
        className={`w-16 shrink-0 text-[12px] font-medium tracking-[0.03em] ${
          isL1
            ? 'text-[#FF7B3F]'
            : state === 'focused'
              ? 'text-brand'
              : 'text-[var(--color-text-tertiary)]'
        }`}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {sectionCode}
      </span>

      {state === 'editing' ? (
        <EditingRow initialTitle={title} onCommit={commit} onCancel={cancel} nodeKey={nodeKey} />
      ) : (
        <>
          <LeadingIcon state={state} />
          <span className={titleClassName(state, isL1)}>{title}</span>
          {weightPercent !== undefined && <WeightPill weightPercent={weightPercent} />}
          {isKeyFocus && (
            <span
              data-testid={`key-focus-${nodeKey}`}
              className="inline-flex items-center gap-1 px-1.5 py-[3px] text-[10px] leading-none font-semibold tracking-[0.14em] text-white uppercase"
              style={{
                fontFamily: 'var(--font-mono)',
                background: '#FF5A1F',
              }}
            >
              <StarFilled style={{ fontSize: 9 }} />
              重点投入
            </span>
          )}
          {state === 'idle' && <PhaseDecorator phase={generationPhase} />}
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {(state === 'focused' || state === 'idle' || state === 'editing') && (
          <NodeActions
            nodeKey={nodeKey}
            title={title}
            visible={state === 'focused' || !!alwaysShowMore}
            canAddChild={canAddChild ?? true}
            showAddChildButton={state === 'focused'}
            isL1={isL1}
            onAddSibling={onAddSibling}
            onAddChild={onAddChild}
            onDelete={onDelete}
          />
        )}
        {state === 'locked' && <LockedBadge />}
        {state === 'pending-delete' && (
          <PendingDeleteActions
            nodeKey={nodeKey}
            remainingSec={remaining ?? 0}
            onUndo={() => onUndoPendingDelete?.(nodeKey)}
          />
        )}
      </div>
    </div>
  )
}

function nodeWrapperClassName(state: ChapterNodeState, isL1: boolean): string {
  // 一级行：墨黑反色 + 橙色 3px 竖条（通过 ::before 难以用 Tailwind 表达，改用内部元素）。
  // 行高：L1 = 48px，L2+ = 44px。保持工业密度。
  const geometry = isL1
    ? 'h-12 border-y-[1.5px] border-[#0E1015] pl-2 pr-4'
    : 'h-11 border-b border-[var(--color-border)] pl-2 pr-4'
  const base = `group relative flex w-full items-center gap-2.5 transition-[background-color,box-shadow] duration-[var(--duration-micro)] ease-out cursor-pointer select-none motion-reduce:transition-none ${geometry}`

  // L1 基础视觉
  const l1Bg = isL1 ? 'bg-[#0E1015] text-[#F5F5F0] hover:bg-[#1a1c22]' : ''

  switch (state) {
    case 'focused':
      return isL1
        ? `${base} ${l1Bg} shadow-[inset_3px_0_0_#FF5A1F]`
        : `${base} bg-brand-light shadow-[inset_3px_0_0_var(--color-brand)]`
    case 'editing':
      return `${base} ${isL1 ? l1Bg : 'bg-bg-content'}`
    case 'locked':
      return `${base} ${isL1 ? 'bg-[#1a1c22] text-[#8A8E95]' : 'bg-bg-sidebar'} cursor-not-allowed`
    case 'pending-delete':
      // Story 11.9 AC7 要求：pending-delete 行背景 + 标题删除线。保留 bg-[#FFF1F0] 断言字面量。
      return `${base} bg-[#FFF1F0] cursor-not-allowed`
    case 'idle':
    default:
      return `${base} ${isL1 ? l1Bg : 'bg-transparent hover:bg-bg-hover/40'}`
  }
}

function titleClassName(state: ChapterNodeState, isL1: boolean): string {
  const base = isL1
    ? 'truncate text-[14px] font-semibold tracking-[0.04em]'
    : 'truncate text-[14px]'

  if (isL1) {
    // 一级行：白文 + 橙色竖条装饰（伪前缀，工业分隔感）。
    switch (state) {
      case 'pending-delete':
        return `${base} text-[#FF8A6F] line-through`
      default:
        return `${base} text-[#F5F5F0]`
    }
  }

  switch (state) {
    case 'focused':
      return `${base} text-brand font-semibold`
    case 'locked':
      return `${base} text-text-tertiary font-medium`
    case 'pending-delete':
      return `${base} text-danger font-medium line-through`
    default:
      return `${base} text-text-primary font-medium`
  }
}

function WeightPill({ weightPercent }: { weightPercent: number }): React.JSX.Element {
  const tone =
    weightPercent >= 15
      ? { bg: '#FFECE6', fg: '#C43B0B', border: '#FF5A1F' }
      : weightPercent >= 5
        ? { bg: '#FFF7E6', fg: '#8A6600', border: '#FAAD14' }
        : { bg: '#F5F5F5', fg: '#5E626B', border: '#E8E8E8' }
  return (
    <span
      className="inline-flex items-center px-1.5 py-[2px] text-[10px] leading-none font-semibold tracking-[0.04em]"
      style={{
        fontFamily: 'var(--font-mono)',
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {weightPercent}%
    </span>
  )
}

function PhaseDecorator({
  phase,
}: {
  phase: ChapterGenerationPhase | undefined
}): React.JSX.Element | null {
  if (!phase) return null
  switch (phase) {
    case 'queued':
      return (
        <ClockCircleOutlined
          aria-label="队列中"
          data-testid="structure-node-phase-queued"
          style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 6 }}
        />
      )
    case 'analyzing':
    case 'generating-text':
    case 'validating-text':
    case 'generating-diagrams':
    case 'validating-diagrams':
    case 'composing':
    case 'validating-coherence':
    case 'annotating-sources':
    case 'skeleton-generating':
    case 'batch-generating':
    case 'batch-composing':
      return (
        <LoadingOutlined
          aria-label="生成中"
          data-testid="structure-node-phase-running"
          style={{ fontSize: 11, color: 'var(--color-brand)', marginLeft: 6 }}
        />
      )
    case 'completed':
    case 'skeleton-ready':
      return (
        <CheckCircleOutlined
          aria-label="已完成"
          data-testid="structure-node-phase-completed"
          style={{ fontSize: 11, color: 'var(--color-success)', marginLeft: 6 }}
        />
      )
    case 'failed':
    case 'conflicted':
      return (
        <WarningOutlined
          aria-label="异常"
          data-testid="structure-node-phase-failed"
          style={{ fontSize: 11, color: 'var(--color-danger)', marginLeft: 6 }}
        />
      )
    default:
      return null
  }
}

function LeadingIcon({ state }: { state: ChapterNodeState }): React.JSX.Element | null {
  if (state === 'locked') {
    return (
      <LockOutlined aria-hidden style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }} />
    )
  }
  if (state === 'pending-delete') {
    return <DeleteOutlined aria-hidden style={{ fontSize: 14, color: 'var(--color-danger)' }} />
  }
  return null
}

function NodeActions({
  nodeKey,
  title,
  visible,
  canAddChild,
  showAddChildButton,
  isL1,
  onAddSibling,
  onAddChild,
  onDelete,
}: {
  nodeKey: string
  title: string
  visible: boolean
  canAddChild: boolean
  showAddChildButton: boolean
  isL1: boolean
  onAddSibling?: (key: string) => void
  onAddChild?: (key: string) => void
  onDelete?: (key: string, title: string) => void
}): React.JSX.Element {
  const items = [
    {
      key: 'add-sibling',
      icon: <PlusOutlined />,
      label: '添加同级章节',
      onClick: () => onAddSibling?.(nodeKey),
    },
    {
      key: 'add-child',
      icon: <PlusOutlined />,
      label: '添加子章节',
      disabled: !canAddChild,
      onClick: () => onAddChild?.(nodeKey),
    },
    { type: 'divider' as const },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
      onClick: () => onDelete?.(nodeKey, title),
    },
  ]

  const visibility = visible ? '' : 'invisible group-hover:visible'
  const btnBase = isL1
    ? 'inline-flex h-6 w-6 items-center justify-center border border-[#3A3D44] bg-transparent text-[#D5D8DD] transition-colors hover:bg-[#FF5A1F] hover:border-[#FF5A1F] hover:text-white'
    : 'inline-flex h-6 w-6 items-center justify-center border border-[var(--color-border)] bg-white text-[#2A2D35] transition-colors hover:bg-[#0E1015] hover:border-[#0E1015] hover:text-white'

  return (
    <>
      {showAddChildButton && (
        <Button
          size="small"
          icon={<PlusOutlined />}
          data-testid={`structure-node-add-child-${nodeKey}`}
          className={
            isL1
              ? '!border-[#FF5A1F] !bg-[#FF5A1F] !text-white hover:!bg-[#C43B0B]'
              : '!border-brand !text-brand !bg-[var(--color-bg-content)]'
          }
          style={{ borderRadius: 0, height: 26, fontFamily: 'var(--font-sans)' }}
          onClick={(e) => {
            e.stopPropagation()
            onAddChild?.(nodeKey)
          }}
        >
          子节点
        </Button>
      )}
      <span className={visibility}>
        <Dropdown menu={{ items }} trigger={['click']}>
          <button
            type="button"
            aria-label="更多操作"
            data-testid={`node-actions-${nodeKey}`}
            className={btnBase}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreOutlined style={{ fontSize: 14 }} />
          </button>
        </Dropdown>
      </span>
    </>
  )
}

function EditingRow({
  nodeKey,
  initialTitle,
  onCommit,
  onCancel,
}: {
  nodeKey: string
  initialTitle: string
  onCommit: (nextTitle: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialTitle)
  const [hintVisible, setHintVisible] = useState(false)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    inputRef.current?.focus({ cursor: 'end' })
    const timer = setTimeout(() => setHintVisible(true), 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      className="flex flex-1 items-center gap-3"
      onClick={(e) => e.stopPropagation()}
      data-testid={`edit-input-wrapper-${nodeKey}`}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={() => onCommit(value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.stopPropagation()
          }
        }}
        data-testid={`edit-input-${nodeKey}`}
        className="!border-brand max-w-[480px] !border-2"
        style={{ height: 32, borderRadius: 0, fontFamily: 'var(--font-sans)' }}
      />
      <span
        aria-hidden
        data-testid={`edit-hint-${nodeKey}`}
        className="pointer-events-none inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]"
        style={{
          fontFamily: 'var(--font-mono)',
          opacity: hintVisible ? 1 : 0,
          transform: hintVisible ? 'translateY(0)' : 'translateY(-2px)',
          transition: 'opacity 180ms ease, transform 180ms ease',
        }}
      >
        <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-content)] px-[5px] text-[10px] leading-none font-medium text-[var(--color-text-secondary)] shadow-[inset_0_-1px_0_var(--color-border)]">
          ↵
        </kbd>
        <span>提交</span>
        <span className="px-[2px] text-[var(--color-text-quaternary)]">·</span>
        <kbd className="inline-flex h-[18px] items-center justify-center rounded-[3px] border border-[var(--color-border)] bg-[var(--color-bg-content)] px-[5px] text-[10px] leading-none font-medium text-[var(--color-text-secondary)] shadow-[inset_0_-1px_0_var(--color-border)]">
          Esc
        </kbd>
        <span>取消</span>
      </span>
    </div>
  )
}

function LockedBadge(): React.JSX.Element {
  return (
    <span
      role="status"
      data-testid="structure-node-locked-badge"
      className="inline-flex items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-bg-content)] px-2 py-[2px] text-[10px] font-semibold tracking-[0.14em] text-[var(--color-text-tertiary)] uppercase"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <ThunderboltOutlined aria-hidden style={{ fontSize: 11, color: 'var(--color-warning)' }} />
      AI 生成中
    </span>
  )
}

function PendingDeleteActions({
  nodeKey,
  remainingSec,
  onUndo,
}: {
  nodeKey: string
  remainingSec: number
  onUndo: () => void
}): React.JSX.Element {
  return (
    <>
      <span
        role="timer"
        aria-label={`${remainingSec} 秒后删除`}
        data-testid={`structure-node-countdown-${nodeKey}`}
        className="bg-danger inline-flex h-6 min-w-[32px] items-center justify-center px-1 text-[12px] font-bold text-white"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {remainingSec}s
      </span>
      <Tooltip title="撤销删除">
        <Button
          size="small"
          icon={<UndoOutlined />}
          data-testid={`structure-node-undo-${nodeKey}`}
          className="!border-danger !text-danger !bg-[var(--color-bg-content)]"
          style={{ borderRadius: 0 }}
          onClick={(e) => {
            e.stopPropagation()
            onUndo()
          }}
        >
          撤销
        </Button>
      </Tooltip>
    </>
  )
}
