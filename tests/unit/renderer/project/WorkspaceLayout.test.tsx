import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WorkspaceLayout } from '@modules/project/components/WorkspaceLayout'

describe('@story-1-7 WorkspaceLayout', () => {
  afterEach(cleanup)

  it('@p0 renders three columns and status bar', () => {
    render(
      <WorkspaceLayout
        left={<div data-testid="left-slot">Left</div>}
        center={<div data-testid="center-slot">Center</div>}
        right={<div data-testid="right-slot">Right</div>}
        statusBar={<div data-testid="statusbar-slot">Status</div>}
      />
    )
    expect(screen.getByTestId('workspace-layout')).toBeInTheDocument()
    expect(screen.getByTestId('left-slot')).toBeInTheDocument()
    expect(screen.getByTestId('center-slot')).toBeInTheDocument()
    expect(screen.getByTestId('right-slot')).toBeInTheDocument()
    expect(screen.getByTestId('statusbar-slot')).toBeInTheDocument()
  })

  it('@p0 main content area has min-width 600px and max-width 800px wrapper', () => {
    render(
      <WorkspaceLayout
        left={<div>L</div>}
        center={<div>C</div>}
        right={<div>R</div>}
        statusBar={<div>S</div>}
      />
    )
    const main = screen.getByTestId('workspace-main')
    expect(main).toBeInTheDocument()
    expect(main.className).toContain('min-w-[600px]')
  })
})
