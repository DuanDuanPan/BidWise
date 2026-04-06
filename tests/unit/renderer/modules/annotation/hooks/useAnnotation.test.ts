import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AnnotationRecord } from '@shared/annotation-types'

function mockApi(): void {
  vi.stubGlobal('api', {
    annotationList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    annotationCreate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationUpdate: vi.fn().mockResolvedValue({ success: true, data: {} }),
    annotationDelete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
  })
}

const makeAnnotation = (overrides: Partial<AnnotationRecord> = {}): AnnotationRecord => ({
  id: 'ann-1',
  projectId: 'proj-1',
  sectionId: 'section-1',
  type: 'human',
  content: 'Test',
  author: 'user',
  status: 'pending',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('useAnnotation hooks', () => {
  let useProjectAnnotations: typeof import('@renderer/modules/annotation/hooks/useAnnotation').useProjectAnnotations
  let useAnnotationsForSection: typeof import('@renderer/modules/annotation/hooks/useAnnotation').useAnnotationsForSection
  let usePendingAnnotationCount: typeof import('@renderer/modules/annotation/hooks/useAnnotation').usePendingAnnotationCount
  let useAnnotationStore: typeof import('@renderer/stores/annotationStore').useAnnotationStore

  beforeEach(async () => {
    vi.resetModules()
    mockApi()
    const storeModule = await import('@renderer/stores/annotationStore')
    useAnnotationStore = storeModule.useAnnotationStore
    const hookModule = await import('@renderer/modules/annotation/hooks/useAnnotation')
    useProjectAnnotations = hookModule.useProjectAnnotations
    useAnnotationsForSection = hookModule.useAnnotationsForSection
    usePendingAnnotationCount = hookModule.usePendingAnnotationCount
  })

  describe('useProjectAnnotations', () => {
    it('returns empty state for unknown project', () => {
      useAnnotationStore.setState({ projects: {} })

      const { result } = renderHook(() => useProjectAnnotations('proj-unknown'))

      expect(result.current.items).toEqual([])
      expect(result.current.loading).toBe(false)
      expect(result.current.loaded).toBe(false)
    })

    it('returns project state when data loaded', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [makeAnnotation()],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      const { result } = renderHook(() => useProjectAnnotations('proj-1'))

      expect(result.current.items).toHaveLength(1)
      expect(result.current.loaded).toBe(true)
    })
  })

  describe('useAnnotationsForSection', () => {
    it('filters items by sectionId', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ id: 'a1', sectionId: 's1' }),
              makeAnnotation({ id: 'a2', sectionId: 's2' }),
              makeAnnotation({ id: 'a3', sectionId: 's1' }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationsForSection('proj-1', 's1'))

      expect(result.current).toHaveLength(2)
      expect(result.current.map((a) => a.id)).toEqual(['a1', 'a3'])
    })
  })

  describe('usePendingAnnotationCount', () => {
    it('counts only pending annotations', () => {
      useAnnotationStore.setState({
        projects: {
          'proj-1': {
            items: [
              makeAnnotation({ id: 'a1', status: 'pending' }),
              makeAnnotation({ id: 'a2', status: 'accepted' }),
              makeAnnotation({ id: 'a3', status: 'pending' }),
              makeAnnotation({ id: 'a4', status: 'rejected' }),
            ],
            loading: false,
            error: null,
            loaded: true,
          },
        },
      })

      const { result } = renderHook(() => usePendingAnnotationCount('proj-1'))

      expect(result.current).toBe(2)
    })

    it('returns 0 for unknown project', () => {
      useAnnotationStore.setState({ projects: {} })

      const { result } = renderHook(() => usePendingAnnotationCount('proj-unknown'))

      expect(result.current).toBe(0)
    })
  })
})
