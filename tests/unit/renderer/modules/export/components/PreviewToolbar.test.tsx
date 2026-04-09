import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { PreviewToolbar } from '@modules/export/components/PreviewToolbar'

describe('PreviewToolbar', () => {
  afterEach(cleanup)
  it('renders toolbar with file name and title', () => {
    render(
      <PreviewToolbar
        fileName=".preview-123.docx"
        zoom={1}
        onZoomChange={vi.fn()}
        onFitPage={vi.fn()}
      />
    )

    expect(screen.getByTestId('preview-toolbar')).toBeInTheDocument()
    expect(screen.getByText('方案预览')).toBeInTheDocument()
    expect(screen.getByTestId('file-name-tag')).toHaveTextContent('.preview-123.docx')
  })

  it('shows page count when provided', () => {
    render(
      <PreviewToolbar
        fileName="test.docx"
        pageCount={10}
        zoom={1}
        onZoomChange={vi.fn()}
        onFitPage={vi.fn()}
      />
    )

    expect(screen.getByTestId('page-count')).toHaveTextContent('共 10 页')
  })

  it('hides page count when not provided', () => {
    render(
      <PreviewToolbar fileName="test.docx" zoom={1} onZoomChange={vi.fn()} onFitPage={vi.fn()} />
    )

    expect(screen.queryByTestId('page-count')).not.toBeInTheDocument()
  })

  it('zoom in increases zoom level', () => {
    const onZoomChange = vi.fn()
    render(
      <PreviewToolbar
        fileName="test.docx"
        zoom={1}
        onZoomChange={onZoomChange}
        onFitPage={vi.fn()}
      />
    )

    // Initial zoom is 100%
    expect(screen.getByTestId('zoom-level')).toHaveTextContent('100%')

    fireEvent.click(screen.getByTestId('zoom-in-btn'))
    expect(onZoomChange).toHaveBeenCalledWith(1.25)
  })

  it('zoom out decreases zoom level', () => {
    const onZoomChange = vi.fn()
    render(
      <PreviewToolbar
        fileName="test.docx"
        zoom={1}
        onZoomChange={onZoomChange}
        onFitPage={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('zoom-out-btn'))
    expect(onZoomChange).toHaveBeenCalledWith(0.75)
  })

  it('fit page calls onFitPage callback', () => {
    const onFitPage = vi.fn()
    render(
      <PreviewToolbar
        fileName="test.docx"
        zoom={1.25}
        onZoomChange={vi.fn()}
        onFitPage={onFitPage}
      />
    )

    fireEvent.click(screen.getByTestId('fit-page-btn'))
    expect(onFitPage).toHaveBeenCalledOnce()
  })

  it('displays arbitrary zoom percentage from prop', () => {
    render(
      <PreviewToolbar
        fileName="test.docx"
        zoom={0.82}
        onZoomChange={vi.fn()}
        onFitPage={vi.fn()}
      />
    )

    expect(screen.getByTestId('zoom-level')).toHaveTextContent('82%')
  })

  it('disables zoom in at max level', () => {
    render(
      <PreviewToolbar fileName="test.docx" zoom={2} onZoomChange={vi.fn()} onFitPage={vi.fn()} />
    )

    expect(screen.getByTestId('zoom-in-btn')).toBeDisabled()
  })

  it('disables zoom out at min level', () => {
    render(
      <PreviewToolbar
        fileName="test.docx"
        zoom={0.5}
        onZoomChange={vi.fn()}
        onFitPage={vi.fn()}
      />
    )

    expect(screen.getByTestId('zoom-out-btn')).toBeDisabled()
  })
})
