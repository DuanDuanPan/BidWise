import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { HashRouter } from 'react-router-dom'
import { ProjectKanban } from '@modules/project/components/ProjectKanban'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>
        <HashRouter>{children}</HashRouter>
      </AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('api', {
    projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectCreate: vi.fn(),
    projectGet: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectArchive: vi.fn(),
  })
})

describe('ProjectKanban', () => {
  afterEach(() => {
    cleanup()
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
})
