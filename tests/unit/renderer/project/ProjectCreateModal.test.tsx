import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { ProjectCreateModal } from '@modules/project/components/ProjectCreateModal'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('api', {
    projectList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectCreate: vi.fn().mockResolvedValue({
      success: true,
      data: { id: 'new-1', name: '新项目' },
    }),
    projectGet: vi.fn(),
    projectUpdate: vi.fn(),
    projectDelete: vi.fn(),
    projectArchive: vi.fn(),
  })
})

describe('ProjectCreateModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('should show form when open', () => {
    render(<ProjectCreateModal open={true} onClose={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText('新建投标项目')).toBeInTheDocument()
  })

  it('should not render form content when closed', () => {
    render(<ProjectCreateModal open={false} onClose={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.queryByText('新建投标项目')).not.toBeInTheDocument()
  })

  it('should show proposal type as disabled', () => {
    render(<ProjectCreateModal open={true} onClose={vi.fn()} />, { wrapper: Wrapper })
    const proposalInput = screen.getByTestId('input-proposal-type')
    expect(proposalInput).toBeDisabled()
  })

  it('should validate required name field', async () => {
    render(<ProjectCreateModal open={true} onClose={vi.fn()} />, { wrapper: Wrapper })
    // Click submit without filling name
    fireEvent.click(screen.getByText('创建项目'))
    await waitFor(() => {
      expect(screen.getByText('请输入投标项目名称')).toBeInTheDocument()
    })
  })

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<ProjectCreateModal open={true} onClose={onClose} />, { wrapper: Wrapper })
    // Click the X close button on the modal
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })
})
