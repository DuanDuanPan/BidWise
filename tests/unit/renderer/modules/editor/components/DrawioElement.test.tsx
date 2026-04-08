import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockFindPath = vi.fn(() => [0])
const mockSetNodes = vi.fn()
const mockRemoveNodes = vi.fn()

vi.mock('platejs/react', () => ({
  PlateElement: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

vi.mock('@renderer/stores', () => ({
  useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ currentProject: { id: 'proj-1' } })
  ),
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ content: '', loading: false, error: null })
  ),
}))

const mockDrawioSaveAsset = vi.fn().mockResolvedValue({ success: true, data: {} })
const mockDrawioLoadAsset = vi.fn().mockResolvedValue({ success: false })
const mockDrawioDeleteAsset = vi.fn().mockResolvedValue({ success: true })

vi.stubGlobal('api', {
  drawioSaveAsset: mockDrawioSaveAsset,
  drawioLoadAsset: mockDrawioLoadAsset,
  drawioDeleteAsset: mockDrawioDeleteAsset,
})

vi.mock('@modules/editor/components/DrawioEditor', () => ({
  DrawioEditor: () => <div data-testid="mock-drawio-editor">DrawioEditor</div>,
}))

import { DrawioElement } from '@modules/editor/components/DrawioElement'

const baseElement = {
  type: 'drawio' as const,
  diagramId: 'uuid-1',
  assetFileName: 'diagram-abc.drawio',
  caption: '架构图',
  xml: '<mxGraphModel/>',
  pngDataUrl: 'data:image/png;base64,abc',
  children: [{ text: '' }],
}

describe('@story-3-7 DrawioElement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders preview image when xml and pngDataUrl are present', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const img = screen.getByTestId('drawio-preview-img') as HTMLImageElement
    expect(img.src).toContain('data:image/png;base64')
    expect(img.alt).toBe('架构图')
  })

  it('renders caption input with correct value', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const captionInput = screen.getByTestId('drawio-caption-input') as HTMLInputElement
    expect(captionInput.value).toBe('架构图')
  })

  it('updates node data when caption changes on blur', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const captionInput = screen.getByTestId('drawio-caption-input') as HTMLInputElement
    fireEvent.change(captionInput, { target: { value: '新标题' } })
    fireEvent.blur(captionInput)

    expect(mockSetNodes).toHaveBeenCalledWith({ caption: '新标题' }, expect.any(Object))
  })

  it('removes node on delete button click', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const deleteBtn = screen.getByTestId('drawio-delete-btn')
    fireEvent.click(deleteBtn)

    expect(mockRemoveNodes).toHaveBeenCalledWith({ at: [0] })
  })

  it('calls drawioDeleteAsset on delete (best-effort)', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const deleteBtn = screen.getByTestId('drawio-delete-btn')
    fireEvent.click(deleteBtn)

    expect(mockDrawioDeleteAsset).toHaveBeenCalledWith({
      projectId: 'proj-1',
      fileName: 'diagram-abc.drawio',
    })
  })

  it('enters editing mode on double-click of preview', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const preview = screen.getByTestId('drawio-preview')
    fireEvent.doubleClick(preview)

    expect(screen.getByTestId('mock-drawio-editor')).toBeDefined()
  })

  it('enters editing mode on edit button click', () => {
    render(
      <DrawioElement element={baseElement} attributes={{} as never} nodeProps={{} as never}>
        <span />
      </DrawioElement>
    )

    const editBtn = screen.getByTestId('drawio-edit-btn')
    fireEvent.click(editBtn)

    expect(screen.getByTestId('mock-drawio-editor')).toBeDefined()
  })
})
