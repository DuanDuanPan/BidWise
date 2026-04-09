import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PreviewToolbar } from '@modules/export/components/PreviewToolbar'

describe('PreviewToolbar', () => {
  afterEach(cleanup)
  it('renders toolbar with file name and title', () => {
    render(<PreviewToolbar fileName=".preview-123.docx" onZoomChange={vi.fn()} />)

    expect(screen.getByTestId('preview-toolbar')).toBeInTheDocument()
    expect(screen.getByText('方案预览')).toBeInTheDocument()
    expect(screen.getByTestId('file-name-tag')).toHaveTextContent('.preview-123.docx')
  })

  it('shows page count when provided', () => {
    render(<PreviewToolbar fileName="test.docx" pageCount={10} onZoomChange={vi.fn()} />)

    expect(screen.getByTestId('page-count')).toHaveTextContent('共 10 页')
  })

  it('hides page count when not provided', () => {
    render(<PreviewToolbar fileName="test.docx" onZoomChange={vi.fn()} />)

    expect(screen.queryByTestId('page-count')).not.toBeInTheDocument()
  })

  it('zoom in increases zoom level', () => {
    const onZoomChange = vi.fn()
    render(<PreviewToolbar fileName="test.docx" onZoomChange={onZoomChange} />)

    // Initial zoom is 100%
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%')

    fireEvent.click(screen.getByTestId('zoom-in-btn'))
    expect(onZoomChange).toHaveBeenCalledWith(1.25)
  })

  it('zoom out decreases zoom level', () => {
    const onZoomChange = vi.fn()
    render(<PreviewToolbar fileName="test.docx" onZoomChange={onZoomChange} />)

    fireEvent.click(screen.getByTestId('zoom-out-btn'))
    expect(onZoomChange).toHaveBeenCalledWith(0.75)
  })

  it('fit page resets zoom to 100%', () => {
    const onZoomChange = vi.fn()
    render(<PreviewToolbar fileName="test.docx" onZoomChange={onZoomChange} />)

    // Zoom in first
    fireEvent.click(screen.getByTestId('zoom-in-btn'))
    onZoomChange.mockClear()

    // Fit page
    fireEvent.click(screen.getByTestId('fit-page-btn'))
    expect(onZoomChange).toHaveBeenCalledWith(1)
  })
})
