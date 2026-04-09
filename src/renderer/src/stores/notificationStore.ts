import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { NotificationRecord, ListNotificationsInput } from '@shared/notification-types'

export interface NotificationState {
  notifications: NotificationRecord[]
  unreadCount: number
  loading: boolean
  error: string | null
  loaded: boolean
}

interface NotificationActions {
  loadNotifications: (input: ListNotificationsInput) => Promise<void>
  markRead: (id: string) => Promise<NotificationRecord | null>
  markAllRead: (targetUser: string) => Promise<void>
  refreshUnreadCount: (targetUser: string) => Promise<void>
  addNotification: (notification: NotificationRecord) => void
  reset: () => void
}

type NotificationStore = NotificationState & NotificationActions

function sortByCreatedAtDesc(items: NotificationRecord[]): NotificationRecord[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const useNotificationStore = create<NotificationStore>()(
  subscribeWithSelector((set, _get) => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: null,
    loaded: false,

    async loadNotifications(input: ListNotificationsInput): Promise<void> {
      set({ loading: true, error: null })

      try {
        const response = await window.api.notificationList(input)
        if (response.success) {
          set({
            notifications: sortByCreatedAtDesc(response.data),
            loading: false,
            loaded: true,
          })
        } else {
          set({ loading: false, error: response.error.message })
        }
      } catch (err) {
        set({ loading: false, error: (err as Error).message })
      }
    },

    async markRead(id: string): Promise<NotificationRecord | null> {
      try {
        const response = await window.api.notificationMarkRead({ id })
        if (response.success) {
          const updated = response.data
          set((state) => ({
            notifications: state.notifications.map((n) => (n.id === id ? updated : n)),
            unreadCount: Math.max(0, state.unreadCount - 1),
          }))
          return updated
        } else {
          set({ error: response.error.message })
          return null
        }
      } catch (err) {
        set({ error: (err as Error).message })
        return null
      }
    },

    async markAllRead(targetUser: string): Promise<void> {
      try {
        const response = await window.api.notificationMarkAllRead({ targetUser })
        if (response.success) {
          set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          }))
        } else {
          set({ error: response.error.message })
        }
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    async refreshUnreadCount(targetUser: string): Promise<void> {
      try {
        const response = await window.api.notificationCountUnread({ targetUser })
        if (response.success) {
          set({ unreadCount: response.data })
        }
      } catch {
        // silent failure for count refresh
      }
    },

    addNotification(notification: NotificationRecord): void {
      set((state) => ({
        notifications: sortByCreatedAtDesc([notification, ...state.notifications]),
        unreadCount: state.unreadCount + 1,
      }))
    },

    reset(): void {
      set({
        notifications: [],
        unreadCount: 0,
        loading: false,
        error: null,
        loaded: false,
      })
    },
  }))
)
