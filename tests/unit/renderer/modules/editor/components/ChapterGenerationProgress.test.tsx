import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ChapterGenerationProgress } from '@modules/editor/components/ChapterGenerationProgress'

describe('@story-3-4 ChapterGenerationProgress', () => {
  afterEach(cleanup)

  it('@p0 renders progress indicator for queued phase', () => {
    render(<ChapterGenerationProgress phase="queued" progress={0} />)
    expect(screen.getByTestId('chapter-generation-progress')).toBeInTheDocument()
    expect(screen.getByText('排队中...')).toBeInTheDocument()
  })

  it('@p0 renders progress indicator for analyzing phase', () => {
    render(<ChapterGenerationProgress phase="analyzing" progress={10} />)
    expect(screen.getByText('分析需求上下文...')).toBeInTheDocument()
  })

  it('@p0 renders progress indicator for matching-assets phase', () => {
    render(<ChapterGenerationProgress phase="matching-assets" progress={25} />)
    expect(screen.getByText('匹配资产素材...')).toBeInTheDocument()
  })

  it('@p0 renders progress indicator for generating phase', () => {
    render(<ChapterGenerationProgress phase="generating" progress={50} />)
    expect(screen.getByText('AI 正在撰写...')).toBeInTheDocument()
  })

  it('@p0 renders progress indicator for annotating-sources phase', () => {
    render(<ChapterGenerationProgress phase="annotating-sources" progress={90} />)
    expect(screen.getByText('标注来源...')).toBeInTheDocument()
  })

  it('@p0 returns null for completed phase', () => {
    const { container } = render(<ChapterGenerationProgress phase="completed" progress={100} />)
    expect(container.innerHTML).toBe('')
  })

  it('@p0 returns null for failed phase', () => {
    const { container } = render(<ChapterGenerationProgress phase="failed" progress={50} />)
    expect(container.innerHTML).toBe('')
  })

  it('@p0 returns null for conflicted phase', () => {
    const { container } = render(<ChapterGenerationProgress phase="conflicted" progress={80} />)
    expect(container.innerHTML).toBe('')
  })

  it('@p1 renders skeleton loader placeholder', () => {
    const { container } = render(<ChapterGenerationProgress phase="generating" progress={50} />)
    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument()
  })
})
