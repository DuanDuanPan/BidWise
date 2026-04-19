import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockModalConfirm = vi.fn()

vi.mock('antd', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('antd')
  return {
    ...actual,
    App: {
      ...(actual.App as Record<string, unknown>),
      useApp: () => ({
        message: { info: vi.fn() },
        modal: { confirm: mockModalConfirm },
      }),
    },
  }
})

import { StructureTreeView } from '@modules/structure-design/components/StructureTreeView'
import type { StructureTreeNode } from '@modules/structure-design/components/StructureTreeView.types'
import {
  useChapterStructureStore,
  deriveChapterNodeState,
  type ChapterNodeState,
} from '@renderer/stores/chapterStructureStore'

const UUID = {
  A: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  B: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  C: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
}

function persistedSample(): StructureTreeNode[] {
  return [
    { key: UUID.A, title: '项目综述', level: 1, children: [] },
    { key: UUID.B, title: '需求理解', level: 1, isKeyFocus: true, children: [] },
  ]
}

describe('@story-11-9 StructureTreeView', () => {
  beforeEach(() => {
    cleanup()
    useChapterStructureStore.getState().reset()
    mockModalConfirm.mockReset()
  })

  it('renders all nodes + stats + action bar', () => {
    render(
      <StructureTreeView
        nodes={persistedSample()}
        onConfirm={vi.fn()}
        onReselectTemplate={vi.fn()}
        confirmLabel="确认骨架，开始撰写"
      />
    )
    expect(screen.getByTestId('structure-tree-view')).toBeDefined()
    expect(screen.getByTestId('structure-tree-action-bar')).toBeDefined()
    expect(screen.getByTestId('confirm-skeleton-btn').textContent).toContain('确认骨架，开始撰写')
    expect(screen.getByTestId('regenerate-btn')).toBeDefined()
    expect(screen.getByText('2 个章节，1 个重点章节')).toBeDefined()
  })

  it('shows empty placeholder when nodes is empty', () => {
    render(<StructureTreeView nodes={[]} />)
    expect(screen.getByTestId('structure-tree-view-empty')).toBeDefined()
  })

  it('shows loading spinner while loading with no nodes', () => {
    render(<StructureTreeView nodes={[]} loading />)
    expect(screen.getByTestId('structure-tree-view-loading')).toBeDefined()
  })

  it('renders error alert + retry affordance', () => {
    const onRetry = vi.fn()
    render(<StructureTreeView nodes={persistedSample()} error="加载失败" onRetry={onRetry} />)
    expect(screen.getByTestId('structure-tree-view-error')).toBeDefined()
    fireEvent.click(screen.getByTestId('structure-tree-view-retry'))
    expect(onRetry).toHaveBeenCalled()
  })

  it('action bar is hidden when neither onConfirm nor onReselectTemplate provided', () => {
    render(<StructureTreeView nodes={persistedSample()} />)
    expect(screen.queryByTestId('structure-tree-action-bar')).toBeNull()
  })

  it('forwards custom confirmLabel to the primary CTA', () => {
    render(
      <StructureTreeView nodes={persistedSample()} onConfirm={vi.fn()} confirmLabel="继续撰写" />
    )
    expect(screen.getByTestId('confirm-skeleton-btn').textContent).toContain('继续撰写')
  })

  it('showStats=false hides the stats text', () => {
    render(<StructureTreeView nodes={persistedSample()} onConfirm={vi.fn()} showStats={false} />)
    expect(screen.queryByTestId('structure-tree-stats')).toBeNull()
  })

  it('stateOf(focused) renders focus bar + brand outline', () => {
    const stateOf = (key: string): ChapterNodeState => (key === UUID.A ? 'focused' : 'idle')
    render(<StructureTreeView nodes={persistedSample()} stateOf={stateOf} />)
    expect(screen.getByTestId(`tree-node-${UUID.A}-focus-bar`)).toBeDefined()
    expect(screen.getByTestId(`tree-node-${UUID.A}`).getAttribute('data-node-state')).toBe(
      'focused'
    )
  })

  it('pending-delete row gets line-through title + FFF1F0 background (AC7 fix)', () => {
    const stateOf = (key: string): ChapterNodeState => (key === UUID.A ? 'pending-delete' : 'idle')
    useChapterStructureStore
      .getState()
      .markPendingDelete([UUID.A], new Date(Date.now() + 5000).toISOString())
    render(<StructureTreeView nodes={persistedSample()} stateOf={stateOf} />)
    const row = screen.getByTestId(`tree-node-${UUID.A}`)
    expect(row.className).toContain('bg-[#FFF1F0]')
    const title = row.querySelector('.line-through')
    expect(title).not.toBeNull()
  })

  it('phaseByKey decorates idle rows with phase icons', () => {
    const phases = new Map<string, 'generating-text' | 'completed'>([
      [UUID.A, 'generating-text'],
      [UUID.B, 'completed'],
    ])
    render(
      <StructureTreeView nodes={persistedSample()} stateOf={() => 'idle'} phaseByKey={phases} />
    )
    expect(screen.getByTestId('structure-node-phase-running')).toBeDefined()
    expect(screen.getByTestId('structure-node-phase-completed')).toBeDefined()
  })

  it('keyboard Enter routes through onInsertSibling prop (Story 11.9 AC3/AC4)', () => {
    // Public-contract regression: the keymap must respect the host-provided
    // `onInsertSibling` callback, not bypass it to hit the store directly.
    const hostInsertSibling = vi.fn()
    const storeSpy = vi.fn().mockResolvedValue(undefined)
    useChapterStructureStore.setState({
      insertSibling: storeSpy,
      focusedSectionId: UUID.A,
    } as Partial<ReturnType<typeof useChapterStructureStore.getState>>)

    render(
      <StructureTreeView
        nodes={persistedSample()}
        stateOf={(k) => (k === UUID.A ? 'focused' : 'idle')}
        projectId="proj-1"
        onInsertSibling={hostInsertSibling}
      />
    )

    const row = screen.getByTestId(`tree-node-${UUID.A}`)
    row.focus()
    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' })
    expect(hostInsertSibling).toHaveBeenCalledWith(UUID.A)
    expect(storeSpy).not.toHaveBeenCalled()
  })

  it('mounts Story 11.3 keymap internally when projectId is supplied (Story 11.9 AC4)', () => {
    const insertSibling = vi.fn().mockResolvedValue(undefined)
    useChapterStructureStore.setState({
      insertSibling,
      focusedSectionId: UUID.A,
    } as Partial<ReturnType<typeof useChapterStructureStore.getState>>)

    render(
      <StructureTreeView
        nodes={persistedSample()}
        stateOf={(k) => (k === UUID.A ? 'focused' : 'idle')}
        projectId="proj-1"
      />
    )

    const row = screen.getByTestId(`tree-node-${UUID.A}`)
    row.focus()
    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' })
    expect(insertSibling).toHaveBeenCalledWith('proj-1', UUID.A)
  })

  it('onDelete receives full subtree keys (cascade)', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const nested: StructureTreeNode[] = [
      {
        key: UUID.A,
        title: 'A',
        level: 1,
        children: [{ key: UUID.B, title: 'B', level: 2, children: [] }],
      },
    ]
    render(
      <StructureTreeView
        nodes={nested}
        stateOf={(k) => (k === UUID.A ? 'focused' : 'idle')}
        onDelete={onDelete}
      />
    )
    fireEvent.click(screen.getByTestId(`node-actions-${UUID.A}`))
    const del = await screen.findByText('删除')
    fireEvent.click(del)
    expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    const config = mockModalConfirm.mock.calls[0][0]
    await config.onOk()
    expect(onDelete).toHaveBeenCalledWith([UUID.A, UUID.B])
  })

  it('restores row focus after inline editing exits so Tab still routes to indent', async () => {
    const hostIndent = vi.fn()
    useChapterStructureStore.setState({
      focusedSectionId: UUID.A,
      editingSectionId: UUID.A,
    } as Partial<ReturnType<typeof useChapterStructureStore.getState>>)

    render(
      <StructureTreeView
        nodes={persistedSample()}
        stateOf={(key) => deriveChapterNodeState(useChapterStructureStore.getState(), key)}
        projectId="proj-1"
        onIndent={hostIndent}
      />
    )

    const actionBtn = screen.getByTestId(`node-actions-${UUID.A}`) as HTMLButtonElement
    actionBtn.focus()
    expect(document.activeElement).toBe(actionBtn)

    useChapterStructureStore.setState({
      focusedSectionId: UUID.A,
      editingSectionId: null,
    } as Partial<ReturnType<typeof useChapterStructureStore.getState>>)

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId(`tree-node-${UUID.A}`))
    })

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab', code: 'Tab' })
    expect(hostIndent).toHaveBeenCalledWith(UUID.A)
  })
})
