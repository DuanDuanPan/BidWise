import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Input, Button, Tooltip, type InputRef } from 'antd'
import {
  PlusOutlined,
  MoreOutlined,
  LockOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  UndoOutlined,
  EnterOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { StructureNode } from '../hooks/useStructureOutline'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import {
  useChapterStructureStore,
  type ChapterNodeState,
  type PendingDeleteEntry,
} from '@renderer/stores/chapterStructureStore'
import { useChapterNodeState } from '../hooks/useChapterNodeState'

/**
 * Visual palette: 1:1 to prototype.pen (frame `zHAzA` rows + frame `0V4bl`
 * confirm-skeleton canvas). Colors / sizes come from design_tokens_contract
 * in `11-2-focus-state-machine-ux/prototype.manifest.yaml`.
 */
export interface StructureCanvasNodeProps {
  node: StructureNode
  onCommitTitle: (nodeKey: string, title: string) => void | Promise<void>
  onAddChild?: (nodeKey: string) => void
  onOpenMoreMenu?: (nodeKey: string, anchor: HTMLElement) => void
  onUndoPendingDelete?: (nodeKey: string) => void
  /**
   * Chapter generation phase for the idle-state decorator (AC5). Producers:
   * Story 11.8 streaming recommend (`locked` runtime), chapter-generation
   * status in proposal-writing stage. Undefined = no decoration.
   */
  generationPhase?: ChapterGenerationPhase
  /** Override the state (used by visual gallery tests). Production passes undefined. */
  stateOverride?: ChapterNodeState
}

function subscribeToTick(callback: () => void): () => void {
  const timer = window.setInterval(callback, 250)
  return () => window.clearInterval(timer)
}

function useCountdownSeconds(pendingDelete: PendingDeleteEntry | null): number | null {
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

export function StructureCanvasNode({
  node,
  onCommitTitle,
  onAddChild,
  onOpenMoreMenu,
  onUndoPendingDelete,
  generationPhase,
  stateOverride,
}: StructureCanvasNodeProps): React.JSX.Element {
  const snapshot = useChapterNodeState(node.sectionId)
  const state = stateOverride ?? snapshot.state
  const pendingDelete = snapshot.pendingDelete
  const remaining = useCountdownSeconds(pendingDelete)

  const focusSection = useChapterStructureStore((s) => s.focusSection)
  const enterEditing = useChapterStructureStore((s) => s.enterEditing)
  const exitEditing = useChapterStructureStore((s) => s.exitEditing)

  const handleClick = (): void => {
    if (state === 'locked' || state === 'pending-delete') return
    focusSection(node.sectionId)
  }

  const handleDoubleClick = (): void => {
    if (state === 'locked' || state === 'pending-delete') return
    enterEditing(node.sectionId)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (state === 'locked' || state === 'pending-delete') return
    if (e.key === 'F2' && state !== 'editing') {
      e.preventDefault()
      enterEditing(node.sectionId)
    }
  }

  const commit = (nextTitle: string): void => {
    const trimmed = nextTitle.trim()
    if (trimmed && trimmed !== node.title) {
      onCommitTitle(node.sectionId, trimmed)
    }
    exitEditing()
  }

  const cancel = (): void => {
    exitEditing()
  }

  const indentPx = (node.level - 1) * 20

  return (
    <div
      role="treeitem"
      tabIndex={state === 'locked' || state === 'pending-delete' ? -1 : 0}
      aria-selected={state === 'focused' || state === 'editing'}
      aria-disabled={state === 'locked' || state === 'pending-delete' ? true : undefined}
      data-testid={`structure-node-${node.nodeKey}`}
      data-node-state={state}
      data-node-level={node.level}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      className={nodeWrapperClassName(state)}
      style={{ paddingLeft: 24 + indentPx, paddingRight: 24 }}
    >
      {state === 'focused' && (
        <div
          aria-hidden
          data-testid={`structure-node-${node.nodeKey}-focus-bar`}
          className="bg-brand pointer-events-none absolute inset-y-0 left-0 w-[3px]"
        />
      )}

      {state === 'editing' ? (
        <EditingRow initialTitle={node.title} onCommit={commit} onCancel={cancel} />
      ) : (
        <>
          <LeadingIcon state={state} />
          <span className={titleClassName(state)}>{node.title}</span>
          {state === 'idle' && <PhaseDecorator phase={generationPhase} />}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {state === 'focused' && (
          <FocusedActions
            onAddChild={() => onAddChild?.(node.nodeKey)}
            onMore={(anchor) => onOpenMoreMenu?.(node.nodeKey, anchor)}
          />
        )}
        {state === 'locked' && <LockedBadge />}
        {state === 'pending-delete' && (
          <PendingDeleteActions
            remainingSec={remaining ?? 0}
            onUndo={() => onUndoPendingDelete?.(node.nodeKey)}
          />
        )}
      </div>
    </div>
  )
}

function nodeWrapperClassName(state: ChapterNodeState): string {
  const base =
    'group relative flex h-14 w-full items-center gap-3 border-b border-[var(--color-border)] transition-[background-color,box-shadow,border-color] duration-[var(--duration-micro)] ease-out cursor-pointer select-none motion-reduce:transition-none'
  switch (state) {
    case 'focused':
      return `${base} bg-brand-light border-brand shadow-[inset_0_0_0_2px_var(--color-brand)]`
    case 'editing':
      return `${base} bg-bg-content`
    case 'locked':
      return `${base} bg-bg-sidebar cursor-not-allowed`
    case 'pending-delete':
      return `${base} cursor-not-allowed`
    case 'idle':
    default:
      return `${base} bg-transparent hover:bg-bg-hover/40`
  }
}

function titleClassName(state: ChapterNodeState): string {
  const base = 'truncate text-[15px]'
  switch (state) {
    case 'focused':
      return `${base} text-brand font-semibold`
    case 'locked':
      return `${base} text-text-tertiary font-medium`
    case 'pending-delete':
      return `${base} text-danger font-medium`
    default:
      return `${base} text-text-primary font-medium`
  }
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

function FocusedActions({
  onAddChild,
  onMore,
}: {
  onAddChild: () => void
  onMore: (anchor: HTMLElement) => void
}): React.JSX.Element {
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        size="small"
        icon={<PlusOutlined />}
        data-testid="structure-node-add-child"
        className="!border-brand !text-brand !bg-[var(--color-bg-content)]"
        onClick={(e) => {
          e.stopPropagation()
          onAddChild()
        }}
      >
        子节点
      </Button>
      <button
        ref={moreBtnRef}
        type="button"
        aria-label="更多操作"
        data-testid="structure-node-more"
        className="bg-bg-content hover:border-brand flex h-7 w-7 items-center justify-center rounded border border-[#C6D5FE] text-[var(--color-text-tertiary)]"
        onClick={(e) => {
          e.stopPropagation()
          if (moreBtnRef.current) onMore(moreBtnRef.current)
        }}
      >
        <MoreOutlined />
      </button>
    </>
  )
}

function EditingRow({
  initialTitle,
  onCommit,
  onCancel,
}: {
  initialTitle: string
  onCommit: (nextTitle: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(initialTitle)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    inputRef.current?.focus({ cursor: 'end' })
  }, [])

  return (
    <div className="flex w-full items-center gap-3" onClick={(e) => e.stopPropagation()}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onPressEnter={() => onCommit(value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        data-testid="structure-node-inline-input"
        className="!border-brand max-w-[480px] !border-2"
        style={{ height: 40, borderRadius: 4 }}
      />
      <span
        aria-hidden
        className="bg-brand-light text-brand inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium"
      >
        <EnterOutlined style={{ fontSize: 12 }} />
        Enter 提交 · Esc 取消
      </span>
    </div>
  )
}

function LockedBadge(): React.JSX.Element {
  return (
    <span
      role="status"
      data-testid="structure-node-locked-badge"
      className="text-text-tertiary inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-content)] px-2.5 py-1 text-[11px] font-medium"
    >
      <ThunderboltOutlined aria-hidden style={{ fontSize: 12, color: 'var(--color-warning)' }} />
      AI 生成中…
    </span>
  )
}

function PendingDeleteActions({
  remainingSec,
  onUndo,
}: {
  remainingSec: number
  onUndo: () => void
}): React.JSX.Element {
  return (
    <>
      <span
        role="timer"
        aria-label={`${remainingSec} 秒后删除`}
        data-testid="structure-node-countdown"
        className="bg-danger inline-flex h-6 min-w-[32px] items-center justify-center rounded px-1 text-[13px] font-bold text-white"
      >
        {remainingSec}s
      </span>
      <Tooltip title="撤销删除">
        <Button
          size="small"
          icon={<UndoOutlined />}
          data-testid="structure-node-undo"
          className="!border-danger !text-danger !bg-[var(--color-bg-content)]"
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
