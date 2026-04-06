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

  async listByProject(projectId: string): Promise<AnnotationRecord[]> {
    try {
      const rows = await getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('projectId', '=', projectId)
        .orderBy('createdAt', 'desc')
        .execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async listBySection(projectId: string, sectionId: string): Promise<AnnotationRecord[]> {
    try {
      const rows = await getDb()
        .selectFrom('annotations')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('sectionId', '=', sectionId)
        .orderBy('createdAt', 'desc')
        .execute()
      return rows as AnnotationRecord[]
    } catch (err) {
      throw new DatabaseError(`批注锚点查询失败: ${(err as Error).message}`, err)
    }
  }
}
