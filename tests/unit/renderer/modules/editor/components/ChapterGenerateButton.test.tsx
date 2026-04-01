import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ChapterGenerateButton } from '@modules/editor/components/ChapterGenerateButton'

describe('@story-3-4 ChapterGenerateButton', () => {
  afterEach(cleanup)

  it('@p0 renders button with AI generation tooltip', () => {
    render(<ChapterGenerateButton onClick={vi.fn()} />)
    const btn = screen.getByTestId('chapter-generate-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label', 'AI 生成章节内容')
  })

  it('@p0 calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<ChapterGenerateButton onClick={onClick} />)
    fireEvent.click(screen.getByTestId('chapter-generate-btn'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('@p1 disables button when disabled prop is true', () => {
    render(<ChapterGenerateButton onClick={vi.fn()} disabled />)
    expect(screen.getByTestId('chapter-generate-btn')).toBeDisabled()
  })
})
