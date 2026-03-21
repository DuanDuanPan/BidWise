import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import App from '@renderer/App'

// Mock window.api for ProjectKanban's useProjects hook
beforeEach(() => {
  vi.stubGlobal('api', {
    projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectCreate: vi.fn(),
    projectGet: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectArchive: vi.fn(),
    analysisGetTender: vi.fn().mockResolvedValue({ success: true, data: null }),
    analysisImportTender: vi.fn().mockResolvedValue({ success: true, data: { taskId: 't1' } }),
    taskGetStatus: vi.fn().mockResolvedValue({ success: true, data: null }),
    taskCancel: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    onTaskProgress: vi.fn().mockReturnValue(() => {}),
  })
})

describe('App component', () => {
  afterEach(() => {
    cleanup()
  })

  it('should render the project kanban', async () => {
    render(<App />)
    expect(screen.getByTestId('project-kanban')).toBeInTheDocument()
  })

  it('should render the create project button', async () => {
    render(<App />)
    expect(screen.getByTestId('create-project-btn')).toBeInTheDocument()
  })
})
