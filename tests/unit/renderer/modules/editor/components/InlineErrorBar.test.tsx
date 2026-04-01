import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InlineErrorBar } from '@modules/editor/components/InlineErrorBar'

describe('@story-3-4 InlineErrorBar', () => {
  afterEach(cleanup)

  const defaultProps = {
    error: 'AI 服务超时',
    onRetry: vi.fn(),
    onManualEdit: vi.fn(),
    onSkip: vi.fn(),
  }

  it('@p0 renders error message', () => {
    render(<InlineErrorBar {...defaultProps} />)
    expect(screen.getByTestId('chapter-error-bar')).toBeInTheDocument()
    expect(screen.getByText('AI 服务超时')).toBeInTheDocument()
    expect(screen.getByText('章节生成失败')).toBeInTheDocument()
  })

  it('@p0 renders three action buttons: retry, manual edit, skip', () => {
    render(<InlineErrorBar {...defaultProps} />)
    expect(screen.getByTestId('chapter-retry-btn')).toBeInTheDocument()
    expect(screen.getByTestId('chapter-manual-edit-btn')).toBeInTheDocument()
    expect(screen.getByTestId('chapter-skip-btn')).toBeInTheDocument()
  })

  it('@p0 calls onRetry when retry button clicked', () => {
    render(<InlineErrorBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('chapter-retry-btn'))
    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1)
  })

  it('@p0 calls onManualEdit when manual edit button clicked', () => {
    render(<InlineErrorBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('chapter-manual-edit-btn'))
    expect(defaultProps.onManualEdit).toHaveBeenCalledTimes(1)
  })

  it('@p0 calls onSkip when skip button clicked', () => {
    render(<InlineErrorBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('chapter-skip-btn'))
    expect(defaultProps.onSkip).toHaveBeenCalledTimes(1)
  })
})
