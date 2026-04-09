import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { NotificationRecord, CreateNotificationInput } from '@shared/notification-types'

function toRecord(row: Record<string, unknown>): NotificationRecord {
  return {
    ...(row as unknown as Omit<NotificationRecord, 'read'>),
    read: (row as Record<string, unknown>).read === 1,
  }
}

export class NotificationRepository {
  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const now = new Date().toISOString()
    const id = uuidv4()
    const dbRecord = {
      id,
      projectId: input.projectId,
      projectName: input.projectName,
      sectionId: input.sectionId,
      annotationId: input.annotationId,
      targetUser: input.targetUser,
      type: input.type,
      title: input.title,
      summary: input.summary,
      read: 0,
      createdAt: now,
    }
    try {
      await getDb().insertInto('notifications').values(dbRecord).execute()
      return toRecord(dbRecord as unknown as Record<string, unknown>)
    } catch (err) {
      throw new DatabaseError(`通知创建失败: ${(err as Error).message}`, err)
    }
  }

  async listByUser(targetUser: string, unreadOnly?: boolean): Promise<NotificationRecord[]> {
    try {
      let query = getDb()
        .selectFrom('notifications')
        .selectAll()
        .where('targetUser', '=', targetUser)
      if (unreadOnly) {
        query = query.where('read', '=', 0)
      }
      const rows = await query.orderBy('createdAt', 'desc').execute()
      return rows.map((r) => toRecord(r as unknown as Record<string, unknown>))
    } catch (err) {
      throw new DatabaseError(`通知列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async markRead(id: string): Promise<NotificationRecord> {
    try {
      const result = await getDb()
        .updateTable('notifications')
        .set({ read: 1 })
        .where('id', '=', id)
        .executeTakeFirst()
      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`通知不存在: ${id}`)
      }
      const row = await getDb()
        .selectFrom('notifications')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      return toRecord(row as unknown as Record<string, unknown>)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`通知标记已读失败: ${(err as Error).message}`, err)
    }
  }

  async markAllRead(targetUser: string): Promise<void> {
    try {
      await getDb()
        .updateTable('notifications')
        .set({ read: 1 })
        .where('targetUser', '=', targetUser)
        .where('read', '=', 0)
        .execute()
    } catch (err) {
      throw new DatabaseError(`通知全部已读失败: ${(err as Error).message}`, err)
    }
  }

  async countUnread(targetUser: string): Promise<number> {
    try {
      const result = await getDb()
        .selectFrom('notifications')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('targetUser', '=', targetUser)
        .where('read', '=', 0)
        .executeTakeFirst()
      return (result as unknown as { count: number })?.count ?? 0
    } catch (err) {
      throw new DatabaseError(`通知未读计数失败: ${(err as Error).message}`, err)
    }
  }
}
