import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, cleanup, act } from '@testing-library/react'

const mockComplianceCheck = vi.fn()

function stubApi(): void {
  vi.stubGlobal('api', {
    complianceCheck: mockComplianceCheck,
  })
}

describe('useComplianceAutoRefresh @story-7-1', () => {
  let useComplianceAutoRefresh: typeof import('@modules/review/hooks/useComplianceAutoRefresh').useComplianceAutoRefresh
  let useAnalysisStore: typeof import('@renderer/stores/analysisStore').useAnalysisStore
  let useReviewStore: typeof import('@renderer/stores/reviewStore').useReviewStore

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.clearAllMocks()
    stubApi()
    mockComplianceCheck.mockResolvedValue({ success: true, data: null })

    const analysisMod = await import('@renderer/stores/analysisStore')
    useAnalysisStore = analysisMod.useAnalysisStore

    const reviewMod = await import('@renderer/stores/reviewStore')
    useReviewStore = reviewMod.useReviewStore
    useReviewStore.setState({ projects: {} })

    const hookMod = await import('@modules/review/hooks/useComplianceAutoRefresh')
    useComplianceAutoRefresh = hookMod.useComplianceAutoRefresh
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('calls checkCompliance on mount with projectId', async () => {
    renderHook(() => useComplianceAutoRefresh('proj-1'))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockComplianceCheck).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('does not call checkCompliance when projectId is empty', async () => {
    renderHook(() => useComplianceAutoRefresh(''))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockComplianceCheck).not.toHaveBeenCalled()
  })

  it('debounces compliance check when analysisStore changes', async () => {
    renderHook(() => useComplianceAutoRefresh('proj-1'))

    await act(async () => {
      await Promise.resolve()
    })

    // Initial call from mount
    expect(mockComplianceCheck).toHaveBeenCalledTimes(1)
    mockComplianceCheck.mockClear()

    // Simulate analysisStore change (mandatory items update)
    act(() => {
      const state = useAnalysisStore.getState()
      const currentProj = state.projects['proj-1'] || {}
      useAnalysisStore.setState({
        projects: {
          ...state.projects,
          'proj-1': {
            ...currentProj,
            mandatoryItems: [
              {
                id: 'mi-1',
                content: 'test',
                sourceText: '',
                sourcePages: [],
                confidence: 1,
                status: 'confirmed',
                linkedRequirementId: 'req-1',
                detectedAt: '',
                updatedAt: '',
              },
            ],
          },
        },
      } as never)
    })

    // Before debounce timeout — should not have been called yet
    expect(mockComplianceCheck).not.toHaveBeenCalled()

    // After debounce timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    expect(mockComplianceCheck).toHaveBeenCalledTimes(1)
  })

  it('cleans up subscription and timer on unmount', async () => {
    const { unmount } = renderHook(() => useComplianceAutoRefresh('proj-1'))

    await act(async () => {
      await Promise.resolve()
    })

    mockComplianceCheck.mockClear()

    unmount()

    // Simulate analysisStore change after unmount
    act(() => {
      useAnalysisStore.setState({
        projects: {
          'proj-1': {
            mandatoryItems: [
              {
                id: 'mi-2',
                content: 'new item',
                sourceText: '',
                sourcePages: [],
                confidence: 1,
                status: 'confirmed',
                linkedRequirementId: null,
                detectedAt: '',
                updatedAt: '',
              },
            ],
          },
        },
      } as never)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })

    // Should not have been called after unmount
    expect(mockComplianceCheck).not.toHaveBeenCalled()
  })
})
