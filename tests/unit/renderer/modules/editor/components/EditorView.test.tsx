import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, act, waitFor } from '@testing-library/react'
import { Modal } from 'antd'
import { EditorView } from '@modules/editor/components/EditorView'

const mockLoadDocument = vi.fn().mockResolvedValue(undefined)
const mockDismissError = vi.fn()
const mockReplaceSection = vi.fn(() => true)

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
}))

vi.mock('@modules/editor/hooks/useDocument', () => ({
  useDocument: vi.fn(),
}))

vi.mock('@modules/editor/context/useChapterGenerationContext', () => ({
  useChapterGenerationContext: vi.fn(() => mockChapterGen),
}))

vi.mock('@modules/editor/components/PlateEditor', () => ({
  PlateEditor: ({
    projectId,
    onReplaceSectionReady,
  }: {
    projectId: string
    onReplaceSectionReady?:
      | ((fn: ((target: unknown, markdownContent: string) => boolean) | null) => void)
      | null
  }) => {
    latestReplaceSectionReady = onReplaceSectionReady ?? null
    return <div data-testid="mock-plate-editor">{projectId}</div>
  },
}))

describe('@story-3-1 EditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoading = false
    mockError = null
    mockContent = ''
    mockLoadedProjectId = 'proj-1'
    mockChapterGen = null
    latestReplaceSectionReady = null
    mockReplaceSection.mockReset()
    mockReplaceSection.mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
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

  it('@story-3-2 exposes the editor scroll container marker on the root element', () => {
    render(<EditorView projectId="proj-1" />)
    expect(screen.getByTestId('editor-view')).toHaveAttribute(
      'data-editor-scroll-container',
      'true'
    )
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

  it('@story-3-4 opens the conflict modal only once for the same chapter', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    const confirmSpy = vi
      .spyOn(Modal, 'confirm')
      .mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)
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
      expect(confirmSpy).toHaveBeenCalledTimes(1)
    })

    mockChapterGen = {
      statuses: new Map(mockChapterGen.statuses),
      dismissError: mockDismissError,
    }

    rerender(<EditorView projectId="proj-1" />)

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('@story-3-4 waits for the replace handler before opening the conflict modal', async () => {
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    const confirmSpy = vi
      .spyOn(Modal, 'confirm')
      .mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)

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

    expect(confirmSpy).not.toHaveBeenCalled()

    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1)
    })
  })
})
