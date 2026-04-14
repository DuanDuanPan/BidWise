import { BrowserWindow } from 'electron'
import { NotificationRepository } from '@main/db/repositories/notification-repo'
import type { AnnotationRecord } from '@shared/annotation-types'
import type { NotificationRecord } from '@shared/notification-types'
const notificationRepo = new NotificationRepository()

function isHumanUser(author: string): boolean {
  return !author.startsWith('agent:') && !author.startsWith('system:')
}

function broadcastNotification(notification: NotificationRecord): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('notification:new', notification)
    } catch {
      // Render frame may be disposed during HMR, reload, or window teardown.
    }
  }
}

export const notificationService = {
  async notifyDecisionRequested(params: {
    annotation: AnnotationRecord
    projectName: string
  }): Promise<NotificationRecord | null> {
    const { annotation, projectName } = params
    if (!annotation.assignee) return null
    if (annotation.assignee === annotation.author) return null

    const notification = await notificationRepo.create({
      projectId: annotation.projectId,
      projectName,
      sectionId: annotation.sectionId,
      annotationId: annotation.id,
      targetUser: annotation.assignee,
      type: 'decision-requested',
      title: '请求指导',
      summary: `${projectName} 有一条批注需要您的指导`,
    })

    broadcastNotification(notification)
    return notification
  },

  async notifyCrossRole(params: {
    annotation: AnnotationRecord
    projectName: string
  }): Promise<NotificationRecord | null> {
    const { annotation, projectName } = params
    if (!annotation.assignee) return null
    if (annotation.assignee === annotation.author) return null

    const notification = await notificationRepo.create({
      projectId: annotation.projectId,
      projectName,
      sectionId: annotation.sectionId,
      annotationId: annotation.id,
      targetUser: annotation.assignee,
      type: 'cross-role-mention',
      title: '跨角色批注',
      summary: `${projectName} 有一条跨角色批注需要您关注`,
    })

    broadcastNotification(notification)
    return notification
  },

  async notifyReplyReceived(params: {
    parentAnnotation: AnnotationRecord
    reply: AnnotationRecord
    projectName: string
  }): Promise<NotificationRecord | null> {
    const { parentAnnotation, reply, projectName } = params
    if (reply.author === parentAnnotation.author) return null
    if (!isHumanUser(parentAnnotation.author)) return null

    const rootAnnotationId = parentAnnotation.parentId ?? parentAnnotation.id

    const notification = await notificationRepo.create({
      projectId: reply.projectId,
      projectName,
      sectionId: reply.sectionId,
      annotationId: rootAnnotationId,
      targetUser: parentAnnotation.author,
      type: 'reply-received',
      title: '收到回复',
      summary: `${projectName} 中您的批注收到了新回复`,
    })

    broadcastNotification(notification)
    return notification
  },

  async list(targetUser: string, unreadOnly?: boolean): Promise<NotificationRecord[]> {
    return notificationRepo.listByUser(targetUser, unreadOnly)
  },

  async markRead(id: string): Promise<NotificationRecord> {
    const record = await notificationRepo.markRead(id)
    return record
  },

  async markAllRead(targetUser: string): Promise<void> {
    await notificationRepo.markAllRead(targetUser)
  },

  async countUnread(targetUser: string): Promise<number> {
    return notificationRepo.countUnread(targetUser)
  },
}
