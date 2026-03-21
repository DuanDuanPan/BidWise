import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AnnotationPanel } from '@modules/project/components/AnnotationPanel'

describe('@story-1-7 AnnotationPanel', () => {
  afterEach(cleanup)

  describe('standard mode (not compact)', () => {
    it('@p0 renders title and placeholder content', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByText('智能批注')).toBeInTheDocument()
      expect(screen.getByText(/批注面板将在批注模块/)).toBeInTheDocument()
    })

    it('@p0 has role="complementary" and aria-label', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      const panel = screen.getByTestId('annotation-panel')
      expect(panel).toHaveAttribute('role', 'complementary')
      expect(panel).toHaveAttribute('aria-label', '智能批注')
    })

    it('@p0 has aria-live="polite"', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      const panel = screen.getByTestId('annotation-panel')
      expect(panel).toHaveAttribute('aria-live', 'polite')
    })

    it('@p0 toggle button triggers onToggle callback', () => {
      const onToggle = vi.fn()
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={onToggle} />)
      fireEvent.click(screen.getByTestId('annotation-toggle'))
      expect(onToggle).toHaveBeenCalledTimes(1)
    })

    it('@p0 toggle button has correct aria-expanded', () => {
      const { rerender } = render(
        <AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />
      )
      expect(screen.getByTestId('annotation-toggle')).toHaveAttribute('aria-expanded', 'true')

      rerender(<AnnotationPanel collapsed={true} isCompact={false} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-toggle')).toHaveAttribute('aria-expanded', 'false')
    })

    it('@p1 expanded state sets width to 320px', () => {
      render(<AnnotationPanel collapsed={false} isCompact={false} onToggle={vi.fn()} />)
      const panel = screen.getByTestId('annotation-panel')
      expect(panel.style.width).toBe('320px')
    })

    it('@p1 collapsed state sets width to 40px (expand strip)', () => {
      render(<AnnotationPanel collapsed={true} isCompact={false} onToggle={vi.fn()} />)
      const panel = screen.getByTestId('annotation-panel')
      expect(panel.style.width).toBe('40px')
    })
  })

  describe('compact mode (isCompact + collapsed)', () => {
    it('@p0 renders icon bar when compact + collapsed', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      expect(screen.getByTestId('annotation-icon-bar')).toBeInTheDocument()
    })

    it('@p0 clicking icon button opens flyout', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      expect(screen.getByTestId('annotation-flyout')).toBeInTheDocument()
    })

    it('@p0 flyout has role="dialog" and aria-label', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      const flyout = screen.getByTestId('annotation-flyout')
      expect(flyout).toHaveAttribute('role', 'dialog')
      expect(flyout).toHaveAttribute('aria-label', '智能批注面板')
    })

    it('@p0 Escape closes flyout', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      expect(screen.getByTestId('annotation-flyout')).toBeInTheDocument()

      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()
    })

    it('@p0 clicking outside closes flyout', () => {
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />
        </div>
      )
      fireEvent.click(screen.getByTestId('annotation-icon-button'))
      expect(screen.getByTestId('annotation-flyout')).toBeInTheDocument()

      fireEvent.mouseDown(screen.getByTestId('outside'))
      expect(screen.queryByTestId('annotation-flyout')).not.toBeInTheDocument()
    })

    it('@p1 icon button has aria-expanded reflecting flyout state', () => {
      render(<AnnotationPanel collapsed={true} isCompact={true} onToggle={vi.fn()} />)
      const btn = screen.getByTestId('annotation-icon-button')
      expect(btn).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(btn)
      expect(btn).toHaveAttribute('aria-expanded', 'true')
    })
  })
})
