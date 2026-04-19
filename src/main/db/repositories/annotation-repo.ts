import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { AnnotationRecord } from '@shared/annotation-types'
import type { CreateAnnotationInput, UpdateAnnotationInput } from '@shared/annotation-types'

export class AnnotationRepository {
  async create(input: CreateAnnotationInput): Promise<AnnotationRecord> {
    const now = new Date().toISOString()
    const record: AnnotationRecord = {
      id: uuidv4(),
      projectId: input.projectId,
      sectionId: input.sectionId,
      type: input.type,
      content: input.content,
      author: input.author,
      status: 'pending',
      parentId: input.parentId ?? null,
      assignee: input.assignee ?? null,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await getDb().insertInto('annotations').values(record).execute()
      return record
    } catch (err) {
      throw new DatabaseError(`批注创建失败: ${(err as Error).message}`, err)
    }
  }

  async update(input: UpdateAnnotationInput): Promise<AnnotationRecord> {
    try {
      const now = new Date().toISOString()
      const updates: Record<string, unknown> = { updatedAt: now }
      if (input.content !== undefined) updates.content = input.content
      if (input.status !== undefined) updates.status = input.status
      if (input.assignee !== undefined) updates.assignee = input.assignee

      const result = await getDb()
        .updateTable('annotations')
        .set(updates)
        .where('id', '=', input.id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`批注不存在: ${input.id}`)
      }
      return this.findById(input.id) as Promise<AnnotationRecord>
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`批注更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await getDb().deleteFrom('annotations').where('id', '=', id).executeTakeFirst()
      if (result.numDeletedRows === 0n) {
        throw new NotFoundError(`批注不存在: ${id}`)
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`批注删除失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<AnnotationRecord | null> {
    try {
      const row = await getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      return (row as AnnotationRecord | undefined) ?? null
    } catch (err) {
      throw new DatabaseError(`批注查询失败: ${(err as Error).message}`, err)
    }
  }

  async listByProject(
    projectId: string,
    options?: { includeReplies?: boolean }
  ): Promise<AnnotationRecord[]> {
    try {
      let query = getDb().selectFrom('annotations').selectAll().where('projectId', '=', projectId)
      if (!options?.includeReplies) {
        query = query.where('parentId', 'is', null)
      }
      const rows = await query.orderBy('createdAt', 'desc').execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async listBySection(
    projectId: string,
    sectionId: string,
    options?: { includeReplies?: boolean }
  ): Promise<AnnotationRecord[]> {
    try {
      let query = getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('sectionId', '=', sectionId)
      if (!options?.includeReplies) {
        query = query.where('parentId', 'is', null)
      }
      const rows = await query.orderBy('createdAt', 'desc').execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注锚点查询失败: ${(err as Error).message}`, err)
    }
  }

  /**
   * Story 11.4: fetch all annotations for the given projectId + sectionId set.
   * Returned rows feed the Undo snapshot; callers are responsible for scoping
   * to the active soft-delete batch.
   */
  async findByProjectAndSectionIds(
    projectId: string,
    sectionIds: string[]
  ): Promise<AnnotationRecord[]> {
    if (sectionIds.length === 0) return []
    try {
      const rows = await getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('sectionId', 'in', sectionIds)
        .execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注批量查询失败: ${(err as Error).message}`, err)
    }
  }

  /** Story 11.4: batch delete annotations by projectId + sectionId set. */
  async deleteByProjectAndSectionIds(projectId: string, sectionIds: string[]): Promise<number> {
    if (sectionIds.length === 0) return 0
    try {
      const result = await getDb()
        .deleteFrom('annotations')
        .where('projectId', '=', projectId)
        .where('sectionId', 'in', sectionIds)
        .executeTakeFirst()
      return Number(result.numDeletedRows ?? 0n)
    } catch (err) {
      throw new DatabaseError(`批注批量删除失败: ${(err as Error).message}`, err)
    }
  }

  /**
   * Story 11.4: re-insert previously deleted annotations verbatim during Undo.
   * Ignores duplicate-id conflicts so the call is idempotent against partial
   * successes from a crashed staging commit.
   */
  async insertBatch(records: AnnotationRecord[]): Promise<void> {
    if (records.length === 0) return
    try {
      await getDb()
        .insertInto('annotations')
        .values(records)
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()
    } catch (err) {
      throw new DatabaseError(`批注批量恢复失败: ${(err as Error).message}`, err)
    }
  }

  async listReplies(parentId: string): Promise<AnnotationRecord[]> {
    try {
      const rows = await getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('parentId', '=', parentId)
        .orderBy('createdAt', 'asc')
        .execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注回复查询失败: ${(err as Error).message}`, err)
    }
  }
}
