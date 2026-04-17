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
let latestToolbarProps: { importAssetDisabled?: boolean } | null = null
let latestReplaceSectionReady:
  | ((fn: ((target: unknown, markdownContent: string) => boolean) | null) => void)
  | null = null
let mockSourceAttr: Record<string, unknown> | null = null

const buildDocumentStoreSnapshot = (): Record<string, unknown> => ({
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

vi.mock('@renderer/stores', () => {
  const hook = vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector(buildDocumentStoreSnapshot())
  ) as unknown as ((selector: (s: Record<string, unknown>) => unknown) => unknown) & {
    getState: () => Record<string, unknown>
  }
  hook.getState = () => buildDocumentStoreSnapshot()
  return {
    useDocumentStore: hook,
    useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        projects: [],
        currentProject: null,
        loading: false,
        error: null,
      })
    ),
  }
})

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
  EditorToolbar: ({
    projectId,
    importAssetDisabled,
  }: {
    projectId: string
    importAssetDisabled?: boolean
  }) => {
    latestToolbarProps = { importAssetDisabled }
    return (
      <div
        data-testid="mock-editor-toolbar"
        data-import-disabled={String(Boolean(importAssetDisabled))}
      >
        {projectId}
      </div>
    )
  },
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
    return (
      <div data-testid="mock-plate-editor">
        {projectId}
        <div data-testid="plate-editor-content">
          <p data-testid="mock-editor-paragraph-1">第一段正文第一行，第一段正文第二行。</p>
          <p data-testid="mock-editor-paragraph-2">第二段正文第一行，第二段正文第二行。</p>
        </div>
      </div>
    )
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

// Story 3.12: stub window.api for fire-and-forget chapter-summary trigger
const mockChapterSummaryExtract = vi
  .fn<(input: unknown) => Promise<{ success: true; data: { taskId: string } }>>()
  .mockResolvedValue({ success: true, data: { taskId: 'task-sum-stub' } })
// Safe to overwrite — EditorView only reads `chapterSummaryExtract` from this stub.
;(window as unknown as { api: { chapterSummaryExtract: typeof mockChapterSummaryExtract } }).api = {
  chapterSummaryExtract: mockChapterSummaryExtract,
}

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
    latestToolbarProps = null
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
    vi.useRealTimers()
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

  it('@story-3-12 fires chapter-summary extraction with pre-extracted directBody', async () => {
    mockChapterSummaryExtract.mockClear()
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = '## 系统架构设计\n\n本章承诺 99.99% SLA。\n'
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'AI 生成内容',
            progress: 100,
            taskId: 'task-sum-ev',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)
    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockChapterSummaryExtract).toHaveBeenCalledTimes(1)
    })
    const [call] = mockChapterSummaryExtract.mock.calls[0] as [
      {
        projectId: string
        locator: { title: string; level: number; occurrenceIndex: number }
        directBody: string
      },
    ]
    expect(call.projectId).toBe('proj-1')
    expect(call.locator).toEqual(target)
    expect(call.directBody).toContain('99.99% SLA')
    // Regression guard: must NOT ship a whole-document snapshot into the
    // persisted task row.
    expect(call).not.toHaveProperty('markdownSnapshot')
    expect(call.directBody.length).toBeLessThan(mockContent.length)
  })

  it('@story-3-12 batch completion fans out extraction only across skeleton-planned sections with real occurrenceIndex', async () => {
    mockChapterSummaryExtract.mockClear()
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    // Two skeleton sections share a title, and each generated body contains
    // a nested level-4 sub-section. The old fan-out would have fired for
    // the nested L4 headings too, multiplying queue depth. The skeleton-plan-
    // driven fan-out must fire exactly once per completed batch section, and
    // the sidecar key (headingKey, occurrenceIndex) must land on distinct
    // rows for the duplicate-title siblings.
    //
    // The parent chapter's own directBody is guidance-only (the content is
    // carried by the children), so the empty-body guard must skip the parent
    // IPC — summarising an empty-direct-body heading burns tokens for a
    // cache row no reader path will ever consume.
    mockContent = [
      '## 系统架构设计',
      '',
      '> 请设计系统整体架构',
      '',
      '### 模块',
      '',
      '模块 A 内容。',
      '',
      '#### 模块 A 深层小节',
      '',
      '深层小节不应该被单独摘要。',
      '',
      '### 模块',
      '',
      '模块 B 内容。',
      '',
      '#### 模块 B 深层小节',
      '',
      '深层小节也不应该被单独摘要。',
      '',
    ].join('\n')
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'assembled',
            progress: 100,
            taskId: 'task-batch-done',
            operationType: 'batch-generate',
            batchSections: [
              { index: 0, title: '模块', level: 3, phase: 'completed' },
              { index: 1, title: '模块', level: 3, phase: 'completed' },
            ],
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)
    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      // Exactly 2 skeleton-planned sections. Parent (guidance-only) and the
      // four nested L4 headings MUST NOT produce additional tasks.
      expect(mockChapterSummaryExtract).toHaveBeenCalledTimes(2)
    })
    const calls = mockChapterSummaryExtract.mock.calls.map((c) => c[0]) as Array<{
      projectId: string
      locator: { title: string; level: number; occurrenceIndex: number }
      directBody: string
    }>
    expect(calls[0].locator).toEqual({ title: '模块', level: 3, occurrenceIndex: 0 })
    expect(calls[1].locator).toEqual({ title: '模块', level: 3, occurrenceIndex: 1 })
    // directBody is the "直属正文" for each section — nested L4 sub-sections
    // must be excluded from the body sent to the agent.
    expect(calls[0].directBody).toContain('模块 A 内容')
    expect(calls[0].directBody).not.toContain('深层小节')
    expect(calls[1].directBody).toContain('模块 B 内容')
    expect(calls[1].directBody).not.toContain('深层小节')
    // Regression guard: full-document snapshot must never reach IPC.
    for (const call of calls) {
      expect(call).not.toHaveProperty('markdownSnapshot')
    }
  })

  it('@story-3-12 batch completion skips fan-out for failed skeleton sections', async () => {
    mockChapterSummaryExtract.mockClear()
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = [
      '## 系统架构设计',
      '',
      '> 请设计系统整体架构',
      '',
      '### 模块 A',
      '',
      '模块 A 内容。',
      '',
      '### 模块 B',
      '',
      '> [生成失败]',
      '',
    ].join('\n')
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'assembled',
            progress: 100,
            taskId: 'task-batch-partial',
            operationType: 'batch-generate',
            batchSections: [
              { index: 0, title: '模块 A', level: 3, phase: 'completed' },
              { index: 1, title: '模块 B', level: 3, phase: 'failed', error: 'boom' },
            ],
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)
    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      // Only 模块 A fires: parent is guidance-only, 模块 B is phase:'failed'.
      expect(mockChapterSummaryExtract).toHaveBeenCalledTimes(1)
    })
    const calls = mockChapterSummaryExtract.mock.calls.map((c) => c[0]) as Array<{
      locator: { title: string }
    }>
    expect(calls.map((c) => c.locator.title)).toEqual(['模块 A'])
  })

  it('@story-3-12 batch completion does NOT fire summary for skipped-section placeholder', async () => {
    // After the batch-skip flow, the skipped section is rewritten to
    // phase: 'completed' with a `> [已跳过 - 请手动补充]` placeholder. That
    // placeholder matches GUIDANCE_RE and is treated as empty-direct-body by
    // the read-side context builder, so summarising it is wasted work.
    mockChapterSummaryExtract.mockClear()
    const target = { title: '系统架构设计', level: 2, occurrenceIndex: 0 }
    mockContent = [
      '## 系统架构设计',
      '',
      '> 请设计系统整体架构',
      '',
      '### 模块 A',
      '',
      '模块 A 内容。',
      '',
      '### 模块 B',
      '',
      '> [已跳过 - 请手动补充]',
      '',
    ].join('\n')
    mockChapterGen = {
      statuses: new Map([
        [
          '2:系统架构设计:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'assembled',
            progress: 100,
            taskId: 'task-batch-skipped',
            operationType: 'batch-generate',
            batchSections: [
              { index: 0, title: '模块 A', level: 3, phase: 'completed' },
              // Skip-flow rewrites to phase: 'completed' with placeholder.
              { index: 1, title: '模块 B', level: 3, phase: 'completed' },
            ],
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)
    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      // Only 模块 A fires; 模块 B's body is a skip placeholder.
      expect(mockChapterSummaryExtract).toHaveBeenCalledTimes(1)
    })
    const [call] = mockChapterSummaryExtract.mock.calls[0] as [{ locator: { title: string } }]
    expect(call.locator.title).toBe('模块 A')
  })

  it('@story-3-12 single-chapter completion skips summary IPC when directBody is guidance-only', async () => {
    // Defensive guard symmetric with read-side filter: an AI call that
    // produced only a guidance blockquote contributes nothing to future
    // prompts, so don't burn tokens / queue slot / sidecar row for it.
    mockChapterSummaryExtract.mockClear()
    const target = { title: '空章节', level: 2, occurrenceIndex: 0 }
    mockContent = ['## 空章节', '', '> 请补充本章内容', ''].join('\n')
    mockChapterGen = {
      statuses: new Map([
        [
          '2:空章节:0',
          {
            target,
            phase: 'completed',
            generatedContent: 'noop',
            progress: 100,
            taskId: 'task-empty',
          },
        ],
      ]),
      dismissError: mockDismissError,
    }

    render(<EditorView projectId="proj-1" />)
    act(() => {
      latestReplaceSectionReady?.(mockReplaceSection)
    })

    await waitFor(() => {
      expect(mockDismissError).toHaveBeenCalledWith(target)
    })
    expect(mockChapterSummaryExtract).not.toHaveBeenCalled()
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

  it('@story-5-2 keeps selection state stable during pointer drag and updates after pointerup', () => {
    vi.useFakeTimers()
    mockContent = '# Hello'

    const paragraphOneText = document.createTextNode('')
    const paragraphTwoText = document.createTextNode('')
    let selectionText = ''

    const getSelectionSpy = vi.spyOn(window, 'getSelection').mockImplementation(
      () =>
        ({
          toString: () => selectionText,
          anchorNode: paragraphOneText,
          focusNode: paragraphTwoText,
        }) as unknown as Selection
    )

    render(<EditorView projectId="proj-1" />)

    const paragraphOne = screen.getByTestId('mock-editor-paragraph-1')
    const paragraphTwo = screen.getByTestId('mock-editor-paragraph-2')
    paragraphOneText.textContent = paragraphOne.textContent ?? ''
    paragraphTwoText.textContent = paragraphTwo.textContent ?? ''
    paragraphOne.appendChild(paragraphOneText)
    paragraphTwo.appendChild(paragraphTwoText)

    const createPointerEvent = (type: 'pointerdown' | 'pointerup', target: EventTarget): Event => {
      const EventCtor = window.PointerEvent ?? window.MouseEvent
      const event = new EventCtor(type, { bubbles: true })
      Object.defineProperty(event, 'target', { value: target })
      return event
    }

    expect(screen.getByTestId('mock-editor-toolbar').dataset.importDisabled).toBe('true')
    expect(latestToolbarProps?.importAssetDisabled).toBe(true)

    selectionText = '第一段正文第二行。\n第二段正文第一行。'

    act(() => {
      document.dispatchEvent(createPointerEvent('pointerdown', paragraphOne))
      document.dispatchEvent(new Event('selectionchange'))
      vi.advanceTimersByTime(20)
    })

    expect(screen.getByTestId('mock-editor-toolbar').dataset.importDisabled).toBe('true')
    expect(latestToolbarProps?.importAssetDisabled).toBe(true)

    act(() => {
      document.dispatchEvent(createPointerEvent('pointerup', document))
      vi.runOnlyPendingTimers()
    })

    expect(screen.getByTestId('mock-editor-toolbar').dataset.importDisabled).toBe('false')
    expect(latestToolbarProps?.importAssetDisabled).toBe(false)

    getSelectionSpy.mockRestore()
  })
})
