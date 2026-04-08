import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@modules/editor/components/WritingStyleSelector', () => ({
  WritingStyleSelector: () => <div data-testid="writing-style-selector" />,
}))

import { EditorToolbar } from '@modules/editor/components/EditorToolbar'

describe('@story-3-8 EditorToolbar mermaid integration', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders mermaid insert button when onInsertMermaid is provided', () => {
    render(
      <EditorToolbar projectId="proj-1" onInsertMermaid={vi.fn()} insertMermaidDisabled={false} />
    )

    const toolbar = screen.getByTestId('editor-toolbar')
    const btn = toolbar.querySelector('[data-testid="insert-mermaid-btn"]')
    expect(btn).toBeDefined()
    expect(btn).not.toBeNull()
  })

  it('does not render mermaid button inside toolbar when onInsertMermaid is undefined', () => {
    render(<EditorToolbar projectId="proj-1" />)

    const toolbar = screen.getByTestId('editor-toolbar')
    const btn = toolbar.querySelector('[data-testid="insert-mermaid-btn"]')
    expect(btn).toBeNull()
  })

  it('calls onInsertMermaid when button is clicked', () => {
    const onInsertMermaid = vi.fn()
    render(
      <EditorToolbar
        projectId="proj-1"
        onInsertMermaid={onInsertMermaid}
        insertMermaidDisabled={false}
      />
    )

    const toolbar = screen.getByTestId('editor-toolbar')
    const btn = toolbar.querySelector('[data-testid="insert-mermaid-btn"]') as HTMLButtonElement
    fireEvent.click(btn)

    expect(onInsertMermaid).toHaveBeenCalledTimes(1)
  })

  it('disables mermaid button when insertMermaidDisabled is true', () => {
    render(
      <EditorToolbar projectId="proj-1" onInsertMermaid={vi.fn()} insertMermaidDisabled={true} />
    )

    const toolbar = screen.getByTestId('editor-toolbar')
    const btn = toolbar.querySelector('[data-testid="insert-mermaid-btn"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})
