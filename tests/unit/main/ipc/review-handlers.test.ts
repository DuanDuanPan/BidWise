import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockGenerate = vi.hoisted(() => vi.fn())
const mockGetLineup = vi.hoisted(() => vi.fn())
const mockUpdateRoles = vi.hoisted(() => vi.fn())
const mockConfirmLineup = vi.hoisted(() => vi.fn())

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

  it('registers all 4 review channels', () => {
    registerReviewHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('review:generate-roles')
    expect(registeredChannels).toContain('review:get-lineup')
    expect(registeredChannels).toContain('review:update-roles')
    expect(registeredChannels).toContain('review:confirm-lineup')
    expect(registeredChannels).toHaveLength(4)
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
