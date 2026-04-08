import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

const mockMermaid = vi.hoisted(() => ({
  parse: vi.fn(),
  render: vi.fn(),
  initialize: vi.fn(),
}))

vi.mock('mermaid', () => ({
  default: mockMermaid,
}))

import { MermaidRenderer } from '@modules/editor/components/MermaidRenderer'

const VALID_SOURCE = 'graph TD\n  A-->B'

describe('@story-3-8 MermaidRenderer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockMermaid.parse.mockReset()
    mockMermaid.render.mockReset()
    mockMermaid.parse.mockResolvedValue(true)
    mockMermaid.render.mockResolvedValue({ svg: '<svg>ok</svg>' })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('initializes mermaid with correct config on module load', () => {
    // initialize is called at module top level — check it was called at least once
    expect(mockMermaid.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'strict',
      logLevel: 'error',
    })
  })

  it('renders SVG after 500ms debounce', async () => {
    const onSuccess = vi.fn()
    render(<MermaidRenderer source={VALID_SOURCE} diagramId="test-1" onRenderSuccess={onSuccess} />)

    // Before debounce fires, no render call
    expect(mockMermaid.render).not.toHaveBeenCalled()

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockMermaid.parse).toHaveBeenCalledWith(VALID_SOURCE)
    expect(mockMermaid.render).toHaveBeenCalledWith('mermaid-test-1-1', VALID_SOURCE)
    expect(onSuccess).toHaveBeenCalledWith('<svg>ok</svg>')
  })

  it('shows error message on parse failure', async () => {
    mockMermaid.parse.mockRejectedValue(new Error('Syntax error at line 3'))

    const onError = vi.fn()
    render(<MermaidRenderer source="invalid syntax" diagramId="test-2" onRenderError={onError} />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('mermaid-error')).toHaveTextContent('Syntax error at line 3')
    expect(onError).toHaveBeenCalledWith('Syntax error at line 3', 3)
    expect(mockMermaid.render).not.toHaveBeenCalled()
  })

  it('shows error message on render failure', async () => {
    mockMermaid.render.mockRejectedValue(new Error('Render failed'))

    const onError = vi.fn()
    render(<MermaidRenderer source={VALID_SOURCE} diagramId="test-3" onRenderError={onError} />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('mermaid-error')).toHaveTextContent('Render failed')
    expect(onError).toHaveBeenCalledWith('Render failed', undefined)
  })

  it('preserves last successful SVG on subsequent error', async () => {
    const { rerender } = render(<MermaidRenderer source={VALID_SOURCE} diagramId="test-4" />)

    // First render succeeds
    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(screen.getByTestId('mermaid-svg-container').innerHTML).toContain('ok')

    // Second render fails
    mockMermaid.parse.mockRejectedValue(new Error('Bad syntax'))
    rerender(<MermaidRenderer source="broken" diagramId="test-4" />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    // Error shown + stale preview preserved
    expect(screen.getByTestId('mermaid-error')).toBeDefined()
    expect(screen.getByTestId('mermaid-stale-preview')).toBeDefined()
  })

  it('debounces rapid source changes (only last renders)', async () => {
    const { rerender } = render(<MermaidRenderer source="v1" diagramId="test-5" />)

    // Change source rapidly before debounce fires
    rerender(<MermaidRenderer source="v2" diagramId="test-5" />)
    rerender(<MermaidRenderer source="v3" diagramId="test-5" />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    // Only the last version should be rendered
    expect(mockMermaid.parse).toHaveBeenCalledTimes(1)
    expect(mockMermaid.parse).toHaveBeenCalledWith('v3')
  })

  it('does not render empty source', async () => {
    render(<MermaidRenderer source="" diagramId="test-6" />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockMermaid.parse).not.toHaveBeenCalled()
    expect(mockMermaid.render).not.toHaveBeenCalled()
  })

  it('uses unique render IDs per render call', async () => {
    const { rerender } = render(<MermaidRenderer source={VALID_SOURCE} diagramId="d1" />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockMermaid.render).toHaveBeenCalledWith('mermaid-d1-1', expect.any(String))

    mockMermaid.render.mockClear()
    mockMermaid.render.mockResolvedValue({ svg: '<svg>v2</svg>' })
    rerender(<MermaidRenderer source={`${VALID_SOURCE}\n  B-->C`} diagramId="d1" />)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(mockMermaid.render).toHaveBeenCalledWith('mermaid-d1-2', expect.any(String))
  })
})
