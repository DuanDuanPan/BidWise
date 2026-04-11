import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockComplianceCheck = vi.fn()
const mockReviewGenerateRoles = vi.fn()
const mockReviewGetLineup = vi.fn()
const mockReviewUpdateRoles = vi.fn()
const mockReviewConfirmLineup = vi.fn()

function stubApi(): void {
  vi.stubGlobal('api', {
    complianceCheck: mockComplianceCheck,
    reviewGenerateRoles: mockReviewGenerateRoles,
    reviewGetLineup: mockReviewGetLineup,
    reviewUpdateRoles: mockReviewUpdateRoles,
    reviewConfirmLineup: mockReviewConfirmLineup,
  })
}

describe('reviewStore @story-7-1 @story-7-2', () => {
  let useReviewStore: typeof import('@renderer/stores/reviewStore').useReviewStore
  let getReviewProjectState: typeof import('@renderer/stores/reviewStore').getReviewProjectState
  let findReviewProjectIdByTaskId: typeof import('@renderer/stores/reviewStore').findReviewProjectIdByTaskId

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    stubApi()
    const mod = await import('@renderer/stores/reviewStore')
    useReviewStore = mod.useReviewStore
    getReviewProjectState = mod.getReviewProjectState
    findReviewProjectIdByTaskId = mod.findReviewProjectIdByTaskId
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
    // 7.2 fields
    expect(ps.lineup).toBeNull()
    expect(ps.lineupLoaded).toBe(false)
    expect(ps.lineupLoading).toBe(false)
    expect(ps.lineupError).toBeNull()
    expect(ps.lineupTaskId).toBeNull()
    expect(ps.lineupProgress).toBe(0)
    expect(ps.lineupMessage).toBeNull()
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

  describe('startLineupGeneration @story-7-2', () => {
    it('sets lineupLoading=true and stores taskId on success', async () => {
      mockReviewGenerateRoles.mockResolvedValue({ success: true, data: { taskId: 'task-123' } })

      await useReviewStore.getState().startLineupGeneration('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineupTaskId).toBe('task-123')
      expect(ps.lineupLoading).toBe(true)
    })

    it('sets lineupError on API failure', async () => {
      mockReviewGenerateRoles.mockResolvedValue({
        success: false,
        error: { code: 'VALIDATION', message: '请先完成需求抽取' },
      })

      await useReviewStore.getState().startLineupGeneration('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineupError).toBe('请先完成需求抽取')
      expect(ps.lineupLoading).toBe(false)
    })
  })

  describe('loadLineup @story-7-2', () => {
    it('stores lineup on success', async () => {
      const mockLineup = {
        id: 'lineup-1',
        projectId: 'proj-1',
        roles: [],
        status: 'generated',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: '2026-04-12T00:00:00.000Z',
        confirmedAt: null,
      }
      mockReviewGetLineup.mockResolvedValue({ success: true, data: mockLineup })

      await useReviewStore.getState().loadLineup('proj-1')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineup).toEqual(mockLineup)
      expect(ps.lineupLoaded).toBe(true)
      expect(ps.lineupLoading).toBe(false)
      expect(ps.lineupTaskId).toBeNull()
    })
  })

  describe('updateRoles @story-7-2', () => {
    it('updates lineup roles in store', async () => {
      const mockLineup = {
        id: 'lineup-1',
        projectId: 'proj-1',
        roles: [{ id: 'r1', name: '新角色' }],
        status: 'generated',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: '2026-04-12T00:00:00.000Z',
        confirmedAt: null,
      }
      mockReviewUpdateRoles.mockResolvedValue({ success: true, data: mockLineup })

      await useReviewStore.getState().updateRoles({ lineupId: 'lineup-1', roles: [] })

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineup).toEqual(mockLineup)
    })
  })

  describe('confirmLineup @story-7-2', () => {
    it('updates lineup status to confirmed', async () => {
      const mockLineup = {
        id: 'lineup-1',
        projectId: 'proj-1',
        roles: [],
        status: 'confirmed',
        generationSource: 'llm',
        warningMessage: null,
        generatedAt: '2026-04-12T00:00:00.000Z',
        confirmedAt: '2026-04-12T01:00:00.000Z',
      }
      mockReviewConfirmLineup.mockResolvedValue({ success: true, data: mockLineup })

      await useReviewStore.getState().confirmLineup({ lineupId: 'lineup-1' })

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineup?.status).toBe('confirmed')
    })
  })

  describe('setLineupProgress @story-7-2', () => {
    it('updates progress and message', () => {
      useReviewStore.getState().setLineupProgress('proj-1', 50, '正在生成...')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineupProgress).toBe(50)
      expect(ps.lineupMessage).toBe('正在生成...')
    })
  })

  describe('setLineupTaskError @story-7-2', () => {
    it('clears loading and sets error', () => {
      // First set loading state
      useReviewStore.setState({
        projects: {
          'proj-1': {
            compliance: null,
            loading: false,
            error: null,
            loaded: false,
            lineup: null,
            lineupLoaded: false,
            lineupLoading: true,
            lineupError: null,
            lineupTaskId: 'task-1',
            lineupProgress: 50,
            lineupMessage: '生成中',
          },
        },
      })

      useReviewStore.getState().setLineupTaskError('proj-1', '生成失败')

      const ps = getReviewProjectState(useReviewStore.getState(), 'proj-1')
      expect(ps.lineupLoading).toBe(false)
      expect(ps.lineupError).toBe('生成失败')
      expect(ps.lineupTaskId).toBeNull()
    })
  })

  describe('findReviewProjectIdByTaskId @story-7-2', () => {
    it('finds project by lineup task ID', () => {
      useReviewStore.setState({
        projects: {
          'proj-1': {
            compliance: null,
            loading: false,
            error: null,
            loaded: false,
            lineup: null,
            lineupLoaded: false,
            lineupLoading: true,
            lineupError: null,
            lineupTaskId: 'task-abc',
            lineupProgress: 0,
            lineupMessage: null,
          },
        },
      })

      expect(findReviewProjectIdByTaskId(useReviewStore.getState(), 'task-abc')).toBe('proj-1')
      expect(findReviewProjectIdByTaskId(useReviewStore.getState(), 'task-unknown')).toBeUndefined()
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
      expect(ps.lineup).toBeNull()
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
