import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { ConfigProvider, App as AntApp } from 'antd'
import { HashRouter } from 'react-router-dom'
import { SmartTodoPanel } from '@modules/project/components/SmartTodoPanel'
import { useTodoStore } from '@renderer/stores/todoStore'
import type { ProjectWithPriority } from '@shared/ipc-types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>
        <HashRouter>{children}</HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}

function CompactPanelHarness(): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <SmartTodoPanel
      {...defaultProps}
      collapsed={collapsed}
      isCompact
      onToggle={() => setCollapsed((prev) => !prev)}
    />
  )
}

const mockItems: ProjectWithPriority[] = [
  {
    id: 'p1',
    name: 'A标项目',
    customerName: '客户A',
    industry: '军工',
    deadline: '2026-03-22T00:00:00.000Z',
    sopStage: 'delivery',
    status: 'active',
    updatedAt: '2026-03-20T00:00:00.000Z',
    priorityScore: 97,
    nextAction: '导出交付物',
  },
  {
    id: 'p2',
    name: 'B标项目',
    customerName: '客户B',
    industry: '能源',
    deadline: null,
    sopStage: 'requirements-analysis',
    status: 'active',
    updatedAt: '2026-03-19T00:00:00.000Z',
    priorityScore: 8,
    nextAction: '完成招标文件解析',
  },
]

const defaultProps = {
  collapsed: false,
  isCompact: false,
  onToggle: vi.fn(),
  onCreateProject: vi.fn(),
}

describe('SmartTodoPanel', () => {
  beforeEach(() => {
    useTodoStore.setState({ todoItems: mockItems, loading: false, error: null })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders the panel with title and badge', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('智能待办')).toBeInTheDocument()
    expect(screen.getByTestId('todo-panel')).toBeInTheDocument()
  })

  it('renders todo items list', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('A标项目')).toBeInTheDocument()
    expect(screen.getByText('B标项目')).toBeInTheDocument()
  })

  it('renders empty state when no items', () => {
    useTodoStore.setState({ todoItems: [] })
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('暂无待办事项')).toBeInTheDocument()
    expect(screen.getByText('创建第一个投标项目开始')).toBeInTheDocument()
  })

  it('calls onCreateProject from empty state button', () => {
    useTodoStore.setState({ todoItems: [] })
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByText('新建项目'))
    expect(defaultProps.onCreateProject).toHaveBeenCalled()
  })

  it('navigates when clicking a todo item', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByTestId('todo-item-p1'))
    expect(mockNavigate).toHaveBeenCalledWith('/project/p1')
  })

  it('navigates on Enter key', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    fireEvent.keyDown(screen.getByTestId('todo-item-p1'), { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/project/p1')
  })

  it('calls onToggle when toggle button is clicked', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByTestId('todo-panel-toggle'))
    expect(defaultProps.onToggle).toHaveBeenCalled()
  })

  it('renders collapsed state with icon strip and toggle', () => {
    render(<SmartTodoPanel {...defaultProps} collapsed />, { wrapper: Wrapper })
    const panel = screen.getByTestId('todo-panel')
    expect(panel.style.width).toBe('0px')
    // Toggle button still accessible when collapsed
    expect(screen.getByTestId('todo-panel-toggle')).toBeInTheDocument()
  })

  it('displays "未设定" for items without deadline', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('未设定')).toBeInTheDocument()
  })

  it('has correct ARIA attributes on panel', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    const panel = screen.getByTestId('todo-panel')
    expect(panel).toHaveAttribute('role', 'complementary')
    expect(panel).toHaveAttribute('aria-label', '智能待办')
  })

  it('toggle button has aria-expanded attribute', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    const toggle = screen.getByTestId('todo-panel-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('todo list has role="list"', () => {
    render(<SmartTodoPanel {...defaultProps} />, { wrapper: Wrapper })
    const list = screen.getByRole('list', { name: '待办列表' })
    expect(list).toBeInTheDocument()
  })

  it('shows compact mode icon bar', () => {
    render(<SmartTodoPanel {...defaultProps} isCompact collapsed />, { wrapper: Wrapper })
    expect(screen.getByTestId('todo-panel-icon-bar')).toBeInTheDocument()
  })

  it('shows flyout in compact mode when expanded', () => {
    render(<SmartTodoPanel {...defaultProps} isCompact collapsed={false} />, { wrapper: Wrapper })
    expect(screen.getByTestId('todo-panel-flyout')).toBeInTheDocument()
    expect(screen.getByTestId('todo-panel-flyout')).toHaveAttribute('role', 'dialog')
  })

  it('returns focus to the compact trigger after Escape closes the flyout', () => {
    render(<CompactPanelHarness />, { wrapper: Wrapper })

    const compactTrigger = screen.getByTestId('todo-panel-icon-trigger')
    expect(screen.getByTestId('todo-panel-flyout')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByTestId('todo-panel-flyout')).not.toBeInTheDocument()
    expect(compactTrigger).toHaveFocus()
  })
})
