import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { RequirementItem } from '@shared/analysis-types'

export class RequirementRepository {
  async create(projectId: string, items: RequirementItem[]): Promise<void> {
    const now = new Date().toISOString()
    const rows = items.map((item) => ({
      id: item.id || uuidv4(),
      projectId,
      sequenceNumber: item.sequenceNumber,
      description: item.description,
      sourcePages: JSON.stringify(item.sourcePages),
      category: item.category,
      priority: item.priority,
      status: item.status,
      createdAt: now,
      updatedAt: now,
    }))

    try {
      if (rows.length === 0) return
      await getDb().insertInto('requirements').values(rows).execute()
    } catch (err) {
      throw new DatabaseError(`需求条目批量插入失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(
    projectId: string,
    opts?: { includeDeleted?: boolean }
  ): Promise<RequirementItem[]> {
    try {
      let query = getDb().selectFrom('requirements').selectAll().where('projectId', '=', projectId)

      if (!opts?.includeDeleted) {
        query = query.where('status', '!=', 'deleted')
      }

      const rows = await query.orderBy('sequenceNumber', 'asc').execute()

      return rows.map((row) => ({
        id: row.id,
        sequenceNumber: row.sequenceNumber,
        description: row.description,
        sourcePages: JSON.parse(row.sourcePages) as number[],
        category: row.category as RequirementItem['category'],
        priority: row.priority as RequirementItem['priority'],
        status: row.status as RequirementItem['status'],
      }))
    } catch (err) {
      throw new DatabaseError(`需求条目查询失败: ${(err as Error).message}`, err)
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
  ): Promise<RequirementItem> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('requirements')
        .set({ ...patch, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`需求条目不存在: ${id}`)
      }

      const row = await getDb()
        .selectFrom('requirements')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return {
        id: row.id,
        sequenceNumber: row.sequenceNumber,
        description: row.description,
        sourcePages: JSON.parse(row.sourcePages) as number[],
        category: row.category as RequirementItem['category'],
        priority: row.priority as RequirementItem['priority'],
        status: row.status as RequirementItem['status'],
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`需求条目更新失败: ${(err as Error).message}`, err)
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    try {
      await getDb().deleteFrom('requirements').where('projectId', '=', projectId).execute()
    } catch (err) {
      throw new DatabaseError(`需求条目删除失败: ${(err as Error).message}`, err)
    }
  }
}
