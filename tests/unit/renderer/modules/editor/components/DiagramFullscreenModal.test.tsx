import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { DiagramFullscreenModal } from '@modules/editor/components/DiagramFullscreenModal'

describe('DiagramFullscreenModal', () => {
  afterEach(cleanup)

  it('renders the diagram svg directly inside the fullscreen stage container', async () => {
    render(
      <DiagramFullscreenModal
        open
        svgHtml={
          '<svg id="diagram-svg" width="100%" style="max-width: 282px;" viewBox="0 0 282 278"></svg>'
        }
        onClose={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('diagram-fullscreen-stage')).toBeInTheDocument()
    })

    const stage = screen.getByTestId('diagram-fullscreen-stage')
    const svg = document.querySelector('#diagram-svg')

    expect(svg).toBeInTheDocument()
    expect(svg?.parentElement).toBe(stage)
    expect(stage.childElementCount).toBe(1)
  })
})
