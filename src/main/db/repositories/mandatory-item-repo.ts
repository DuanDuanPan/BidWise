import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { MandatoryItem, MandatoryItemStatus } from '@shared/analysis-types'

export class MandatoryItemRepository {
  async create(projectId: string, items: MandatoryItem[]): Promise<void> {
    const now = new Date().toISOString()
    const rows = items.map((item) => ({
      id: item.id || uuidv4(),
      projectId,
      content: item.content,
      sourceText: item.sourceText,
      sourcePages: JSON.stringify(item.sourcePages),
      confidence: item.confidence,
      status: item.status,
      linkedRequirementId: item.linkedRequirementId ?? null,
      detectedAt: item.detectedAt ?? now,
      updatedAt: now,
    }))

    try {
      if (rows.length === 0) return
      await getDb()
        .insertInto('mandatoryItems')
        .values(rows)
        .onConflict((oc) => oc.columns(['projectId', 'content']).doNothing())
        .execute()
    } catch (err) {
      throw new DatabaseError(`必响应项批量插入失败: ${(err as Error).message}`, err)
    }
  }

  /** Atomically replace all items for a project (delete old + insert new in one transaction) */
  async replaceByProject(projectId: string, items: MandatoryItem[]): Promise<void> {
    const now = new Date().toISOString()
    const rows = items.map((item) => ({
      id: item.id || uuidv4(),
      projectId,
      content: item.content,
      sourceText: item.sourceText,
      sourcePages: JSON.stringify(item.sourcePages),
      confidence: item.confidence,
      status: item.status,
      linkedRequirementId: item.linkedRequirementId ?? null,
      detectedAt: item.detectedAt ?? now,
      updatedAt: now,
    }))

    try {
      await getDb()
        .transaction()
        .execute(async (trx) => {
          await trx.deleteFrom('mandatoryItems').where('projectId', '=', projectId).execute()
          if (rows.length > 0) {
            await trx
              .insertInto('mandatoryItems')
              .values(rows)
              .onConflict((oc) => oc.columns(['projectId', 'content']).doNothing())
              .execute()
          }
        })
    } catch (err) {
      throw new DatabaseError(`必响应项替换失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(projectId: string): Promise<MandatoryItem[]> {
    try {
      const rows = await getDb()
        .selectFrom('mandatoryItems')
        .selectAll()
        .where('projectId', '=', projectId)
        .orderBy('confidence', 'desc')
        .orderBy('detectedAt', 'asc')
        .execute()

      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        sourceText: row.sourceText,
        sourcePages: JSON.parse(row.sourcePages) as number[],
        confidence: row.confidence,
        status: row.status as MandatoryItemStatus,
        linkedRequirementId: row.linkedRequirementId,
        detectedAt: row.detectedAt,
        updatedAt: row.updatedAt,
      }))
    } catch (err) {
      throw new DatabaseError(`必响应项查询失败: ${(err as Error).message}`, err)
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
  ): Promise<MandatoryItem> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('mandatoryItems')
        .set({ ...patch, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`必响应项不存在: ${id}`)
      }

      const row = await getDb()
        .selectFrom('mandatoryItems')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return {
        id: row.id,
        content: row.content,
        sourceText: row.sourceText,
        sourcePages: JSON.parse(row.sourcePages) as number[],
        confidence: row.confidence,
        status: row.status as MandatoryItemStatus,
        linkedRequirementId: row.linkedRequirementId,
        detectedAt: row.detectedAt,
        updatedAt: row.updatedAt,
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`必响应项更新失败: ${(err as Error).message}`, err)
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    try {
      await getDb().deleteFrom('mandatoryItems').where('projectId', '=', projectId).execute()
    } catch (err) {
      throw new DatabaseError(`必响应项删除失败: ${(err as Error).message}`, err)
    }
  }

  async findProjectId(itemId: string): Promise<string | null> {
    try {
      const row = await getDb()
        .selectFrom('mandatoryItems')
        .select('projectId')
        .where('id', '=', itemId)
        .executeTakeFirst()
      return row?.projectId ?? null
    } catch (err) {
      throw new DatabaseError(`必响应项查询失败: ${(err as Error).message}`, err)
    }
  }

  async countByProject(projectId: string): Promise<number> {
    try {
      const result = await getDb()
        .selectFrom('mandatoryItems')
        .where('projectId', '=', projectId)
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow()

      return result.count
    } catch (err) {
      throw new DatabaseError(`必响应项计数失败: ${(err as Error).message}`, err)
    }
  }
}
