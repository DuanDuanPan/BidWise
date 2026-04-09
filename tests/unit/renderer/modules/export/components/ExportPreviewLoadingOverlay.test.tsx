import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExportPreviewLoadingOverlay } from '@modules/export/components/ExportPreviewLoadingOverlay'

describe('ExportPreviewLoadingOverlay', () => {
  afterEach(cleanup)
  it('renders masked overlay with centered loading card', () => {
    render(
      <ExportPreviewLoadingOverlay
        progress={50}
        progressMessage="正在生成 docx 预览"
        onCancel={vi.fn()}
      />
    )

    const overlay = screen.getByTestId('export-preview-loading-overlay')
    expect(overlay).toBeInTheDocument()
    // Verify mask: full-area overlay with centered content
    expect(overlay.className).toContain('inset-0')
    expect(overlay.className).toContain('items-center')
    expect(overlay.className).toContain('justify-center')

    expect(screen.getByText('正在生成预览')).toBeInTheDocument()
    expect(screen.getByTestId('progress-message')).toHaveTextContent('正在生成 docx 预览')
    expect(screen.getByText('您可以继续编辑')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<ExportPreviewLoadingOverlay progress={30} progressMessage={null} onCancel={onCancel} />)

    fireEvent.click(screen.getByTestId('cancel-preview-btn'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('hides progress message when null', () => {
    render(<ExportPreviewLoadingOverlay progress={30} progressMessage={null} onCancel={vi.fn()} />)

    expect(screen.queryByTestId('progress-message')).not.toBeInTheDocument()
  })
})
