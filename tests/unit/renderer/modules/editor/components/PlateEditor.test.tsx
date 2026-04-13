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
  createPlatePlugin: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    withComponent: vi.fn(() => ({ ...config })),
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

describe('@story-3-1 PlateEditor', () => {
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
    expect(editorEl.className).toContain('max-w-[800px]')
    expect(editorEl.className).toContain('leading-[1.9]')
    expect(editorEl.className).toContain('text-[14px]')
    expect(editorEl.className).toContain('text-[#4E5B6A]')
    expect(editorEl.className).toContain('[&_p]:my-4')
    expect(editorEl.className).toContain('[&_ul]:list-disc')
    expect(editorEl.className).toContain('[&_ol]:list-decimal')
    expect(editorEl.className).toContain('[&_li]:leading-[1.85]')
    expect(editorEl.className).toContain('[&_table]:border-collapse')
    expect(editorEl.className).toContain('[&_blockquote]:border-l-4')
    expect(editorEl.className).toContain('[&_pre]:overflow-x-auto')
    expect(editorEl.className).toContain('[&_code]:font-mono')
    expect((editorEl as HTMLDivElement).style.fontFamily).toContain('PingFang SC')
    expect((editorEl as HTMLDivElement).style.fontFamily).toContain('Microsoft YaHei')
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

  it('flushes the latest markdown synchronously without scheduling debounce save', () => {
    const onSyncFlushReady = vi.fn()

    render(
      <PlateEditor
        initialContent="# Heading"
        projectId="proj-1"
        onSyncFlushReady={onSyncFlushReady}
      />
    )

    const flush = onSyncFlushReady.mock.calls[0]?.[0] as (() => string) | undefined
    expect(flush).toBeDefined()

    const result = flush?.()

    expect(result).toBe('# Serialized')
    expect(mockSerialize).toHaveBeenCalledTimes(1)
    expect(mockUpdateContent).toHaveBeenCalledWith('# Serialized', 'proj-1', {
      scheduleSave: false,
    })
  })

  it('hydrates the editor when external initialContent changes', async () => {
    const { rerender } = render(<PlateEditor initialContent="" projectId="proj-1" />)

    rerender(<PlateEditor initialContent="# Heading" projectId="proj-1" />)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith([{ type: 'p', children: [{ text: '# Heading' }] }])
    })
  })

  it('@story-3-4 registers a replaceSectionContent handler via onReplaceSectionReady', () => {
    const onReplaceSectionReady = vi.fn()

    render(
      <PlateEditor
        initialContent="# Heading"
        projectId="proj-1"
        onReplaceSectionReady={onReplaceSectionReady}
      />
    )

    expect(onReplaceSectionReady).toHaveBeenCalledTimes(1)
    expect(typeof onReplaceSectionReady.mock.calls[0]?.[0]).toBe('function')
  })

  it('@story-3-4 replaceSectionContent replaces target section and persists to store', () => {
    const onReplaceSectionReady = vi.fn()
    mockSerialize.mockReturnValue('## Chapter 1\n\nOld content\n\n## Chapter 2\n\nKeep this')
    mockDeserialize.mockImplementation((_e: unknown, md: string) => [
      { type: 'p', children: [{ text: md }] },
    ])

    render(
      <PlateEditor
        initialContent="## Chapter 1\n\nOld content\n\n## Chapter 2\n\nKeep this"
        projectId="proj-1"
        onReplaceSectionReady={onReplaceSectionReady}
      />
    )

    const replaceSection = onReplaceSectionReady.mock.calls[0]?.[0] as
      | ((target: { title: string; level: number; occurrenceIndex: number }, md: string) => void)
      | undefined
    expect(replaceSection).toBeDefined()

    replaceSection?.({ title: 'Chapter 1', level: 2, occurrenceIndex: 0 }, 'New AI content')

    expect(mockSetValue).toHaveBeenCalled()
    expect(mockUpdateContent).toHaveBeenCalledWith(
      expect.stringContaining('New AI content'),
      'proj-1'
    )
  })

  it('@story-3-4 replaceSectionContent ignores heading-like lines inside fenced code blocks', () => {
    const onReplaceSectionReady = vi.fn()
    mockSerialize.mockReturnValue(
      '## Chapter 1\n\n```md\n## Fake Heading\n```\n\nReal content\n\n## Chapter 2\n\nKeep this'
    )
    mockDeserialize.mockImplementation((_e: unknown, md: string) => [
      { type: 'p', children: [{ text: md }] },
    ])

    render(
      <PlateEditor
        initialContent={
          '## Chapter 1\n\n```md\n## Fake Heading\n```\n\nReal content\n\n## Chapter 2\n\nKeep this'
        }
        projectId="proj-1"
        onReplaceSectionReady={onReplaceSectionReady}
      />
    )

    const replaceSection = onReplaceSectionReady.mock.calls[0]?.[0] as
      | ((target: { title: string; level: number; occurrenceIndex: number }, md: string) => void)
      | undefined

    replaceSection?.({ title: 'Chapter 1', level: 2, occurrenceIndex: 0 }, 'New AI content')

    expect(mockUpdateContent).toHaveBeenCalledWith(
      expect.not.stringContaining('## Fake Heading'),
      'proj-1'
    )
    expect(mockUpdateContent).toHaveBeenCalledWith(
      expect.stringContaining('## Chapter 2'),
      'proj-1'
    )
  })

  it('@story-3-8 registers an insertMermaid handler via onInsertMermaidReady', () => {
    const onInsertMermaidReady = vi.fn()

    render(
      <PlateEditor
        initialContent=""
        projectId="proj-1"
        onInsertMermaidReady={onInsertMermaidReady}
      />
    )

    expect(onInsertMermaidReady).toHaveBeenCalledTimes(1)
    expect(typeof onInsertMermaidReady.mock.calls[0]?.[0]).toBe('function')
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

  it('@story-5-2 registers an insertAsset handler via onInsertAssetReady', () => {
    const onInsertAssetReady = vi.fn()

    render(
      <PlateEditor initialContent="" projectId="proj-1" onInsertAssetReady={onInsertAssetReady} />
    )

    expect(onInsertAssetReady).toHaveBeenCalledTimes(1)
    expect(typeof onInsertAssetReady.mock.calls[0]?.[0]).toBe('function')
  })

  it('@story-5-2 exports InsertAssetFn type', async () => {
    const mod = await import('@modules/editor/components/PlateEditor')
    // InsertAssetFn is a type export, but we can verify the module exports PlateEditor
    // and the function signature is callable. We test via the onInsertAssetReady callback.
    expect(mod.PlateEditor).toBeDefined()
    // TypeScript compilation verifies the type export; here we just ensure the module loads.
  })
})
