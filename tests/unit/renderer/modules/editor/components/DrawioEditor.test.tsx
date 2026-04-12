import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DrawioEditor } from '@modules/editor/components/DrawioEditor'

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd')
  return {
    ...actual,
    message: { error: vi.fn() },
  }
})

describe('@story-3-7 DrawioEditor', () => {
  const defaultProps = {
    xml: '<mxGraphModel/>',
    projectId: 'proj-1',
    diagramId: 'uuid-1',
    assetFileName: 'diagram-abc.drawio',
    onSave: vi.fn().mockResolvedValue(true),
    onExit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders iframe with draw.io embed URL', () => {
    render(<DrawioEditor {...defaultProps} />)

    const iframe = screen.getByTestId('drawio-iframe') as HTMLIFrameElement
    expect(iframe).toBeDefined()
    expect(iframe.src).toContain('embed.diagrams.net')
    expect(iframe.src).toContain('embed=1')
    expect(iframe.src).toContain('proto=json')
  })

  it('applies sandbox security policy', () => {
    render(<DrawioEditor {...defaultProps} />)

    const iframe = screen.getByTestId('drawio-iframe') as HTMLIFrameElement
    const sandbox = iframe.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
    expect(sandbox).toContain('allow-popups')
  })

  it('has fixed height of 500px', () => {
    render(<DrawioEditor {...defaultProps} />)

    const iframe = screen.getByTestId('drawio-iframe') as HTMLIFrameElement
    expect(iframe.style.height).toBe('500px')
  })

  it('ignores postMessage from non-diagrams.net origins', () => {
    render(<DrawioEditor {...defaultProps} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'init' }),
        origin: 'https://evil.com',
      })
    )

    expect(defaultProps.onSave).not.toHaveBeenCalled()
    expect(defaultProps.onExit).not.toHaveBeenCalled()
  })

  it('ignores malformed JSON messages', () => {
    render(<DrawioEditor {...defaultProps} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: 'not-json',
        origin: 'https://embed.diagrams.net',
      })
    )

    expect(defaultProps.onSave).not.toHaveBeenCalled()
    expect(defaultProps.onExit).not.toHaveBeenCalled()
  })

  it('@story-8-4 export postMessage includes scale: 2', async () => {
    render(<DrawioEditor {...defaultProps} />)

    const iframe = screen.getByTestId('drawio-iframe') as HTMLIFrameElement
    const postMessageSpy = vi.fn()
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: postMessageSpy },
      writable: true,
    })

    // Simulate init event — triggers load
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'init' }),
        origin: 'https://embed.diagrams.net',
      })
    )

    // Simulate save event — triggers export with scale: 2
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'save', xml: '<mxGraphModel/>' }),
        origin: 'https://embed.diagrams.net',
      })
    )

    // Find the export call
    const exportCall = postMessageSpy.mock.calls.find((call: unknown[]) => {
      const parsed = JSON.parse(call[0] as string)
      return parsed.action === 'export'
    })

    expect(exportCall).toBeDefined()
    const exportMsg = JSON.parse(exportCall![0] as string)
    expect(exportMsg).toMatchObject({
      action: 'export',
      format: 'png',
      spin: true,
      scale: 2,
    })
  })

  it('@story-8-4 non-diagrams.net origin messages are still ignored', () => {
    render(<DrawioEditor {...defaultProps} />)

    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event: 'save', xml: '<mxGraphModel/>' }),
        origin: 'https://evil.com',
      })
    )

    expect(defaultProps.onSave).not.toHaveBeenCalled()
  })
})
