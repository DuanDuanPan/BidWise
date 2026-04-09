import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { ExportPreviewModal } from '@modules/export/components/ExportPreviewModal'
import { renderAsync } from 'docx-preview'

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn().mockResolvedValue(undefined),
}))

const mockedRenderAsync = vi.mocked(renderAsync)

describe('ExportPreviewModal', () => {
  afterEach(cleanup)

  const defaultProps = {
    open: true,
    docxBase64: null,
    fileName: '.preview-123.docx',
    error: null,
    onClose: vi.fn(),
    onConfirmExport: vi.fn(),
    onRetry: vi.fn(),
  }

  it('renders modal with back-to-edit button', () => {
    render(<ExportPreviewModal {...defaultProps} docxBase64="AAAA" />)

    expect(screen.getByTestId('back-to-edit-btn')).toBeInTheDocument()
    expect(screen.getByText('返回编辑')).toBeInTheDocument()
  })

  it('shows confirm export button when content is available', () => {
    render(<ExportPreviewModal {...defaultProps} docxBase64="AAAA" />)

    expect(screen.getByTestId('confirm-export-btn')).toBeInTheDocument()
    expect(screen.getByText('确认导出')).toBeInTheDocument()
  })

  it('shows error alert and retry button on error', () => {
    render(<ExportPreviewModal {...defaultProps} error="渲染引擎未就绪，请稍后重试" />)

    expect(screen.getByTestId('preview-error-alert')).toBeInTheDocument()
    expect(screen.getByTestId('retry-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('confirm-export-btn')).not.toBeInTheDocument()
  })

  it('calls onClose when back-to-edit clicked', () => {
    const onClose = vi.fn()
    render(<ExportPreviewModal {...defaultProps} docxBase64="AAAA" onClose={onClose} />)

    fireEvent.click(screen.getByTestId('back-to-edit-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onConfirmExport when confirm clicked', () => {
    const onConfirmExport = vi.fn()
    render(
      <ExportPreviewModal {...defaultProps} docxBase64="AAAA" onConfirmExport={onConfirmExport} />
    )

    fireEvent.click(screen.getByTestId('confirm-export-btn'))
    expect(onConfirmExport).toHaveBeenCalledOnce()
  })

  it('calls onRetry when retry clicked', () => {
    const onRetry = vi.fn()
    render(<ExportPreviewModal {...defaultProps} error="渲染失败" onRetry={onRetry} />)

    fireEvent.click(screen.getByTestId('retry-btn'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders preview toolbar when content available', () => {
    render(<ExportPreviewModal {...defaultProps} docxBase64="AAAA" />)

    expect(screen.getByTestId('preview-toolbar')).toBeInTheDocument()
  })

  it('shows error state when docx-preview renderAsync rejects', async () => {
    mockedRenderAsync.mockRejectedValueOnce(new Error('Render engine failed'))

    render(<ExportPreviewModal {...defaultProps} docxBase64="AAAA" />)

    await waitFor(() => {
      expect(screen.getByTestId('preview-error-alert')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('confirm-export-btn')).not.toBeInTheDocument()
    expect(screen.getByTestId('retry-btn')).toBeInTheDocument()
  })
})
