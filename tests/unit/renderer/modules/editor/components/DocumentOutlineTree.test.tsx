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
})
