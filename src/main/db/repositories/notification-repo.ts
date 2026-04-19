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

  /** Story 11.4: fetch notifications for a projectId + sectionId set (Undo snapshot). */
  async findByProjectAndSectionIds(
    projectId: string,
    sectionIds: string[]
  ): Promise<NotificationRecord[]> {
    if (sectionIds.length === 0) return []
    try {
      const rows = await getDb()
        .selectFrom('notifications')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('sectionId', 'in', sectionIds)
        .execute()
      return rows.map((r) => toRecord(r as unknown as Record<string, unknown>))
    } catch (err) {
      throw new DatabaseError(`通知批量查询失败: ${(err as Error).message}`, err)
    }
  }

  /** Story 11.4: batch delete notifications by projectId + sectionId set. */
  async deleteByProjectAndSectionIds(projectId: string, sectionIds: string[]): Promise<number> {
    if (sectionIds.length === 0) return 0
    try {
      const result = await getDb()
        .deleteFrom('notifications')
        .where('projectId', '=', projectId)
        .where('sectionId', 'in', sectionIds)
        .executeTakeFirst()
      return Number(result.numDeletedRows ?? 0n)
    } catch (err) {
      throw new DatabaseError(`通知批量删除失败: ${(err as Error).message}`, err)
    }
  }

  /** Story 11.4: re-insert previously deleted notifications verbatim during Undo. */
  async insertBatch(records: NotificationRecord[]): Promise<void> {
    if (records.length === 0) return
    const rows = records.map((record) => ({
      id: record.id,
      projectId: record.projectId,
      projectName: record.projectName,
      sectionId: record.sectionId,
      annotationId: record.annotationId,
      targetUser: record.targetUser,
      type: record.type,
      title: record.title,
      summary: record.summary,
      read: record.read ? 1 : 0,
      createdAt: record.createdAt,
    }))
    try {
      await getDb()
        .insertInto('notifications')
        .values(rows)
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()
    } catch (err) {
      throw new DatabaseError(`通知批量恢复失败: ${(err as Error).message}`, err)
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
