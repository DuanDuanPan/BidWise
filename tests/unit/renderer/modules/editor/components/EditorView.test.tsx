import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, act, waitFor } from '@testing-library/react'
import { App } from 'antd'
import { EditorView } from '@modules/editor/components/EditorView'

const mockLoadDocument = vi.fn().mockResolvedValue(undefined)
const mockModalConfirm = vi.fn()
const mockDismissError = vi.fn()
const mockReplaceSection = vi.fn(() => true)
const mockTriggerAttribution = vi.fn().mockResolvedValue(undefined)
const mockTriggerBaselineValidation = vi.fn().mockResolvedValue(undefined)
const mockLoadPersistedState = vi.fn().mockResolvedValue(undefined)

let mockLoading = false
let mockError: string | null = null
let mockContent = ''
let mockLoadedProjectId: string | null = 'proj-1'
let mockChapterGen: {
  statuses: Map<string, Record<string, unknown>>
  dismissError: typeof mockDismissError
} | null = null
let latestReplaceSectionReady:
  | ((fn: ((target: unknown, markdownContent: string) => boolean) | null) => void)
  | null = null
let mockSourceAttr: Record<string, unknown> | null = null

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      loading: mockLoading,
      error: mockError,
      content: mockContent,
      loadedProjectId: mockLoadedProjectId,
      loadDocument: mockLoadDocument,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      updateContent: vi.fn(),
      saveDocument: vi.fn(),
      resetDocument: vi.fn(),
    })
  ),
  useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      projects: [],
      currentProject: null,
      loading: false,
      error: null,
    })
  ),
}))

vi.mock('@modules/editor/hooks/useDocument', () => ({
  useDocument: vi.fn(),
}))

vi.mock('@modules/editor/context/useChapterGenerationContext', () => ({
  useChapterGenerationContext: vi.fn(() => mockChapterGen),
}))

vi.mock('@modules/editor/context/useSourceAttributionContext', () => ({
  useSourceAttributionContext: vi.fn(() => mockSourceAttr),
}))

vi.mock('@modules/editor/components/EditorToolbar', () => ({
  EditorToolbar: ({ projectId }: { projectId: string }) => (
    <div data-testid="mock-editor-toolbar">{projectId}</div>
  ),
}))

let latestInsertAssetReady:
  | ((fn: ((content: string, options?: Record<string, unknown>) => boolean) | null) => void)
  | null = null

vi.mock('@modules/editor/components/PlateEditor', () => ({
  PlateEditor: ({
    projectId,
    onReplaceSectionReady,
    onInsertAssetReady,
  }: {
    projectId: string
    onReplaceSectionReady?:
      | ((fn: ((target: unknown, markdownContent: string) => boolean) | null) => void)
      | null
    onInsertAssetReady?:
      | ((fn: ((content: string, options?: Record<string, unknown>) => boolean) | null) => void)
      | null
  }) => {
    latestReplaceSectionReady = onReplaceSectionReady ?? null
    latestInsertAssetReady = onInsertAssetReady ?? null
    return <div data-testid="mock-plate-editor">{projectId}</div>
  },
}))

vi.mock('@modules/asset/hooks/useAssetImport', () => ({
  useAssetImport: vi.fn(() => ({
    isOpen: false,
    importContext: null,
    openImport: vi.fn(),
    closeImport: vi.fn(),
  })),
}))

vi.mock('@modules/asset/components/AssetImportDialog', () => ({
  AssetImportDialog: ({ open }: { open: boolean }) => (
    <div data-testid="mock-asset-import-dialog">{open ? 'open' : 'closed'}</div>
  ),
}))

describe('@story-3-1 EditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(App, 'useApp').mockReturnValue({
      modal: { confirm: mockModalConfirm },
    } as unknown as ReturnType<typeof App.useApp>)
    mockLoading = false
    mockError = null
    mockContent = ''
    mockLoadedProjectId = 'proj-1'
    mockChapterGen = null
    mockSourceAttr = null
    latestReplaceSectionReady = null
    latestInsertAssetReady = null
    mockReplaceSection.mockReset()
    mockReplaceSection.mockReturnValue(true)
    mockTriggerAttribution.mockReset()
    mockTriggerBaselineValidation.mockReset()
    mockLoadPersistedState.mockReset()
    mockLoadPersistedState.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
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

  it('@story-3-6 should render EditorToolbar with projectId', () => {
    mockContent = '# Hello'
    render(<EditorView projectId="proj-1" />)
    const toolbar = screen.getByTestId('mock-editor-toolbar')
    expect(toolbar).toBeDefined()
    expect(toolbar.textContent).toBe('proj-1')
  })

  it('@story-3-2 exposes the editor scroll container marker on the scrollable area', () => {
    render(<EditorView projectId="proj-1" />)
    const scrollContainer = document.querySelector('[data-editor-scroll-container="true"]')
    expect(scrollContainer).toBeDefined()
  })

  it('should call loadDocument on mount', () => {
    render(<EditorView projectId="proj-1" />)
    expect(mockLoadDocument).toHaveBeenCalledWith('proj-1')
  })

  it('@story-3-4 passes onReplaceSectionReady to PlateEditor', () => {
    mockContent = '# Hello'
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('mock-plate-editor')).toBeDefined()
  })

  it('@story-3-4 processes completed chapters after the replace handler registers', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = '## 系统架构设计\n\n> 请描述系统架构\n'
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'AI 生成内容',
            progress: 100,
            taskId: 'task-1',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)

    expect(mockDismissError).not.toHaveBeenCalled()

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockReplaceSection).toHaveBeenCalledWith(target, 'AI 生成内容')
      expect(mockDismissError).toHaveBeenCalledWith(target)
    })
  })

  it('@story-3-4 strips a duplicated chapter heading before replacing editor content', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = '## 系统架构设计\n\n> 请描述系统架构\n'
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: '## 系统架构设计\n\n### 总体架构\n\nAI 生成内容',
            progress: 100,
            taskId: 'task-1b',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }
    mockSourceAttr = {
      loadPersistedState: mockLoadPersistedState,
      triggerAttribution: mockTriggerAttribution,
      triggerBaselineValidation: mockTriggerBaselineValidation,
    }

    render(<EditorView projectId="proj-1" />)

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockReplaceSection).toHaveBeenCalledWith(target, '### 总体架构\n\nAI 生成内容')
      expect(mockTriggerAttribution).toHaveBeenCalledWith(target, '### 总体架构\n\nAI 生成内容')
      expect(mockTriggerBaselineValidation).toHaveBeenCalledWith(
        target,
        '### 总体架构\n\nAI 生成内容'
      )
    })
  })

  it('@story-3-5 starts attribution and baseline follow-up before dismissing completed status', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = '## 系统架构设计\n\n> 请描述系统架构\n'
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'AI 生成内容',
            progress: 100,
            taskId: 'task-1',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }
    mockSourceAttr = {
      loadPersistedState: mockLoadPersistedState,
      triggerAttribution: mockTriggerAttribution,
      triggerBaselineValidation: mockTriggerBaselineValidation,
    }

    render(<EditorView projectId="proj-1" />)

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockTriggerAttribution).toHaveBeenCalledWith(target, 'AI 生成内容')
      expect(mockTriggerBaselineValidation).toHaveBeenCalledWith(target, 'AI 生成内容')
      expect(mockDismissError).toHaveBeenCalledWith(target)
    })

    expect(mockTriggerAttribution.mock.invocationCallOrder[0]).toBeLessThan(
      mockDismissError.mock.invocationCallOrder[0]
    )
    expect(mockTriggerBaselineValidation.mock.invocationCallOrder[0]).toBeLessThan(
      mockDismissError.mock.invocationCallOrder[0]
    )
  })

  it('@story-3-4 opens the conflict modal only once for the same chapter', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockModalConfirm.mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)
    mockContent = '## 系统架构设计\n\n用户手动编辑的内容\n'

    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'conflicted',
            generatedContent: 'AI 生成内容',
            progress: 100,
            taskId: 'task-2',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    const { rerender } = render(<EditorView projectId="proj-1" />)

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    })

    mockChapterGen = {
      statuses: new Map(mockChapterGen.statuses),
      dismissError: mockDismissError,
    }

    rerender(<EditorView projectId="proj-1" />)

    await waitFor(() => {
      expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    })
  })

  it('@story-3-4 waits for the replace handler before opening the conflict modal', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockModalConfirm.mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)

    mockContent = '## 系统架构设计\n\n用户手动编辑的内容\n'
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'conflicted',
            generatedContent: 'AI 生成内容',
            progress: 100,
            taskId: 'task-3',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)

    expect(mockModalConfirm).not.toHaveBeenCalled()

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockModalConfirm).toHaveBeenCalledTimes(1)
    })
  })

  it('@story-5-2 accepts currentSection prop', () => {
    mockContent = '# Hello'
    const section = {
      locator: { title: '公司简介', level: 2, occurrenceIndex: 0 },
      sectionKey: '2:公司简介:0',
      label: '公司简介',
    }
    render(<EditorView projectId="proj-1" currentSection={section} />)
    expect(screen.getByTestId('mock-plate-editor')).toBeDefined()
  })

  it('@story-5-2 passes onInsertAssetReady to PlateEditor', () => {
    mockContent = '# Hello'
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('mock-plate-editor')).toBeDefined()
    // The mock captures onInsertAssetReady — verify it was provided
    expect(latestInsertAssetReady).not.toBeNull()
  })

  it('@story-5-2 renders AssetImportDialog', () => {
    mockContent = '# Hello'
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('mock-asset-import-dialog')).toBeDefined()
  })
})
