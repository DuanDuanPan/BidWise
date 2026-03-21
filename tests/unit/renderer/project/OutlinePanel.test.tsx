import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { OutlinePanel } from '@modules/project/components/OutlinePanel'

describe('@story-1-7 OutlinePanel', () => {
  afterEach(cleanup)

  it('@p0 renders title and placeholder content', () => {
    render(<OutlinePanel collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('文档大纲')).toBeInTheDocument()
    expect(screen.getByText(/大纲内容将在编辑器模块/)).toBeInTheDocument()
  })

  it('@p0 has role="complementary" and aria-label', () => {
    render(<OutlinePanel collapsed={false} onToggle={vi.fn()} />)
    const panel = screen.getByTestId('outline-panel')
    expect(panel).toHaveAttribute('role', 'complementary')
    expect(panel).toHaveAttribute('aria-label', '文档大纲')
  })

  it('@p0 toggle button triggers onToggle callback', () => {
    const onToggle = vi.fn()
    render(<OutlinePanel collapsed={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('outline-toggle'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('@p0 toggle button has aria-expanded=true when expanded', () => {
    render(<OutlinePanel collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByTestId('outline-toggle')).toHaveAttribute('aria-expanded', 'true')
  })

  it('@p0 toggle button has aria-expanded=false when collapsed', () => {
    render(<OutlinePanel collapsed={true} onToggle={vi.fn()} />)
    expect(screen.getByTestId('outline-toggle')).toHaveAttribute('aria-expanded', 'false')
  })

  it('@p1 collapsed state sets width to 40px (expand strip)', () => {
    render(<OutlinePanel collapsed={true} onToggle={vi.fn()} />)
    const panel = screen.getByTestId('outline-panel')
    expect(panel.style.width).toBe('40px')
  })

  it('@p1 expanded state sets width to 240px', () => {
    render(<OutlinePanel collapsed={false} onToggle={vi.fn()} />)
    const panel = screen.getByTestId('outline-panel')
    expect(panel.style.width).toBe('240px')
  })
})
