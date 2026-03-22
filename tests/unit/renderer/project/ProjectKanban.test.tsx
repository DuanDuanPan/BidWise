import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { HashRouter } from 'react-router-dom'
import { ProjectKanban } from '@modules/project/components/ProjectKanban'
import { CommandPaletteProvider } from '@renderer/shared/command-palette/CommandPaletteProvider'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>
        <HashRouter>
          <CommandPaletteProvider>{children}</CommandPaletteProvider>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, writable: true })
  window.sessionStorage.clear()
  vi.stubGlobal('api', {
    projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectListWithPriority: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectCreate: vi.fn(),
    projectGet: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectArchive: vi.fn(),
  })
})

describe('ProjectKanban @story-1-8', () => {
  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
  })

  it('should render the kanban container', () => {
    render(<ProjectKanban />, { wrapper: Wrapper })
    expect(screen.getByTestId('project-kanban')).toBeInTheDocument()
  })

  it('should render the create project button', () => {
    render(<ProjectKanban />, { wrapper: Wrapper })
    expect(screen.getByTestId('create-project-btn')).toBeInTheDocument()
  })

  it('should show empty state when no projects', async () => {
    render(<ProjectKanban />, { wrapper: Wrapper })
    // Wait for loadProjects to complete
    const emptyState = await screen.findByTestId('project-empty-state')
    expect(emptyState).toBeInTheDocument()
  })

  it('should render smart todo panel', () => {
    render(<ProjectKanban />, { wrapper: Wrapper })
    expect(screen.getByTestId('todo-panel')).toBeInTheDocument()
  })

  it('should render project cards when projects exist', async () => {
    vi.stubGlobal('api', {
      projectList: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            id: 'p1',
            name: '测试项目',
            customerName: '客户A',
            industry: '军工',
            deadline: '2026-04-01T00:00:00.000Z',
            sopStage: 'not-started',
            status: 'active',
            updatedAt: '2026-03-20T00:00:00.000Z',
          },
        ],
      }),
      projectListWithPriority: vi.fn().mockResolvedValue({ success: true, data: [] }),
      projectCreate: vi.fn(),
      projectGet: vi.fn(),
      projectUpdate: vi.fn(),
      projectDelete: vi.fn(),
      projectArchive: vi.fn(),
    })
    render(<ProjectKanban />, { wrapper: Wrapper })
    const card = await screen.findByTestId('project-card-p1')
    expect(card).toBeInTheDocument()
    expect(screen.getByText('测试项目')).toBeInTheDocument()
  })

  it('should restore the collapsed todo panel state after remount', () => {
    const firstRender = render(<ProjectKanban />, { wrapper: Wrapper })

    fireEvent.click(screen.getByTestId('todo-panel-toggle'))
    expect(screen.getByTestId('todo-panel').style.width).toBe('0px')

    firstRender.unmount()

    render(<ProjectKanban />, { wrapper: Wrapper })
    expect(screen.getByTestId('todo-panel').style.width).toBe('0px')
  })
})
