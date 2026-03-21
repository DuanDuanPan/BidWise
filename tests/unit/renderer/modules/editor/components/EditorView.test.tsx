import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorView } from '@modules/editor/components/EditorView'

const mockLoadDocument = vi.fn().mockResolvedValue(undefined)

let mockLoading = false
let mockError: string | null = null
let mockContent = ''

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      loading: mockLoading,
      error: mockError,
      content: mockContent,
      loadDocument: mockLoadDocument,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      updateContent: vi.fn(),
      saveDocument: vi.fn(),
      resetDocument: vi.fn(),
    })
  ),
}))

vi.mock('@modules/editor/hooks/useDocument', () => ({
  useDocument: vi.fn(),
}))

vi.mock('@modules/editor/components/PlateEditor', () => ({
  PlateEditor: ({ projectId }: { projectId: string }) => (
    <div data-testid="mock-plate-editor">{projectId}</div>
  ),
}))

describe('EditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoading = false
    mockError = null
    mockContent = ''
  })

  it('should show skeleton when loading', () => {
    mockLoading = true
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('editor-skeleton')).toBeDefined()
  })

  it('should show error alert on error', () => {
    mockError = '加载失败'
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('editor-error')).toBeDefined()
  })

  it('should show PlateEditor when loaded', () => {
    mockContent = '# Hello'
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('mock-plate-editor')).toBeDefined()
  })

  it('should call loadDocument on mount', () => {
    render(<EditorView projectId="proj-1" />)
    expect(mockLoadDocument).toHaveBeenCalledWith('proj-1')
  })
})
