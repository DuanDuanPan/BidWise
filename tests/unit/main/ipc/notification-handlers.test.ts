import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHandle = vi.hoisted(() => vi.fn())
const mockList = vi.hoisted(() => vi.fn())
const mockMarkRead = vi.hoisted(() => vi.fn())
const mockMarkAllRead = vi.hoisted(() => vi.fn())
const mockCountUnread = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
}))

vi.mock('@main/services/notification-service', () => ({
  notificationService: {
    list: mockList,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
    countUnread: mockCountUnread,
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

import { registerNotificationHandlers } from '@main/ipc/notification-handlers'

describe('notification-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all four notification channels', () => {
    registerNotificationHandlers()

    const registeredChannels = mockHandle.mock.calls.map((c: unknown[]) => c[0])
    expect(registeredChannels).toContain('notification:list')
    expect(registeredChannels).toContain('notification:mark-read')
    expect(registeredChannels).toContain('notification:mark-all-read')
    expect(registeredChannels).toContain('notification:count-unread')
    expect(registeredChannels).toHaveLength(4)
  })

  it('notification:list handler wraps response in success envelope', async () => {
    mockList.mockResolvedValue([{ id: 'n-1' }])
    registerNotificationHandlers()

    const listHandler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'notification:list'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await listHandler({}, { targetUser: 'user:default' })

    expect(result).toEqual({ success: true, data: [{ id: 'n-1' }] })
    expect(mockList).toHaveBeenCalledWith('user:default', undefined)
  })

  it('notification:mark-read handler passes id', async () => {
    mockMarkRead.mockResolvedValue({ id: 'n-1', read: true })
    registerNotificationHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'notification:mark-read'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    await handler({}, { id: 'n-1' })

    expect(mockMarkRead).toHaveBeenCalledWith('n-1')
  })

  it('notification:count-unread handler passes targetUser', async () => {
    mockCountUnread.mockResolvedValue(5)
    registerNotificationHandlers()

    const handler = mockHandle.mock.calls.find(
      (c: unknown[]) => c[0] === 'notification:count-unread'
    )?.[1] as (...args: unknown[]) => Promise<unknown>

    const result = await handler({}, { targetUser: 'user:default' })

    expect(result).toEqual({ success: true, data: 5 })
  })
})
