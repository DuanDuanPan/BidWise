import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatusBar } from '@modules/project/components/StatusBar'

describe('@story-1-7 StatusBar', () => {
  afterEach(cleanup)

  it('@p0 renders three placeholder metrics', () => {
    render(<StatusBar />)
    expect(screen.getByTestId('status-compliance')).toHaveTextContent('合规 --')
    expect(screen.getByTestId('status-quality')).toHaveTextContent('质量 --')
    expect(screen.getByTestId('status-wordcount')).toHaveTextContent('字数 --')
  })

  it('@p0 has role="status" and aria-label', () => {
    render(<StatusBar />)
    const bar = screen.getByTestId('status-bar')
    expect(bar).toHaveAttribute('role', 'status')
    expect(bar).toHaveAttribute('aria-label', '项目状态栏')
  })

  it('@p0 renders SOP stage name when provided', () => {
    render(<StatusBar currentStageName="需求分析" />)
    expect(screen.getByTestId('status-sop-stage')).toHaveTextContent('需求分析')
  })

  it('@p1 does not render SOP stage when not provided', () => {
    render(<StatusBar />)
    expect(screen.queryByTestId('status-sop-stage')).not.toBeInTheDocument()
  })

  it('@p1 renders leftExtra content when provided', () => {
    render(<StatusBar leftExtra={<span data-testid="left-extra">自动保存</span>} />)
    expect(screen.getByTestId('left-extra')).toHaveTextContent('自动保存')
  })
})
