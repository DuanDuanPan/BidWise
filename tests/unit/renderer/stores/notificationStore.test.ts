import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NotificationRecord } from '@shared/notification-types'

function mockApi(overrides: Partial<typeof window.api> = {}): void {
  vi.stubGlobal('api', {
    notificationList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    notificationMarkRead: vi.fn().mockResolvedValue({ success: true, data: {} }),
    notificationMarkAllRead: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    notificationCountUnread: vi.fn().mockResolvedValue({ success: true, data: 0 }),
    ...overrides,
  })
}

const makeNotification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'notif-1',
  projectId: 'proj-1',
  projectName: 'Test Project',
  sectionId: 'section-1',
  annotationId: 'ann-1',
  targetUser: 'user:default',
  type: 'decision-requested',
  title: '请求指导',
  summary: 'Test summary',
  read: false,
  createdAt: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('notificationStore', () => {
  let useNotificationStore: typeof import('@renderer/stores/notificationStore').useNotificationStore

  beforeEach(async () => {
    vi.resetModules()
    mockApi()
    const mod = await import('@renderer/stores/notificationStore')
    useNotificationStore = mod.useNotificationStore
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
      error: null,
      loaded: false,
    })
  })

  describe('loadNotifications', () => {
    it('loads and sorts notifications by createdAt DESC', async () => {
      const notifications = [
        makeNotification({ id: 'n-1', createdAt: '2026-04-01T00:00:00Z' }),
        makeNotification({ id: 'n-2', createdAt: '2026-04-02T00:00:00Z' }),
      ]
      mockApi({
        notificationList: vi.fn().mockResolvedValue({ success: true, data: notifications }),
      })

      await useNotificationStore.getState().loadNotifications({ targetUser: 'user:default' })

      const state = useNotificationStore.getState()
      expect(state.notifications[0].id).toBe('n-2')
      expect(state.notifications[1].id).toBe('n-1')
      expect(state.loaded).toBe(true)
      expect(state.loading).toBe(false)
    })

    it('sets error on failure response', async () => {
      mockApi({
        notificationList: vi.fn().mockResolvedValue({ success: false, error: { message: 'fail' } }),
      })

      await useNotificationStore.getState().loadNotifications({ targetUser: 'user:default' })

      expect(useNotificationStore.getState().error).toBe('fail')
    })
  })

  describe('markRead', () => {
    it('updates notification and decrements unread count', async () => {
      const original = makeNotification({ id: 'n-1', read: false })
      const updated = makeNotification({ id: 'n-1', read: true })
      useNotificationStore.setState({ notifications: [original], unreadCount: 3 })

      mockApi({
        notificationMarkRead: vi.fn().mockResolvedValue({ success: true, data: updated }),
      })

      const result = await useNotificationStore.getState().markRead('n-1')

      expect(result).toEqual(updated)
      const state = useNotificationStore.getState()
      expect(state.notifications[0].read).toBe(true)
      expect(state.unreadCount).toBe(2)
    })
  })

  describe('markAllRead', () => {
    it('marks all notifications as read and resets unread count', async () => {
      useNotificationStore.setState({
        notifications: [
          makeNotification({ id: 'n-1', read: false }),
          makeNotification({ id: 'n-2', read: false }),
        ],
        unreadCount: 2,
      })

      mockApi({
        notificationMarkAllRead: vi.fn().mockResolvedValue({ success: true, data: undefined }),
      })

      await useNotificationStore.getState().markAllRead('user:default')

      const state = useNotificationStore.getState()
      expect(state.notifications.every((n) => n.read)).toBe(true)
      expect(state.unreadCount).toBe(0)
    })
  })

  describe('refreshUnreadCount', () => {
    it('updates unread count from API', async () => {
      mockApi({
        notificationCountUnread: vi.fn().mockResolvedValue({ success: true, data: 5 }),
      })

      await useNotificationStore.getState().refreshUnreadCount('user:default')

      expect(useNotificationStore.getState().unreadCount).toBe(5)
    })
  })

  describe('addNotification', () => {
    it('prepends notification and increments unread count', () => {
      const existing = makeNotification({ id: 'n-1', createdAt: '2026-04-01T00:00:00Z' })
      useNotificationStore.setState({ notifications: [existing], unreadCount: 1 })

      const newNotification = makeNotification({
        id: 'n-2',
        createdAt: '2026-04-02T00:00:00Z',
      })
      useNotificationStore.getState().addNotification(newNotification)

      const state = useNotificationStore.getState()
      expect(state.notifications[0].id).toBe('n-2')
      expect(state.notifications[1].id).toBe('n-1')
      expect(state.unreadCount).toBe(2)
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useNotificationStore.setState({
        notifications: [makeNotification()],
        unreadCount: 5,
        loading: true,
        error: 'something',
        loaded: true,
      })

      useNotificationStore.getState().reset()

      const state = useNotificationStore.getState()
      expect(state.notifications).toEqual([])
      expect(state.unreadCount).toBe(0)
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.loaded).toBe(false)
    })
  })
})
