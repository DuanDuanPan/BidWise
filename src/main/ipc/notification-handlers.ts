import { createIpcHandler } from './create-handler'
import { notificationService } from '@main/services/notification-service'
import type { IpcChannel } from '@shared/ipc-types'

type NotificationChannel = Extract<IpcChannel, `notification:${string}`>

const notificationHandlerMap: { [C in NotificationChannel]: () => void } = {
  'notification:list': () =>
    createIpcHandler('notification:list', (input) =>
      notificationService.list(input.targetUser, input.unreadOnly)
    ),
  'notification:mark-read': () =>
    createIpcHandler('notification:mark-read', ({ id }) => notificationService.markRead(id)),
  'notification:mark-all-read': () =>
    createIpcHandler('notification:mark-all-read', ({ targetUser }) =>
      notificationService.markAllRead(targetUser)
    ),
  'notification:count-unread': () =>
    createIpcHandler('notification:count-unread', ({ targetUser }) =>
      notificationService.countUnread(targetUser)
    ),
}

export type RegisteredNotificationChannels = NotificationChannel

export function registerNotificationHandlers(): void {
  for (const register of Object.values(notificationHandlerMap)) {
    register()
  }
}
