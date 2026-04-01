import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RegenerateDialog } from '@modules/editor/components/RegenerateDialog'

describe('@story-3-4 RegenerateDialog', () => {
  afterEach(cleanup)

  const defaultProps = {
    open: true,
    chapterTitle: '系统架构设计',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  }

  it('@p0 renders modal with chapter title', () => {
    render(<RegenerateDialog {...defaultProps} />)
    expect(screen.getByText('重新生成: 系统架构设计')).toBeInTheDocument()
  })

  it('@p0 renders context input textarea', () => {
    render(<RegenerateDialog {...defaultProps} />)
    expect(screen.getByTestId('regenerate-context-input')).toBeInTheDocument()
  })

  it('@p0 calls onConfirm with trimmed context when confirmed', () => {
    render(<RegenerateDialog {...defaultProps} />)
    const textarea = screen.getByTestId('regenerate-context-input')
    fireEvent.change(textarea, { target: { value: '  重点突出安全性  ' } })
    fireEvent.click(screen.getByText('重新生成'))
    expect(defaultProps.onConfirm).toHaveBeenCalledWith('重点突出安全性')
  })

  it('@p0 calls onCancel when cancel button clicked', () => {
    render(<RegenerateDialog {...defaultProps} />)
    // Ant Design Modal renders cancel button with class ant-btn-default
    const cancelBtn = document.querySelector('.ant-modal .ant-btn-default') as HTMLElement
    expect(cancelBtn).toBeTruthy()
    fireEvent.click(cancelBtn)
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1)
  })

  it('@p1 renders nothing when open is false', () => {
    const { container } = render(<RegenerateDialog {...defaultProps} open={false} />)
    expect(container.querySelector('.ant-modal')).toBeNull()
  })

  it('@p1 shows overwrite warning text', () => {
    render(<RegenerateDialog {...defaultProps} />)
    expect(screen.getByText(/当前章节内容将被/)).toBeInTheDocument()
  })
})
