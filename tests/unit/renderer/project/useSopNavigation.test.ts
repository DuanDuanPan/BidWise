import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useSopNavigation } from '@modules/project/hooks/useSopNavigation'

// Mock antd message
vi.mock('antd', () => ({
  message: {
    warning: vi.fn(),
  },
}))

// Mock projectStore
const mockUpdateProject = vi.fn().mockResolvedValue({})

vi.mock('@renderer/stores', () => ({
  useProjectStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ updateProject: mockUpdateProject }),
}))

describe('@story-1-6 useSopNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('@p0 normalizes not-started to requirements-analysis', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'not-started'))
    expect(result.current.currentStageKey).toBe('requirements-analysis')
  })

  it('@p0 normalizes undefined sopStage to requirements-analysis', () => {
    const { result } = renderHook(() => useSopNavigation('p1', undefined))
    expect(result.current.currentStageKey).toBe('requirements-analysis')
  })

  it('@p0 uses provided sopStage key directly', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'proposal-writing'))
    expect(result.current.currentStageKey).toBe('proposal-writing')
  })

  it('@p0 derives correct stage statuses', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'proposal-writing'))
    const statuses = result.current.stageStatuses
    expect(statuses['requirements-analysis']).toBe('completed')
    expect(statuses['solution-design']).toBe('completed')
    expect(statuses['proposal-writing']).toBe('in-progress')
    expect(statuses['cost-estimation']).toBe('not-started')
    expect(statuses['compliance-review']).toBe('not-started')
    expect(statuses.delivery).toBe('not-started')
  })

  it('@p0 navigateToStage updates current stage', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'requirements-analysis'))
    act(() => {
      result.current.navigateToStage('solution-design')
    })
    expect(result.current.currentStageKey).toBe('solution-design')
  })

  it('@p0 navigateToStage forward persists via updateProject', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'requirements-analysis'))
    act(() => {
      result.current.navigateToStage('proposal-writing')
    })
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', { sopStage: 'proposal-writing' })
  })

  it('@p0 navigateToStage backward persists via updateProject', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'proposal-writing'))
    mockUpdateProject.mockClear()
    act(() => {
      result.current.navigateToStage('requirements-analysis')
    })
    expect(result.current.currentStageKey).toBe('requirements-analysis')
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', {
      sopStage: 'requirements-analysis',
    })
  })

  it('@p0 warns but still allows navigation when skipping stages', async () => {
    const { message } = await import('antd')
    const { result } = renderHook(() => useSopNavigation('p1', 'requirements-analysis'))
    act(() => {
      result.current.navigateToStage('proposal-writing')
    })
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('方案设计'))
    expect(result.current.currentStageKey).toBe('proposal-writing')
  })

  it('@p0 auto-persists not-started → requirements-analysis on mount', () => {
    renderHook(() => useSopNavigation('p1', 'not-started'))
    expect(mockUpdateProject).toHaveBeenCalledWith('p1', {
      sopStage: 'requirements-analysis',
    })
  })

  it('@p1 falls back to requirements-analysis for invalid sopStage', () => {
    const { result } = renderHook(() => useSopNavigation('p1', 'bogus-stage'))
    expect(result.current.currentStageKey).toBe('requirements-analysis')
  })
})
