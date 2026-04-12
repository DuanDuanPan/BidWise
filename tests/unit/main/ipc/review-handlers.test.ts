import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockGetLineup = vi.hoisted(() => vi.fn())
const mockUpdateRoles = vi.hoisted(() => vi.fn())
const mockConfirmLineup = vi.hoisted(() => vi.fn())
const mockStartExecution = vi.hoisted(() => vi.fn())
const mockGetReview = vi.hoisted(() => vi.fn())
const mockHandleFinding = vi.hoisted(() => vi.fn())
const mockRetryRole = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

vi.mock('@main/services/adversarial-lineup-service', () => ({
  adversarialLineupService: {
    generate: mockGenerate,
    getLineup: mockGetLineup,
    updateRoles: mockUpdateRoles,
    confirmLineup: mockConfirmLineup,
  },
}))

vi.mock('@main/services/adversarial-review-service', () => ({
  adversarialReviewService: {
    startExecution: mockStartExecution,
    getReview: mockGetReview,
    handleFinding: mockHandleFinding,
    retryRole: mockRetryRole,
  },
}))

vi.mock('@main/utils/errors', () => {
  class BidWiseError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  }
  return { BidWiseError }
})

vi.mock('@shared/constants', () => ({
  ErrorCode: { UNKNOWN: 'UNKNOWN' },
}))

import { registerReviewHandlers } from '@main/ipc/review-handlers'

describe('review-handlers @story-7-2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 8 review channels', () => {
    registerReviewHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('review:generate-roles')
    expect(registeredChannels).toContain('review:get-lineup')
    expect(registeredChannels).toContain('review:update-roles')
    expect(registeredChannels).toContain('review:confirm-lineup')
    expect(registeredChannels).toContain('review:start-execution')
    expect(registeredChannels).toContain('review:get-review')
    expect(registeredChannels).toContain('review:handle-finding')
    expect(registeredChannels).toContain('review:retry-role')
    expect(registeredChannels).toHaveLength(8)
  })

  it('review:generate-roles handler wraps response in success envelope', async () => {
    const mockResult = { taskId: 'task-123' }
    mockGenerate.mockResolvedValue(mockResult)
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:generate-roles'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: mockResult })
    expect(mockGenerate).toHaveBeenCalledWith({ projectId: 'proj-1' })
  })

  it('review:get-lineup handler returns null when no lineup exists', async () => {
    mockGetLineup.mockResolvedValue(null)
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:get-lineup'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: null })
  })

  it('review:update-roles handler passes input through', async () => {
    const mockLineup = { id: 'lineup-1', roles: [] }
    mockUpdateRoles.mockResolvedValue(mockLineup)
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:update-roles'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const input = { lineupId: 'lineup-1', roles: [] }
    const result = await handler({}, input)
    expect(result).toEqual({ success: true, data: mockLineup })
  })

  it('handler wraps BidWiseError in error envelope', async () => {
    const { BidWiseError } = await import('@main/utils/errors')
    mockGenerate.mockRejectedValue(new BidWiseError('VALIDATION', '请先完成需求抽取'))
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:generate-roles'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({
      success: false,
      error: { code: 'VALIDATION', message: '请先完成需求抽取' },
    })
  })
})

describe('review-handlers @story-7-3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('review:start-execution routes to adversarialReviewService.startExecution', async () => {
    mockStartExecution.mockResolvedValue({ taskId: 'task-review-1' })
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:start-execution'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: { taskId: 'task-review-1' } })
    expect(mockStartExecution).toHaveBeenCalledWith('proj-1')
  })

  it('review:get-review routes to adversarialReviewService.getReview', async () => {
    mockGetReview.mockResolvedValue(null)
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:get-review'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1' })
    expect(result).toEqual({ success: true, data: null })
  })

  it('review:handle-finding routes to adversarialReviewService.handleFinding', async () => {
    const mockResult = { id: 'f1', status: 'accepted' }
    mockHandleFinding.mockResolvedValue(mockResult)
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:handle-finding'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { findingId: 'f1', action: 'accepted' })
    expect(result).toEqual({ success: true, data: mockResult })
    expect(mockHandleFinding).toHaveBeenCalledWith('f1', 'accepted', undefined)
  })

  it('review:retry-role routes to adversarialReviewService.retryRole', async () => {
    mockRetryRole.mockResolvedValue({ taskId: 'task-retry-1' })
    registerReviewHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'review:retry-role'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { projectId: 'proj-1', roleId: 'role-1' })
    expect(result).toEqual({ success: true, data: { taskId: 'task-retry-1' } })
    expect(mockRetryRole).toHaveBeenCalledWith('proj-1', 'role-1')
  })
})
