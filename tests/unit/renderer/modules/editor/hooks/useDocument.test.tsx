import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useDocument } from '@modules/editor/hooks/useDocument'

const {
  mockSaveDocumentSync,
  mockResetDocument,
  mockMessageInfo,
  mockDocumentStoreState,
  mockProjectStoreState,
} = vi.hoisted(() => ({
  mockSaveDocumentSync: vi.fn(),
  mockResetDocument: vi.fn(),
  mockMessageInfo: vi.fn(),
  mockDocumentStoreState: {
    autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null as string | null },
    content: '',
    saveDocumentSync: vi.fn(),
    resetDocument: vi.fn(),
  },
  mockProjectStoreState: {
    currentProject: { rootPath: '/tmp/projects/proj-1' },
  },
}))

mockDocumentStoreState.saveDocumentSync = mockSaveDocumentSync
mockDocumentStoreState.resetDocument = mockResetDocument

vi.mock('antd', () => ({
  message: {
    info: mockMessageInfo,
  },
}))

vi.mock('@renderer/stores', () => ({
  useDocumentStore: vi.fn((selector: (state: typeof mockDocumentStoreState) => unknown) =>
    selector(mockDocumentStoreState)
  ),
  useProjectStore: vi.fn((selector: (state: typeof mockProjectStoreState) => unknown) =>
    selector(mockProjectStoreState)
  ),
}))

function HookHarness({
  projectId,
  flushEditorContent,
}: {
  projectId: string
  flushEditorContent?: () => string | null
}): null {
  useDocument(projectId, flushEditorContent)
  return null
}

describe('@story-3-1 useDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDocumentStoreState.autoSave = {
      dirty: false,
      saving: false,
      lastSavedAt: null,
      error: null,
    }
    mockDocumentStoreState.content = ''
    mockProjectStoreState.currentProject = { rootPath: '/tmp/projects/proj-1' }
    mockSaveDocumentSync.mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('flushes the latest editor content synchronously on beforeunload', () => {
    mockDocumentStoreState.content = '# Old'
    const flushEditorContent = vi.fn().mockReturnValue('# Latest')

    render(<HookHarness projectId="proj-1" flushEditorContent={flushEditorContent} />)

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent & {
      returnValue?: string
    }
    window.dispatchEvent(event)

    expect(flushEditorContent).toHaveBeenCalledTimes(1)
    expect(mockSaveDocumentSync).toHaveBeenCalledWith('proj-1', '/tmp/projects/proj-1', '# Latest')
    expect(event.defaultPrevented).toBe(false)
  })

  it('prevents close when the synchronous flush fails', () => {
    mockDocumentStoreState.autoSave = {
      dirty: true,
      saving: false,
      lastSavedAt: null,
      error: null,
    }
    mockSaveDocumentSync.mockReturnValue(false)

    render(<HookHarness projectId="proj-1" flushEditorContent={() => '# Draft'} />)

    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent & {
      returnValue?: string
    }
    window.dispatchEvent(event)

    expect(mockSaveDocumentSync).toHaveBeenCalled()
    expect(mockSaveDocumentSync).toHaveBeenLastCalledWith(
      'proj-1',
      '/tmp/projects/proj-1',
      '# Draft'
    )
    expect(event.defaultPrevented).toBe(true)
  })

  it('intercepts Cmd/Ctrl+S and shows the auto-save toast', () => {
    mockDocumentStoreState.autoSave = {
      dirty: false,
      saving: false,
      lastSavedAt: '2026-03-22T08:00:00.000Z',
      error: null,
    }

    render(<HookHarness projectId="proj-1" />)

    const event = new KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      cancelable: true,
    })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(mockMessageInfo).toHaveBeenCalledWith('已自动保存', 1)
  })
})
