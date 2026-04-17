import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useDocumentStore } from '@renderer/stores/documentStore'
import type { ApiResponse } from '@shared/ipc-types'
import type { ProposalDocument } from '@shared/models/proposal'

const mockDoc: ProposalDocument = {
  projectId: 'proj-1',
  content: '# Test',
  lastSavedAt: '2026-03-21T10:00:00.000Z',
  version: 1,
}

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    documentLoad: vi
      .fn<() => Promise<ApiResponse<ProposalDocument>>>()
      .mockResolvedValue({ success: true, data: mockDoc }),
    documentSave: vi.fn<() => Promise<ApiResponse<{ lastSavedAt: string }>>>().mockResolvedValue({
      success: true,
      data: { lastSavedAt: '2026-03-21T10:01:00.000Z' },
    }),
    documentSaveSync: vi.fn<() => ApiResponse<{ lastSavedAt: string }>>().mockReturnValue({
      success: true,
      data: { lastSavedAt: '2026-03-21T10:01:30.000Z' },
    }),
    ...overrides,
  })
}

describe('@story-3-1 documentStore', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mockApi()
    useDocumentStore.setState({
      content: '',
      loading: false,
      error: null,
      autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
    })
  })

  afterEach(() => {
    useDocumentStore.getState().resetDocument()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('loadDocument', () => {
    it('should set loading then content on success', async () => {
      const store = useDocumentStore.getState()
      const promise = store.loadDocument('proj-1')

      expect(useDocumentStore.getState().loading).toBe(true)
      await promise

      const state = useDocumentStore.getState()
      expect(state.loading).toBe(false)
      expect(state.content).toBe('# Test')
      expect(state.autoSave.lastSavedAt).toBe('2026-03-21T10:00:00.000Z')
    })

    it('should set error on IPC failure', async () => {
      mockApi({
        documentLoad: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'NOT_FOUND', message: '文档不存在' },
        }),
      })

      await useDocumentStore.getState().loadDocument('proj-1')
      expect(useDocumentStore.getState().error).toBe('文档不存在')
      expect(useDocumentStore.getState().loading).toBe(false)
    })
  })

  describe('updateContent', () => {
    it('should set content and mark dirty', () => {
      useDocumentStore.getState().updateContent('# Updated', 'proj-1')

      const state = useDocumentStore.getState()
      expect(state.content).toBe('# Updated')
      expect(state.autoSave.dirty).toBe(true)
    })

    it('blocks catastrophic shrink: 2000-char doc → 2-byte empty-editor is rejected', () => {
      useDocumentStore.setState({
        content: '# Real doc\n' + 'a'.repeat(2000),
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })

      useDocumentStore.getState().updateContent('\u200B\n', 'proj-1', {
        debugContext: { source: 'plate:debounced-serialize' },
      })

      const state = useDocumentStore.getState()
      expect(state.content).toContain('Real doc')
      expect(state.autoSave.dirty).toBe(false)
    })

    it('allows legitimate shrink within safety ratio (not catastrophic)', () => {
      useDocumentStore.setState({
        content: '# Real doc\n' + 'a'.repeat(200),
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })

      const shrunk = '# Real doc\n' + 'a'.repeat(100)
      useDocumentStore.getState().updateContent(shrunk, 'proj-1', {
        debugContext: { source: 'plate:debounced-serialize' },
      })

      expect(useDocumentStore.getState().content).toBe(shrunk)
    })

    it('allows shrink when prior content is short (bootstrap scenario)', () => {
      useDocumentStore.setState({
        content: '# short\n',
        autoSave: { dirty: false, saving: false, lastSavedAt: null, error: null },
      })

      useDocumentStore.getState().updateContent('\u200B\n', 'proj-1', {
        debugContext: { source: 'plate:debounced-serialize' },
      })

      expect(useDocumentStore.getState().content).toBe('\u200B\n')
    })

    it('debounces auto-save for 1 second and only persists the latest edit', async () => {
      vi.useFakeTimers()

      const documentSave = vi.fn().mockResolvedValue({
        success: true,
        data: { lastSavedAt: '2026-03-21T10:00:30.000Z' },
      })
      mockApi({ documentSave })

      useDocumentStore.getState().updateContent('# First draft', 'proj-1')
      await vi.advanceTimersByTimeAsync(600)
      useDocumentStore.getState().updateContent('# Final draft', 'proj-1')

      await vi.advanceTimersByTimeAsync(999)
      expect(documentSave).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      await Promise.resolve()

      expect(documentSave).toHaveBeenCalledTimes(1)
      expect(documentSave).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          content: '# Final draft',
        })
      )
      expect(useDocumentStore.getState().autoSave.dirty).toBe(false)
    })
  })

  describe('saveDocument', () => {
    it('should save and update lastSavedAt', async () => {
      useDocumentStore.setState({
        content: '# Save me',
        autoSave: { dirty: true, saving: false, lastSavedAt: null, error: null },
      })

      await useDocumentStore.getState().saveDocument('proj-1')

      const state = useDocumentStore.getState()
      expect(state.autoSave.saving).toBe(false)
      expect(state.autoSave.dirty).toBe(false)
      expect(state.autoSave.lastSavedAt).toBe('2026-03-21T10:01:00.000Z')
    })

    it('should set autoSave.error on IPC failure', async () => {
      mockApi({
        documentSave: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'SAVE_FAILED', message: '保存失败' },
        }),
      })

      await useDocumentStore.getState().saveDocument('proj-1')
      expect(useDocumentStore.getState().autoSave.error).toBe('保存失败')
    })

    it('should keep dirty=true if content changed during save', async () => {
      let resolveIpc: (v: unknown) => void
      const slowSave = new Promise((r) => {
        resolveIpc = r
      })
      mockApi({
        documentSave: vi.fn().mockReturnValue(slowSave),
      })

      useDocumentStore.setState({
        content: '# Original',
        autoSave: { dirty: true, saving: false, lastSavedAt: null, error: null },
      })

      // Start save (content is "# Original")
      const savePromise = useDocumentStore.getState().saveDocument('proj-1')

      // Simulate edit arriving during save
      useDocumentStore.setState({ content: '# Edited during save' })

      // Resolve the IPC call
      resolveIpc!({
        success: true,
        data: { lastSavedAt: '2026-03-21T10:02:00.000Z' },
      })
      await savePromise

      // dirty must remain true because content changed during save
      const state = useDocumentStore.getState()
      expect(state.autoSave.dirty).toBe(true)
      expect(state.autoSave.saving).toBe(false)
    })

    it('should replay a queued save after an in-flight save completes', async () => {
      vi.useFakeTimers()

      let resolveFirstSave: ((value: ApiResponse<{ lastSavedAt: string }>) => void) | undefined
      const documentSave = vi
        .fn<() => Promise<ApiResponse<{ lastSavedAt: string }>>>()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveFirstSave = resolve
            })
        )
        .mockResolvedValueOnce({
          success: true,
          data: { lastSavedAt: '2026-03-21T10:03:00.000Z' },
        })

      mockApi({ documentSave })

      useDocumentStore.getState().updateContent('# First', 'proj-1')
      await vi.advanceTimersByTimeAsync(1000)
      expect(documentSave).toHaveBeenCalledTimes(1)
      expect(documentSave).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ projectId: 'proj-1', content: '# First' })
      )

      useDocumentStore.getState().updateContent('# Second', 'proj-1')
      await vi.advanceTimersByTimeAsync(1000)

      expect(documentSave).toHaveBeenCalledTimes(1)
      expect(useDocumentStore.getState().autoSave.saving).toBe(true)

      resolveFirstSave?.({
        success: true,
        data: { lastSavedAt: '2026-03-21T10:02:00.000Z' },
      })
      await Promise.resolve()
      await vi.runAllTimersAsync()

      expect(documentSave).toHaveBeenCalledTimes(2)
      expect(documentSave).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          projectId: 'proj-1',
          content: '# Second',
        })
      )
      expect(useDocumentStore.getState().autoSave.dirty).toBe(false)
    })
  })

  describe('saveDocumentSync', () => {
    it('should synchronously save flushed content and clear dirty state', () => {
      const documentSaveSync = vi.fn().mockReturnValue({
        success: true,
        data: { lastSavedAt: '2026-03-21T10:04:00.000Z' },
      })
      mockApi({ documentSaveSync })

      useDocumentStore.setState({
        content: '# Draft',
        autoSave: { dirty: true, saving: false, lastSavedAt: null, error: null },
      })

      const didSave = useDocumentStore
        .getState()
        .saveDocumentSync('proj-1', '/tmp/projects/proj-1', '# Flushed')

      expect(didSave).toBe(true)
      expect(documentSaveSync).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-1',
          rootPath: '/tmp/projects/proj-1',
          content: '# Flushed',
        })
      )
      expect(useDocumentStore.getState().content).toBe('# Flushed')
      expect(useDocumentStore.getState().autoSave.dirty).toBe(false)
    })
  })
})
