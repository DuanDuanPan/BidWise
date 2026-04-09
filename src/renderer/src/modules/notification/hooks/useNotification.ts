import { useNotificationStore } from '@renderer/stores/notificationStore'

export function useNotifications(): {
  notifications: import('@shared/notification-types').NotificationRecord[]
  loading: boolean
  error: string | null
  loaded: boolean
  loadNotifications: (
    input: import('@shared/notification-types').ListNotificationsInput
  ) => Promise<void>
  markRead: (id: string) => Promise<import('@shared/notification-types').NotificationRecord | null>
  markAllRead: (targetUser: string) => Promise<void>
} {
  const notifications = useNotificationStore((s) => s.notifications)
  const loading = useNotificationStore((s) => s.loading)
  const error = useNotificationStore((s) => s.error)
  const loaded = useNotificationStore((s) => s.loaded)
  const loadNotifications = useNotificationStore((s) => s.loadNotifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  return { notifications, loading, error, loaded, loadNotifications, markRead, markAllRead }
}

export function useUnreadCount(): {
  unreadCount: number
  refreshUnreadCount: (targetUser: string) => Promise<void>
} {
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const refreshUnreadCount = useNotificationStore((s) => s.refreshUnreadCount)

  return { unreadCount, refreshUnreadCount }
}
