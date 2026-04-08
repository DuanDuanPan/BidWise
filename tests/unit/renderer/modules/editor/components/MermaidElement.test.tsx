import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// Mock mermaid before importing components
const mockMermaid = vi.hoisted(() => ({
  parse: vi.fn(),
  render: vi.fn(),
  initialize: vi.fn(),
}))
vi.mock('mermaid', () => ({ default: mockMermaid }))

// Mock Plate hooks
const mockFindPath = vi.fn().mockReturnValue([0])
const mockSetNodes = vi.fn()
const mockRemoveNodes = vi.fn()
const mockEditorRef = {
  api: { findPath: mockFindPath },
  tf: { setNodes: mockSetNodes, removeNodes: mockRemoveNodes },
}

vi.mock('platejs/react', () => ({
  PlateElement: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="plate-element" {...(props as object)}>
      {children as React.ReactNode}
    </div>
  ),
  useEditorRef: () => mockEditorRef,
  useSelected: () => false,
  createPlatePlugin: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    withComponent: vi.fn(() => ({ ...config })),
  })),
}))

// Mock project store
vi.mock('@renderer/stores', () => ({
  useProjectStore: (selector: (s: { currentProject: { id: string } }) => unknown) =>
    selector({ currentProject: { id: 'proj-test' } }),
}))

// Mock window.api
const mockMermaidSaveAsset = vi
  .fn()
  .mockResolvedValue({ success: true, data: { assetPath: '/tmp/assets/test.svg' } })
const mockMermaidDeleteAsset = vi.fn().mockResolvedValue({ success: true, data: undefined })
const mockMessageWarning = vi.fn()
const mockModalConfirm = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    mermaidSaveAsset: mockMermaidSaveAsset,
    mermaidDeleteAsset: mockMermaidDeleteAsset,
  },
  writable: true,
})

// Mock antd App.useApp to provide message + modal
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd')
  return {
    ...actual,
    App: {
      ...(actual as Record<string, unknown>).App,
      useApp: () => ({
        message: { warning: mockMessageWarning },
        modal: { confirm: mockModalConfirm },
      }),
    },
  }
})

import { MermaidElement } from '@modules/editor/components/MermaidElement'

function renderMermaidElement(overrides: Record<string, unknown> = {}): ReturnType<typeof render> {
  const element = {
    type: 'mermaid' as const,
    diagramId: 'uuid-test',
    assetFileName: 'mermaid-abc123.svg',
    source: 'graph TD\n  A-->B',
    caption: '',
    children: [{ text: '' }],
    ...overrides,
  }

  return render(
    <MermaidElement element={element} attributes={{} as never} nodeProps={{} as never}>
      <span />
    </MermaidElement>
  )
}

describe('@story-3-8 MermaidElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockMermaid.parse.mockResolvedValue(true)
    mockMermaid.render.mockResolvedValue({ svg: '<svg>rendered</svg>' })
    mockMermaidSaveAsset.mockResolvedValue({ success: true, data: { assetPath: '/tmp/test.svg' } })
    mockMermaidDeleteAsset.mockResolvedValue({ success: true, data: undefined })
    mockFindPath.mockReturnValue([0])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders in editing mode for new nodes (default template)', () => {
    renderMermaidElement({ source: '' })

    expect(screen.getByTestId('mermaid-editing')).toBeDefined()
    expect(screen.getByTestId('mermaid-source-editor')).toBeDefined()
    expect(screen.getByTestId('mermaid-done-btn')).toBeDefined()
  })

  it('renders in preview mode for nodes with existing source', () => {
    renderMermaidElement({ source: 'graph LR\n  A-->B' })

    expect(screen.getByTestId('mermaid-preview')).toBeDefined()
    expect(screen.getByTestId('mermaid-edit-btn')).toBeDefined()
    expect(screen.getByTestId('mermaid-delete-btn')).toBeDefined()
  })

  it('switches from preview to editing on edit button click', () => {
    renderMermaidElement({ source: 'graph LR\n  A-->B' })

    fireEvent.click(screen.getByTestId('mermaid-edit-btn'))

    expect(screen.getByTestId('mermaid-editing')).toBeDefined()
  })

  it('switches from preview to editing on double-click', () => {
    renderMermaidElement({ source: 'graph LR\n  A-->B' })

    fireEvent.doubleClick(screen.getByTestId('mermaid-preview'))

    expect(screen.getByTestId('mermaid-editing')).toBeDefined()
  })

  it('exits editing mode and saves asset on "完成" button when render matches', async () => {
    renderMermaidElement({ source: '' })

    // Wait for debounced render to complete
    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    fireEvent.click(screen.getByTestId('mermaid-done-btn'))

    // Should switch to preview mode
    expect(screen.getByTestId('mermaid-preview')).toBeDefined()

    // Should have called IPC to save asset
    expect(mockMermaidSaveAsset).toHaveBeenCalledWith({
      projectId: 'proj-test',
      diagramId: 'uuid-test',
      svgContent: '<svg>rendered</svg>',
      assetFileName: 'mermaid-abc123.svg',
    })

    // Should have updated node data
    expect(mockSetNodes).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.any(String),
        caption: '',
        lastModified: expect.any(String),
      }),
      { at: [0] }
    )
  })

  it('prevents exit from editing when source has syntax errors', async () => {
    renderMermaidElement({ source: '' })

    // Mock parse to fail — render won't produce a successful SVG
    mockMermaid.parse.mockRejectedValue(new Error('bad syntax'))

    // Change source to something invalid — target the textarea inside the editor
    const textarea = screen.getByTestId('mermaid-source-editor').querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'broken syntax' } })

    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    // Click done — should stay in editing mode
    fireEvent.click(screen.getByTestId('mermaid-done-btn'))

    expect(screen.getByTestId('mermaid-editing')).toBeDefined()
    expect(mockMermaidSaveAsset).not.toHaveBeenCalled()
  })

  it('deletes element and calls IPC on delete confirmation', async () => {
    renderMermaidElement({ source: 'graph LR\n  A-->B' })

    fireEvent.click(screen.getByTestId('mermaid-delete-btn'))
    expect(mockModalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认删除',
        okText: '删除',
      })
    )

    // Simulate user clicking "删除" by invoking the onOk callback
    const confirmConfig = mockModalConfirm.mock.calls[0][0] as { onOk: () => void }
    confirmConfig.onOk()

    expect(mockRemoveNodes).toHaveBeenCalledWith({ at: [0] })
    expect(mockMermaidDeleteAsset).toHaveBeenCalledWith({
      projectId: 'proj-test',
      assetFileName: 'mermaid-abc123.svg',
    })
  })

  it('updates caption on blur', () => {
    renderMermaidElement({ source: 'graph LR\n  A-->B', caption: '旧标题' })

    const captionInput = screen.getByTestId('mermaid-caption-input')
    fireEvent.change(captionInput, { target: { value: '新标题' } })
    fireEvent.blur(captionInput)

    expect(mockSetNodes).toHaveBeenCalledWith({ caption: '新标题' }, { at: [0] })
  })

  it('displays save failure warning without crashing', async () => {
    mockMermaidSaveAsset.mockResolvedValue({
      success: false,
      error: { code: 'IO', message: 'disk full' },
    })

    renderMermaidElement({ source: '' })

    // Wait for render
    await act(async () => {
      vi.advanceTimersByTime(500)
      await vi.advanceTimersByTimeAsync(0)
    })

    // Exit editing — should not crash
    fireEvent.click(screen.getByTestId('mermaid-done-btn'))

    expect(screen.getByTestId('mermaid-preview')).toBeDefined()
  })
})
