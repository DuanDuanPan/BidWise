import type { NotificationType } from '@shared/notification-types'

export const NOTIFICATION_TYPE_ICONS: Record<NotificationType, { icon: string; color: string }> = {
  'decision-requested': { icon: 'warning', color: '#FA8C16' },
  'reply-received': { icon: 'reply', color: '#1677FF' },
  'cross-role-mention': { icon: 'at-sign', color: '#52C41A' },
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  'decision-requested': '请求指导',
  'reply-received': '收到回复',
  'cross-role-mention': '跨角色批注',
}
