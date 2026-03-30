import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatusBar } from '@modules/project/components/StatusBar'

describe('@story-1-7 StatusBar', () => {
  afterEach(cleanup)

  it('@p0 renders three placeholder metrics on the right', () => {
    render(<StatusBar />)
    expect(screen.getByTestId('status-compliance')).toHaveTextContent('合规分 --')
    expect(screen.getByTestId('status-quality')).toHaveTextContent('质量分 --')
    expect(screen.getByTestId('status-wordcount')).toHaveTextContent('字数 --')
  })

  it('@p0 has role="status" and aria-label', () => {
    render(<StatusBar />)
    const bar = screen.getByTestId('status-bar')
    expect(bar).toHaveAttribute('role', 'status')
    expect(bar).toHaveAttribute('aria-label', '项目状态栏')
  })

  it('@p0 renders SOP stage name on the left when provided', () => {
    render(<StatusBar currentStageName="需求分析" />)
    expect(screen.getByTestId('status-sop-stage')).toHaveTextContent('需求分析')
  })

  it('@p1 does not render SOP stage when not provided', () => {
    render(<StatusBar />)
    expect(screen.queryByTestId('status-sop-stage')).not.toBeInTheDocument()
  })

  it('@p1 renders leftExtra content on the left', () => {
    render(<StatusBar leftExtra={<span data-testid="left-extra">自动保存</span>} />)
    expect(screen.getByTestId('left-extra')).toHaveTextContent('自动保存')
  })

  it('@story-3-2 @p0 displays formatted word count when provided', () => {
    render(<StatusBar wordCount={3842} />)
    expect(screen.getByTestId('status-wordcount')).toHaveTextContent('字数 3,842')
  })

  it('@story-3-2 @p0 displays -- when wordCount is undefined', () => {
    render(<StatusBar />)
    expect(screen.getByTestId('status-wordcount')).toHaveTextContent('字数 --')
  })

  it('@story-3-2 @p1 displays 0 when wordCount is 0', () => {
    render(<StatusBar wordCount={0} />)
    expect(screen.getByTestId('status-wordcount')).toHaveTextContent('字数 0')
  })

  it('@story-3-2 @p0 layout: stage on left, metrics on right', () => {
    render(<StatusBar currentStageName="方案编写" wordCount={100} />)
    const bar = screen.getByTestId('status-bar')
    const leftSection = bar.children[0] as HTMLElement
    const rightSection = bar.children[1] as HTMLElement
    // Stage is in the left section
    expect(leftSection).toHaveTextContent('方案编写')
    // Metrics are in the right section
    expect(rightSection).toHaveTextContent(/字数/)
    expect(rightSection).toHaveTextContent(/合规分/)
    expect(rightSection).toHaveTextContent(/质量分/)
  })
})
