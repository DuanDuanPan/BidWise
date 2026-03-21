import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProjectWorkspace } from '@modules/project/components/ProjectWorkspace'
import { useProjectStore } from '@renderer/stores'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockProject = {
  id: 'p1',
  name: '测试投标项目',
  customerName: '客户A',
  industry: '军工',
  deadline: '2026-04-01T00:00:00.000Z',
  proposalType: 'presale-technical',
  sopStage: 'requirements-analysis',
  status: 'active',
  rootPath: null,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: '2026-03-20T00:00:00.000Z',
}

function renderWorkspace(projectId = 'p1'): void {
  render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter initialEntries={[`/project/${projectId}`]}>
          <Routes>
            <Route path="/project/:id" element={<ProjectWorkspace />} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>
  )
}

describe('@story-1-6 ProjectWorkspace', () => {
  beforeEach(() => {
    // Reset Zustand store to prevent cross-test leakage
    useProjectStore.setState({
      currentProject: null,
      loading: false,
      error: null,
      projects: [],
    })
    vi.stubGlobal('api', {
      projectGet: vi.fn().mockResolvedValue({ success: true, data: mockProject }),
      projectUpdate: vi.fn().mockResolvedValue({ success: true, data: mockProject }),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      projectCreate: vi.fn(),
      projectDelete: vi.fn(),
      projectArchive: vi.fn(),
      analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
      analysisImportTender: vi.fn().mockResolvedValue({ success: true, data: { taskId: 't1' } }),
      onTaskProgress: vi.fn().mockReturnValue(() => {}),
      taskGetStatus: vi.fn().mockResolvedValue({ success: true, data: null }),
      taskCancel: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    })
    mockNavigate.mockClear()
  })
  afterEach(cleanup)

  it('@p0 shows loading spinner initially', () => {
    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockReturnValue(new Promise(() => {})),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
    })
    renderWorkspace()
    expect(screen.getByTestId('workspace-loading')).toBeInTheDocument()
  })

  it('@p0 renders workspace after project loads', async () => {
    renderWorkspace()
    const workspace = await screen.findByTestId('project-workspace')
    expect(workspace).toBeInTheDocument()
  })

  it('@p0 renders SOP progress bar', async () => {
    renderWorkspace()
    const bar = await screen.findByTestId('sop-progress-bar')
    expect(bar).toBeInTheDocument()
  })

  it('@p0 renders AnalysisView for requirements-analysis stage', async () => {
    renderWorkspace()
    const view = await screen.findByTestId('analysis-view')
    expect(view).toBeInTheDocument()
  })

  it('@p1 shows project name in header', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    expect(await screen.findByText('测试投标项目')).toBeInTheDocument()
  })

  it('@p1 renders back-to-kanban button', async () => {
    renderWorkspace()
    const btn = await screen.findByTestId('back-to-kanban')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('@p0 restores the persisted SOP stage from loaded project data', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockResolvedValue({
        success: true,
        data: { ...mockProject, sopStage: 'proposal-writing' },
      }),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
    })
    renderWorkspace()
    const guide = await screen.findByTestId('stage-guide-placeholder')
    expect(guide).toHaveAttribute('data-stage', 'proposal-writing')
    expect(screen.getByTestId('sop-stage-proposal-writing')).toHaveAttribute('aria-current', 'step')
  })

  it('@p0 shows error state when project load fails', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'NOT_FOUND', message: '项目不存在' },
      }),
      projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
    })
    renderWorkspace()
    const errorView = await screen.findByTestId('workspace-error')
    expect(errorView).toBeInTheDocument()
  })
})
