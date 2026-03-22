import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { ProjectWorkspace } from '@modules/project/components/ProjectWorkspace'
import { CommandPaletteProvider } from '@renderer/shared/command-palette/CommandPaletteProvider'
import { commandRegistry } from '@renderer/shared/command-palette'
import { useDocumentStore, useProjectStore } from '@renderer/stores'

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
          <CommandPaletteProvider>
            <Routes>
              <Route path="/project/:id" element={<ProjectWorkspace />} />
            </Routes>
          </CommandPaletteProvider>
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>
  )
}

function WorkspaceLifecycleHarness(): React.JSX.Element {
  const [showWorkspace, setShowWorkspace] = useState(true)

  return (
    <>
      <button data-testid="hide-workspace" onClick={() => setShowWorkspace(false)}>
        Hide workspace
      </button>
      {showWorkspace ? (
        <Routes>
          <Route path="/project/:id" element={<ProjectWorkspace />} />
        </Routes>
      ) : (
        <div data-testid="workspace-hidden" />
      )}
    </>
  )
}

function renderWorkspaceLifecycle(projectId = 'p1'): void {
  render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter initialEntries={[`/project/${projectId}`]}>
          <CommandPaletteProvider>
            <WorkspaceLifecycleHarness />
          </CommandPaletteProvider>
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
    useDocumentStore.setState({
      content: '',
      loading: false,
      error: null,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
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

  it('@p0 restores default stage commands after workspace unmounts', async () => {
    renderWorkspaceLifecycle()
    await screen.findByTestId('project-workspace')

    expect(commandRegistry.getCommand('command-palette:stage-requirements-analysis')).toBeDefined()

    fireEvent.click(screen.getByTestId('hide-workspace'))

    await waitFor(() => {
      expect(screen.getByTestId('workspace-hidden')).toBeInTheDocument()
    })

    expect(commandRegistry.getCommand('command-palette:stage-requirements-analysis')).toBeDefined()
  })
})

describe('@story-1-7 ProjectWorkspace three-column layout', () => {
  let originalInnerWidth: number

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
    // Set standard mode width so three-column layout renders fully
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1600,
    })
    useProjectStore.setState({
      currentProject: null,
      loading: false,
      error: null,
      projects: [],
    })
    useDocumentStore.setState({
      content: '',
      loading: false,
      error: null,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
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
  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    })
  })

  it('@p0 renders three-column layout with all panels', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    expect(screen.getByTestId('workspace-layout')).toBeInTheDocument()
    expect(screen.getByTestId('outline-panel')).toBeInTheDocument()
    expect(screen.getByTestId('annotation-panel')).toBeInTheDocument()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-main')).toBeInTheDocument()
  })

  it('@p0 renders stage guide placeholder inside workspace layout', async () => {
    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockResolvedValue({
        success: true,
        data: { ...mockProject, sopStage: 'proposal-writing' },
      }),
    })
    renderWorkspace()
    const guide = await screen.findByTestId('stage-guide-placeholder')
    expect(guide).toBeInTheDocument()
  })

  it('@p0 renders SOP progress bar and status bar together', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    expect(screen.getByTestId('sop-progress-bar')).toBeInTheDocument()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('@p1 outline panel has complementary role', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    const outline = screen.getByTestId('outline-panel')
    expect(outline).toHaveAttribute('role', 'complementary')
    expect(outline).toHaveAttribute('aria-label', '文档大纲')
  })

  it('@p1 annotation panel has complementary role', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    const annotation = screen.getByTestId('annotation-panel')
    expect(annotation).toHaveAttribute('role', 'complementary')
    expect(annotation).toHaveAttribute('aria-label', '智能批注')
  })

  it('@p1 status bar has status role', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    const statusBar = screen.getByTestId('status-bar')
    expect(statusBar).toHaveAttribute('role', 'status')
    expect(statusBar).toHaveAttribute('aria-label', '项目状态栏')
  })

  it('@p1 status bar shows current SOP stage name', async () => {
    renderWorkspace()
    await screen.findByTestId('project-workspace')
    expect(screen.getByTestId('status-sop-stage')).toHaveTextContent('需求分析')
  })

  it('@p0 shows auto-save retry UI for proposal-writing stage failures', async () => {
    const saveDocument = vi.fn().mockResolvedValue(undefined)
    useDocumentStore.setState({
      autoSave: {
        dirty: true,
        saving: false,
        lastSavedAt: null,
        error: '保存失败',
      },
      saveDocument,
    })

    vi.stubGlobal('api', {
      ...window.api,
      projectGet: vi.fn().mockResolvedValue({
        success: true,
        data: { ...mockProject, sopStage: 'proposal-writing' },
      }),
    })

    renderWorkspace()
    await screen.findByTestId('project-workspace')

    expect(screen.getByTestId('auto-save-status')).toHaveTextContent('保存失败')
    fireEvent.click(screen.getByTestId('auto-save-retry'))
    expect(saveDocument).toHaveBeenCalledWith('p1')
  })
})
