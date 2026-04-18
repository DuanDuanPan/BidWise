import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DocumentOutlineTree } from '@modules/editor/components/DocumentOutlineTree'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

function makeNode(overrides: Partial<OutlineNode> = {}): OutlineNode {
  return {
    key: 'heading-0',
    title: 'Test Heading',
    level: 1,
    lineIndex: 0,
    occurrenceIndex: 0,
    children: [],
    ...overrides,
  }
}

describe('@story-3-2 DocumentOutlineTree', () => {
  afterEach(cleanup)

  it('@p0 renders empty state when outline is empty', () => {
    render(<DocumentOutlineTree outline={[]} onNodeClick={vi.fn()} />)
    expect(screen.getByTestId('outline-empty')).toBeInTheDocument()
    expect(screen.getByText('开始撰写后，文档大纲将自动生成')).toBeInTheDocument()
  })

  it('@p0 renders tree nodes for non-empty outline', () => {
    const outline: OutlineNode[] = [
      makeNode({ key: 'heading-0', title: 'Introduction' }),
      makeNode({ key: 'heading-1', title: 'Conclusion', level: 2 }),
    ]
    render(<DocumentOutlineTree outline={outline} onNodeClick={vi.fn()} />)
    expect(screen.getByTestId('outline-tree')).toBeInTheDocument()
    expect(screen.getByText('Introduction')).toBeInTheDocument()
    expect(screen.getByText('Conclusion')).toBeInTheDocument()
  })

  it('@p0 calls onNodeClick exactly once when a node is clicked', () => {
    const onClick = vi.fn()
    const node = makeNode({ key: 'heading-0', title: 'Click Me' })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={onClick} />)
    fireEvent.click(screen.getByText('Click Me'))
    expect(onClick).toHaveBeenCalledWith(node)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('@p1 truncates titles longer than 30 characters', () => {
    const longTitle = 'A'.repeat(35)
    const node = makeNode({ title: longTitle })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    expect(screen.getByText('A'.repeat(30) + '…')).toBeInTheDocument()
  })

  it('@p1 has aria-label on tree container', () => {
    const node = makeNode()
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    expect(screen.getByTestId('outline-tree')).toHaveAttribute('aria-label', '文档大纲树')
  })

  it('@p1 prevents default on mouseDown to preserve editor focus', () => {
    const node = makeNode({ title: 'Focus Test' })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    const titleSpan = screen.getByText('Focus Test')
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const prevented = !titleSpan.dispatchEvent(event)
    expect(prevented).toBe(true)
  })

  it('@p0 renders per-node aria-label with level and title', () => {
    const node = makeNode({ key: 'heading-0', title: '系统架构设计', level: 2 })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan).toHaveAttribute('aria-label', '2级标题 系统架构设计')
  })

  it('@p0 renders tree with showLine connector lines', () => {
    const node = makeNode()
    const onClick = vi.fn()
    const { container } = render(<DocumentOutlineTree outline={[node]} onNodeClick={onClick} />)
    // Ant Design Tree with showLine adds ant-tree-show-line class
    const tree = container.querySelector('.ant-tree-show-line')
    expect(tree).toBeInTheDocument()
  })

  it('@p0 maintains selectedKeys when a node is clicked', () => {
    const node = makeNode({ key: 'heading-0', title: 'Select Me' })
    const onClick = vi.fn()
    const { container } = render(<DocumentOutlineTree outline={[node]} onNodeClick={onClick} />)
    fireEvent.click(screen.getByText('Select Me'))
    // Ant Design Tree marks selected nodes with ant-tree-treenode-selected
    const selected = container.querySelector('.ant-tree-treenode-selected')
    expect(selected).toBeInTheDocument()
  })

  it('@story-3-4 @p0 renders status icon for generating-text phase', () => {
    const node = makeNode({ key: 'heading-0', title: 'AI Chapter', level: 2, occurrenceIndex: 0 })
    const chapterPhases = new Map([['2:AI Chapter:0', 'generating-text' as const]])
    render(
      <DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} chapterPhases={chapterPhases} />
    )
    // LoadingOutlined renders an SVG with the anticon-loading class
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan.querySelector('.anticon-loading')).toBeInTheDocument()
  })

  it('@story-3-4 @p0 renders status icon for queued phase', () => {
    const node = makeNode({
      key: 'heading-0',
      title: 'Queued Chapter',
      level: 2,
      occurrenceIndex: 0,
    })
    const chapterPhases = new Map([['2:Queued Chapter:0', 'queued' as const]])
    render(
      <DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} chapterPhases={chapterPhases} />
    )
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan.querySelector('.anticon-clock-circle')).toBeInTheDocument()
  })

  it('@story-3-4 @p1 renders green check for completed phase', () => {
    const node = makeNode({ key: 'heading-0', title: 'Done', level: 2, occurrenceIndex: 0 })
    const chapterPhases = new Map([['2:Done:0', 'completed' as const]])
    render(
      <DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} chapterPhases={chapterPhases} />
    )
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan.querySelector('.anticon-check-circle')).toBeInTheDocument()
  })

  it('@story-3-4 @p1 renders warning icon for failed phase', () => {
    const node = makeNode({ key: 'heading-0', title: 'Failed', level: 2, occurrenceIndex: 0 })
    const chapterPhases = new Map([['2:Failed:0', 'failed' as const]])
    render(
      <DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} chapterPhases={chapterPhases} />
    )
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan.querySelector('.anticon-warning')).toBeInTheDocument()
  })

  it('@story-3-4 @p1 does not render status icon when no chapterPhases provided', () => {
    const node = makeNode({ key: 'heading-0', title: 'Normal', level: 2, occurrenceIndex: 0 })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    const titleSpan = screen.getByTestId('outline-node-heading-0')
    expect(titleSpan.querySelector('.anticon-loading')).not.toBeInTheDocument()
    expect(titleSpan.querySelector('.anticon-clock-circle')).not.toBeInTheDocument()
    expect(titleSpan.querySelector('.anticon-check-circle')).not.toBeInTheDocument()
    expect(titleSpan.querySelector('.anticon-warning')).not.toBeInTheDocument()
  })

  it('@story-3-2 @p0 keeps nodes expanded when outline updates from empty to populated', () => {
    const node = makeNode({
      key: 'heading-0',
      title: 'Parent',
      children: [makeNode({ key: 'heading-1', title: 'Child', level: 2 })],
    })
    const { rerender, container } = render(
      <DocumentOutlineTree outline={[]} onNodeClick={vi.fn()} />
    )

    rerender(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)

    expect(container.querySelector('.ant-tree-switcher_open')).toBeInTheDocument()
    expect(screen.getByText('Child')).toBeInTheDocument()
  })

  it('@story-11-3 @p0 root has tabIndex=0 + brand focus outline when structureKeymap is enabled', () => {
    const node = makeNode({ key: 'heading-0', title: '焦点根' })
    render(
      <DocumentOutlineTree
        outline={[node]}
        onNodeClick={vi.fn()}
        structureKeymap={{
          projectId: 'p',
          sectionIdByNodeKey: { 'heading-0': 'sid-0' },
        }}
      />
    )
    const root = screen.getByTestId('outline-tree')
    expect(root).toHaveAttribute('tabIndex', '0')
    expect(root.className).toMatch(/outline/)
  })

  it('@story-11-3 @p0 root is non-focusable when structureKeymap is disabled', () => {
    const node = makeNode({ key: 'heading-0', title: '只读' })
    render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)
    const root = screen.getByTestId('outline-tree')
    expect(root).toHaveAttribute('tabIndex', '-1')
  })

  it('@story-11-3 @p1 click selects + drives chapterStructureStore.focusNode', async () => {
    const { useChapterStructureStore } = await import('@renderer/stores/chapterStructureStore')
    useChapterStructureStore.setState({
      focusedNodeKey: null,
      editingNodeKey: null,
      lockedNodeKeys: {},
      pendingDeleteByNodeKey: {},
      sectionIdByNodeKey: {},
    })
    const node = makeNode({ key: 'heading-0', title: '点击我' })
    render(
      <DocumentOutlineTree
        outline={[node]}
        onNodeClick={vi.fn()}
        structureKeymap={{
          projectId: 'p',
          sectionIdByNodeKey: { 'heading-0': 'sid-0' },
        }}
      />
    )
    fireEvent.click(screen.getByText('点击我'))
    expect(useChapterStructureStore.getState().focusedNodeKey).toBe('heading-0')
  })

  it('@story-3-2 @p0 allows collapsing nested outline nodes from the tree switcher', () => {
    const node = makeNode({
      key: 'heading-0',
      title: 'Parent',
      children: [makeNode({ key: 'heading-1', title: 'Child', level: 2 })],
    })
    const { container } = render(<DocumentOutlineTree outline={[node]} onNodeClick={vi.fn()} />)

    const switcher = container.querySelector('.ant-tree-switcher') as HTMLElement | null
    expect(switcher).toBeInTheDocument()

    fireEvent.click(switcher!)

    expect(screen.queryByText('Child')).not.toBeInTheDocument()
    expect(container.querySelector('.ant-tree-switcher_close')).toBeInTheDocument()
  })
})
