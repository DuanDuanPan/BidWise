import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExportPreviewLoadingOverlay } from '@modules/export/components/ExportPreviewLoadingOverlay'

describe('ExportPreviewLoadingOverlay', () => {
  afterEach(cleanup)
  it('renders loading overlay with progress', () => {
    render(
      <ExportPreviewLoadingOverlay
        progress={50}
        progressMessage="正在生成 docx 预览"
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByTestId('export-preview-loading-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('loading-card')).toBeInTheDocument()
    expect(screen.getByText('正在生成预览')).toBeInTheDocument()
    expect(screen.getByTestId('progress-message')).toHaveTextContent('正在生成 docx 预览')
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
