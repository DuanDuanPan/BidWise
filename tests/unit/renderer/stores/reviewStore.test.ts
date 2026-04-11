import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockComplianceCheck = vi.fn()

function stubApi(): void {
  vi.stubGlobal('api', {
    complianceCheck: mockComplianceCheck,
  })
}

describe('reviewStore @story-7-1', () => {
  let useReviewStore: typeof import('@renderer/stores/reviewStore').useReviewStore
  let getReviewProjectState: typeof import('@renderer/stores/reviewStore').getReviewProjectState

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    stubApi()
    const mod = await import('@renderer/stores/reviewStore')
    useReviewStore = mod.useReviewStore
    getReviewProjectState = mod.getReviewProjectState
    useReviewStore.setState({ projects: {} })
  })

  it('defaults to empty projects', () => {
    const state = useReviewStore.getState()
    expect(state.projects).toEqual({})
  })

  it('getReviewProjectState returns default state for unknown project', () => {
    const ps = getReviewProjectState(useReviewStore.getState(), 'unknown-proj')
    expect(ps.compliance).toBeNull()
    expect(ps.loading).toBe(false)
    expect(ps.error).toBeNull()
    expect(ps.loaded).toBe(false)
  })

  describe('checkCompliance', () => {
    it('sets loading=true during fetch', async () => {
      let resolvePromise: (value: unknown) => void
      const pending = new Promise((resolve) => {
        resolvePromise = resolve
      })
      mockComplianceCheck.mockReturnValue(pending)

      const promise = useReviewStore.getState().checkCompliance('proj-1')
      expect(getReviewProjectState(useReviewStore.getState(), 'proj-1').loading).toBe(true)

      resolvePromise!({ success: true, data: null })
      await promise
      expect(getReviewProjectState(useReviewStore.getState(), 'proj-1').loading).toBe(false)
    })

    it('stores compliance result on success', async () => {
      const mockResult = {
        items: [],
        totalConfirmed: 5,
        coveredCount: 3,
        partialCount: 1,
        uncoveredCount: 1,
        unlinkedCount: 0,
        complianceRate: 60,
      }
      mockComplianceCheck.mockResolvedValue({ success: true, data: mockResult })

      await useReviewStore.getState().checkCompliance('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.compliance).toEqual(mockResult)
      expect(ps.loaded).toBe(true)
      expect(ps.loading).toBe(false)
      expect(ps.error).toBeNull()
    })

    it('stores null compliance when detection not yet run', async () => {
      mockComplianceCheck.mockResolvedValue({ success: true, data: null })

      await useReviewStore.getState().checkCompliance('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.compliance).toBeNull()
      expect(ps.loaded).toBe(true)
    })

    it('sets error on API failure response', async () => {
      mockComplianceCheck.mockResolvedValue({
        success: false,
        error: { code: 'TEST', message: 'compliance check failed' },
      })

      await useReviewStore.getState().checkCompliance('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.error).toBe('compliance check failed')
      expect(ps.loading).toBe(false)
    })

    it('sets error on exception', async () => {
      mockComplianceCheck.mockRejectedValue(new Error('network error'))

      await useReviewStore.getState().checkCompliance('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.error).toBe('network error')
    })
  })

  describe('reset', () => {
    it('resets a single project', async () => {
      mockComplianceCheck.mockResolvedValue({ success: true, data: null })
      await useReviewStore.getState().checkCompliance('proj-1')

      useReviewStore.getState().reset('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.loaded).toBe(false)
      expect(ps.compliance).toBeNull()
    })

    it('resets all projects when no projectId given', async () => {
      mockComplianceCheck.mockResolvedValue({ success: true, data: null })
      await useReviewStore.getState().checkCompliance('proj-1')
      await useReviewStore.getState().checkCompliance('proj-2')

      useReviewStore.getState().reset()

      expect(useReviewStore.getState().projects).toEqual({})
    })
  })
})
