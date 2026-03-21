import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { PlateEditor } from '@modules/editor/components/PlateEditor'

const mockUpdateContent = vi.fn()
const mockDeserialize = vi.fn((_editor: unknown, markdown: string) => [
  { type: 'p', children: [{ text: markdown }] },
])
const mockSerialize = vi.fn(() => '# Serialized')
const mockSetValue = vi.fn()

const mockEditor = {
  api: {
    markdown: {
      serialize: mockSerialize,
    },
  },
  tf: {
    setValue: mockSetValue,
  },
}

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      updateContent: mockUpdateContent,
      content: '',
      loading: false,
      error: null,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
    })
  ),
}))

vi.mock('@modules/editor/serializer', () => ({
  deserializeFromMarkdown: vi.fn((editor: unknown, markdown: string) =>
    mockDeserialize(editor, markdown)
  ),
  serializeToMarkdown: vi.fn(() => mockSerialize()),
}))

vi.mock('platejs/react', () => ({
  createPlateEditor: vi.fn(() => ({
    api: {
      markdown: {
        deserialize: mockDeserialize,
      },
    },
  })),
  usePlateEditor: vi.fn(() => mockEditor),
  Plate: ({
    children,
    onValueChange,
  }: {
    children: ReactNode
    onValueChange?: (options: { editor: unknown; value: unknown[] }) => void
  }) => (
    <div>
      <button
        type="button"
        data-testid="trigger-value-change"
        onClick={() => onValueChange?.({ editor: mockEditor, value: [] })}
      >
        Trigger
      </button>
      {children}
    </div>
  ),
  PlateContent: ({
    className,
    ...props
  }: HTMLAttributes<HTMLDivElement> & { placeholder?: string }) => (
    <div {...props} className={className} />
  ),
}))

describe('PlateEditor', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    mockSerialize.mockReturnValue('# Serialized')
    mockDeserialize.mockImplementation((_editor: unknown, markdown: string) => [
      { type: 'p', children: [{ text: markdown }] },
    ])
    mockSetValue.mockReset()

    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        callback({
          didTimeout: false,
          timeRemaining: () => 50,
        } as IdleDeadline)
        return 1
      })
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())
  })

  afterEach(() => {
    cleanup()
  })

  it('mounts and renders the editor content area', () => {
    render(<PlateEditor initialContent="" projectId="proj-1" />)
    const editorEl = screen.getByTestId('plate-editor-content')
    expect(editorEl).toBeDefined()
    expect(editorEl.className).toContain('[&_h1]:text-2xl')
    expect(editorEl.className).toContain('[&_h4]:text-sm')
  })

  it('registers a synchronous flush handler', () => {
    const onSyncFlushReady = vi.fn()

    render(
      <PlateEditor
        initialContent="# Heading"
        projectId="proj-1"
        onSyncFlushReady={onSyncFlushReady}
      />
    )

    expect(onSyncFlushReady).toHaveBeenCalledTimes(1)
    expect(typeof onSyncFlushReady.mock.calls[0]?.[0]).toBe('function')
  })

  it('hydrates the editor when external initialContent changes', async () => {
    const { rerender } = render(<PlateEditor initialContent="" projectId="proj-1" />)

    rerender(<PlateEditor initialContent="# Heading" projectId="proj-1" />)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith([{ type: 'p', children: [{ text: '# Heading' }] }])
    })
  })

  it('serializes on change after debounce and updates the document store', async () => {
    vi.useFakeTimers()

    render(<PlateEditor initialContent="" projectId="proj-1" />)

    fireEvent.click(screen.getByTestId('trigger-value-change'))
    expect(mockUpdateContent).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(300)

    expect(mockSerialize).toHaveBeenCalledTimes(1)
    expect(mockUpdateContent).toHaveBeenCalledWith('# Serialized', 'proj-1')
  })
})
