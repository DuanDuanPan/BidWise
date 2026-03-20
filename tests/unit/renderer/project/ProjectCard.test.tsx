import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { ProjectCard } from '@modules/project/components/ProjectCard'
import type { ProjectListItem } from '@shared/ipc-types'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

const mockProject: ProjectListItem = {
  id: 'card-1',
  name: '某研究院装备管理平台',
  customerName: '某研究院',
  industry: '军工',
  deadline: '2026-04-01T00:00:00.000Z',
  sopStage: 'requirements-analysis',
  status: 'active',
  updatedAt: new Date().toISOString(),
}

describe('ProjectCard', () => {
  afterEach(() => {
    cleanup()
  })

  const defaultProps = {
    project: mockProject,
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    onClick: vi.fn(),
  }

  it('should render project name', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('某研究院装备管理平台')).toBeInTheDocument()
  })

  it('should render customer name', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('某研究院')).toBeInTheDocument()
  })

  it('should render SOP stage', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('阶段1：需求分析')).toBeInTheDocument()
  })

  it('should render proposal type subtitle', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('售前技术方案')).toBeInTheDocument()
  })

  it('should render compliance placeholder', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    expect(screen.getByText('合规状态')).toBeInTheDocument()
  })

  it('should show -- for missing customer', () => {
    render(<ProjectCard {...defaultProps} project={{ ...mockProject, customerName: null }} />, {
      wrapper: Wrapper,
    })
    const dashes = screen.getAllByText('--')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('should call onClick when card is clicked', () => {
    render(<ProjectCard {...defaultProps} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByTestId('project-card-card-1'))
    expect(defaultProps.onClick).toHaveBeenCalledWith('card-1')
  })
})
