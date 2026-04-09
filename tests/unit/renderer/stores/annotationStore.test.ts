import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AnnotationRecord } from '@shared/annotation-types'

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    annotationList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    annotationCreate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationUpdate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    annotationListReplies: vi.fn().mockResolvedValue({ success: true, data: [] }),
    ...overrides,
  })
}

const makeAnnotation = (overrides: Partial<AnnotationRecord> = {}): AnnotationRecord => ({
  id: 'ann-1',
  projectId: 'proj-1',
  sectionId: 'section-1',
  type: 'human',
  content: 'Test annotation',
  author: 'user-1',
  status: 'pending',
  parentId: null,
  assignee: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('annotationStore', () => {
  let useAnnotationStore: typeof import('@renderer/stores/annotationStore').useAnnotationStore

  beforeEach(async () => {
    vi.resetModules()
    mockApi()
    const mod = await import('@renderer/stores/annotationStore')
    useAnnotationStore = mod.useAnnotationStore
    useAnnotationStore.setState({ projects: {}, repliesByParent: {}, replyLoadingByParent: {} })
  })

  describe('loadAnnotations', () => {
    it('loads annotations for a project and sets loaded=true', async () => {
      const annotations = [
        makeAnnotation({ id: 'ann-2', createdAt: '2026-04-02T00:00:00Z' }),
        makeAnnotation({ id: 'ann-1', createdAt: '2026-04-01T00:00:00Z' }),
      ]
      mockApi({
        annotationList: vi.fn().mockResolvedValue({ success: true, data: annotations }),
      })

      await useAnnotationStore.getState().loadAnnotations('proj-1')

      const state = useAnnotationStore.getState().projects['proj-1']
      expect(state?.loaded).toBe(true)
      expect(state?.loading).toBe(false)
      expect(state?.items).toHaveLength(2)
      expect(state?.items[0].id).toBe('ann-2') // DESC order
    })

    it('sets error on failure', async () => {
      mockApi({
        annotationList: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'DB', message: 'db error' },
        }),
      })

      await useAnnotationStore.getState().loadAnnotations('proj-1')

      const state = useAnnotationStore.getState().projects['proj-1']
      expect(state?.error).toBe('db error')
      expect(state?.loading).toBe(false)
      expect(state?.loaded).toBe(false)
    })

    it('per-project loading state does not pollute other projects', async () => {
      // Set up proj-2 with existing data
      useAnnotationStore.setState({
        projects: {
          'proj-2': {
            items: [makeAnnotation({ projectId: 'proj-2' })],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      mockApi({
        annotationList: vi.fn().mockResolvedValue({ success: true, data: [] }),
      })

      await useAnnotationStore.getState().loadAnnotations('proj-1')

      expect(useAnnotationStore.getState().projects['proj-2']?.items).toHaveLength(1)
      expect(useAnnotationStore.getState().projects['proj-1']?.loaded).toBe(true)
    })
  })

  describe('createAnnotation', () => {
    it('adds new annotation to project items', async () => {
      const created = makeAnnotation({ id: 'ann-new' })
      mockApi({
        annotationCreate: vi.fn().mockResolvedValue({ success: true, data: created }),
      })

      await useAnnotationStore.getState().createAnnotation({
        projectId: 'proj-1',
        sectionId: 's1',
        type: 'human',
        content: 'new',
        author: 'user',
      })

      const state = useAnnotationStore.getState().projects['proj-1']
      expect(state?.items).toHaveLength(1)
      expect(state?.items[0].id).toBe('ann-new')
    })
  })

  describe('updateAnnotation', () => {
    it('replaces annotation in-place', async () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'ann-1', content: 'old' })],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      const updated = makeAnnotation({ id: 'ann-1', content: 'new' })
      mockApi({
        annotationUpdate: vi.fn().mockResolvedValue({ success: true, data: updated }),
      })

      await useAnnotationStore.getState().updateAnnotation({ id: 'ann-1', content: 'new' })

      const state = useAnnotationStore.getState().projects['proj-1']
      expect(state?.items[0].content).toBe('new')
    })
  })

  describe('deleteAnnotation', () => {
    it('removes annotation from project items', async () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'ann-1' }), makeAnnotation({ id: 'ann-2' })],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      mockApi({
        annotationDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      })

      await useAnnotationStore.getState().deleteAnnotation('ann-1', 'proj-1')

      const state = useAnnotationStore.getState().projects['proj-1']
      expect(state?.items).toHaveLength(1)
      expect(state?.items[0].id).toBe('ann-2')
    })
  })

  describe('reset', () => {
    it('resets a single project', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [makeAnnotation()], loading: false, error: null, loaded: true },
          'proj-2': { items: [makeAnnotation()], loading: false, error: null, loaded: true },
        },
      })

      useAnnotationStore.getState().reset('proj-1')

      expect(useAnnotationStore.getState().projects['proj-1']?.items).toHaveLength(0)
      expect(useAnnotationStore.getState().projects['proj-2']?.items).toHaveLength(1)
    })

    it('resets all projects when no projectId', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': { items: [makeAnnotation()], loading: false, error: null, loaded: true },
        },
      })

      useAnnotationStore.getState().reset()

      expect(useAnnotationStore.getState().projects).toEqual({})
    })
  })

  describe('sort order', () => {
    it('maintains createdAt DESC order after create', async () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation({ id: 'ann-old', createdAt: '2026-04-01T00:00:00Z' })],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      const newer = makeAnnotation({ id: 'ann-new', createdAt: '2026-04-05T00:00:00Z' })
      mockApi({
        annotationCreate: vi.fn().mockResolvedValue({ success: true, data: newer }),
      })

      await useAnnotationStore.getState().createAnnotation({
        projectId: 'proj-1',
        sectionId: 's1',
        type: 'human',
        content: 'new',
        author: 'user',
      })

      const items = useAnnotationStore.getState().projects['proj-1']?.items ?? []
      expect(items[0].id).toBe('ann-new')
      expect(items[1].id).toBe('ann-old')
    })
  })
})
