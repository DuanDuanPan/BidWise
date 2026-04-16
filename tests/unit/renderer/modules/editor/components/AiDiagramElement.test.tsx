import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

// Mock Plate hooks
const mockFindPath = vi.fn().mockReturnValue([0])
const mockSetNodes = vi.fn()
const mockRemoveNodes = vi.fn()

vi.mock('platejs/react', () => ({
  PlateElement: ({ children, ...props }: Record<string, unknown>) => (
    <div data-testid="plate-element" {...(props as object)}>
      {children as React.ReactNode}
    </div>
  ),
  useEditorRef: () => ({
    api: { findPath: mockFindPath },
    tf: { setNodes: mockSetNodes, removeNodes: mockRemoveNodes },
  }),
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

// Mock sanitizeSvg
vi.mock('@modules/editor/utils/aiDiagramSvg', () => ({
  sanitizeSvg: vi.fn((svg: string) => ({ ok: true, svg })),
}))

// Mock context
const mockRequestRegenerate = vi.fn()
vi.mock('@modules/editor/context/AiDiagramContext', () => ({
  useAiDiagramContext: () => ({ requestRegenerate: mockRequestRegenerate }),
}))

// Mock window.api
const mockAiDiagramSaveAsset = vi
  .fn()
  .mockResolvedValue({ success: true, data: { assetPath: '/tmp/test.svg' } })
const mockAiDiagramLoadAsset = vi.fn().mockResolvedValue({ success: false, data: null })
const mockAiDiagramDeleteAsset = vi.fn().mockResolvedValue({ success: true, data: undefined })
const mockMessageWarning = vi.fn()
const mockModalConfirm = vi.fn()

Object.defineProperty(window, 'api', {
  value: {
    aiDiagramSaveAsset: mockAiDiagramSaveAsset,
    aiDiagramLoadAsset: mockAiDiagramLoadAsset,
    aiDiagramDeleteAsset: mockAiDiagramDeleteAsset,
  },
  writable: true,
})

// Mock antd App.useApp
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

// Mock DiagramFullscreenModal
vi.mock('@modules/editor/components/DiagramFullscreenModal', () => ({
  DiagramFullscreenModal: () => <div data-testid="mock-fullscreen-modal" />,
}))

// Mock IntersectionObserver — immediately visible
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    Promise.resolve().then(() =>
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      )
    )
  }
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

import { AiDiagramElement } from '@modules/editor/components/AiDiagramElement'

function renderElement(overrides: Record<string, unknown> = {}): ReturnType<typeof render> {
  const element = {
    type: 'ai-diagram' as const,
    diagramId: 'uuid-ai-test',
    assetFileName: 'ai-diagram-abc.svg',
    caption: '',
    prompt: '系统架构图',
    style: 'flat-icon',
    diagramType: 'architecture',
    svgContent: '<svg><rect/></svg>',
    svgPersisted: true,
    children: [{ text: '' }],
    ...overrides,
  }

  return render(
    <AiDiagramElement element={element} attributes={{} as never} nodeProps={{} as never}>
      <span />
    </AiDiagramElement>
  )
}

describe('@story-3-9 AiDiagramElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindPath.mockReturnValue([0])
    mockAiDiagramSaveAsset.mockResolvedValue({
      success: true,
      data: { assetPath: '/tmp/test.svg' },
    })
    mockAiDiagramDeleteAsset.mockResolvedValue({ success: true, data: undefined })
    mockAiDiagramLoadAsset.mockResolvedValue({ success: false, data: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders preview with SVG content', async () => {
    renderElement()

    await act(async () => {
      await Promise.resolve() // IntersectionObserver callback
    })

    expect(screen.getByTestId('ai-diagram-element')).toBeDefined()
    expect(screen.getByTestId('ai-diagram-svg')).toBeDefined()
  })

  it('renders asset-missing state when no svgContent and load fails', async () => {
    renderElement({ svgContent: undefined, svgPersisted: true })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve() // loadSvg async
    })

    expect(screen.getByTestId('ai-diagram-missing')).toBeDefined()
  })

  it('renders caption input', async () => {
    renderElement()

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByTestId('ai-diagram-caption-input')).toBeDefined()
  })

  it('updates caption on blur', async () => {
    renderElement({ caption: '旧标题' })

    await act(async () => {
      await Promise.resolve()
    })

    const captionInput = screen.getByTestId('ai-diagram-caption-input')
    fireEvent.change(captionInput, { target: { value: '新标题' } })
    fireEvent.blur(captionInput)

    expect(mockSetNodes).toHaveBeenCalledWith({ caption: '新标题' }, { at: [0] })
  })

  it('calls modal.confirm on delete button click', async () => {
    renderElement()

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByTestId('ai-diagram-delete-btn'))

    expect(mockModalConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认删除',
        okText: '删除',
      })
    )
  })

  it('removes node and deletes asset on delete confirmation', async () => {
    renderElement()

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByTestId('ai-diagram-delete-btn'))

    const confirmConfig = mockModalConfirm.mock.calls[0][0] as { onOk: () => void }
    confirmConfig.onOk()

    expect(mockRemoveNodes).toHaveBeenCalledWith({ at: [0] })
    expect(mockAiDiagramDeleteAsset).toHaveBeenCalledWith({
      projectId: 'proj-test',
      assetFileName: 'ai-diagram-abc.svg',
    })
  })

  it('calls requestRegenerate with node metadata on regenerate button click', async () => {
    renderElement({ prompt: '微服务架构', style: 'blueprint', diagramType: 'data-flow' })

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByTestId('ai-diagram-regenerate-btn'))

    expect(mockRequestRegenerate).toHaveBeenCalledWith({
      diagramId: 'uuid-ai-test',
      assetFileName: 'ai-diagram-abc.svg',
      caption: '',
      prompt: '微服务架构',
      style: 'blueprint',
      diagramType: 'data-flow',
    })
  })

  it('calls requestRegenerate on edit-description button click', async () => {
    renderElement()

    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByTestId('ai-diagram-edit-btn'))

    expect(mockRequestRegenerate).toHaveBeenCalledTimes(1)
  })

  it('auto-retries save when svgPersisted is false', async () => {
    renderElement({ svgPersisted: false })

    await act(async () => {
      await Promise.resolve() // IntersectionObserver
      await Promise.resolve() // auto-save effect
    })

    expect(mockAiDiagramSaveAsset).toHaveBeenCalledWith({
      projectId: 'proj-test',
      diagramId: 'uuid-ai-test',
      svgContent: '<svg><rect/></svg>',
      assetFileName: 'ai-diagram-abc.svg',
    })

    expect(mockSetNodes).toHaveBeenCalledWith({ svgPersisted: true }, { at: [0] })
  })

  it('syncs svgHtml when node.svgContent changes externally (regenerate)', async () => {
    const { rerender } = renderElement({ svgContent: '<svg>old</svg>' })

    await act(async () => {
      await Promise.resolve()
    })

    // Verify old content displayed
    expect(screen.getByTestId('ai-diagram-svg').innerHTML).toContain('old')

    // Simulate external node update (regenerate sets new svgContent)
    const updatedElement = {
      type: 'ai-diagram' as const,
      diagramId: 'uuid-ai-test',
      assetFileName: 'ai-diagram-abc.svg',
      caption: '',
      prompt: '新描述',
      style: 'flat-icon',
      diagramType: 'architecture',
      svgContent: '<svg>new-regenerated</svg>',
      svgPersisted: false,
      children: [{ text: '' }],
    }

    rerender(
      <AiDiagramElement element={updatedElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </AiDiagramElement>
    )

    await act(async () => {
      await Promise.resolve()
    })

    // New content should be displayed
    expect(screen.getByTestId('ai-diagram-svg').innerHTML).toContain('new-regenerated')
  })
})
