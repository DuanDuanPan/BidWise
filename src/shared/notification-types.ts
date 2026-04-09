export type NotificationType = 'decision-requested' | 'cross-role-mention' | 'reply-received'

export interface NotificationRecord {
  id: string
  projectId: string
  projectName: string
  sectionId: string
  annotationId: string
  targetUser: string
  type: NotificationType
  title: string
  summary: string
  read: boolean
  createdAt: string
}

export interface CreateNotificationInput {
  projectId: string
  projectName: string
  sectionId: string
  annotationId: string
  targetUser: string
  type: NotificationType
  title: string
  summary: string
}

export interface ListNotificationsInput {
  targetUser: string
  unreadOnly?: boolean
}

export interface MarkReadInput {
  id: string
}

export interface MarkAllReadInput {
  targetUser: string
}
