import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { StrategySeed, StrategySeedStatus } from '@shared/analysis-types'

export class StrategySeedRepository {
  async replaceByProject(projectId: string, seeds: StrategySeed[]): Promise<void> {
    const now = new Date().toISOString()

    // Deduplicate by title within the batch (keep first occurrence)
    const seen = new Set<string>()
    const uniqueSeeds = seeds.filter((seed) => {
      if (seen.has(seed.title)) return false
      seen.add(seed.title)
      return true
    })

    const rows = uniqueSeeds.map((seed) => ({
      id: seed.id || uuidv4(),
      projectId,
      title: seed.title,
      reasoning: seed.reasoning,
      suggestion: seed.suggestion,
      sourceExcerpt: seed.sourceExcerpt,
      confidence: seed.confidence,
      status: seed.status,
      createdAt: seed.createdAt ?? now,
      updatedAt: now,
    }))

    try {
      await getDb()
        .transaction()
        .execute(async (trx) => {
          await trx.deleteFrom('strategySeeds').where('projectId', '=', projectId).execute()
          if (rows.length > 0) {
            await trx.insertInto('strategySeeds').values(rows).execute()
          }
        })
    } catch (err) {
      throw new DatabaseError(`策略种子替换失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(projectId: string): Promise<StrategySeed[]> {
    try {
      const rows = await getDb()
        .selectFrom('strategySeeds')
        .selectAll()
        .where('projectId', '=', projectId)
        .orderBy('confidence', 'desc')
        .orderBy('createdAt', 'asc')
        .execute()

      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        reasoning: row.reasoning,
        suggestion: row.suggestion,
        sourceExcerpt: row.sourceExcerpt,
        confidence: row.confidence,
        status: row.status as StrategySeedStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
    } catch (err) {
      throw new DatabaseError(`策略种子查询失败: ${(err as Error).message}`, err)
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>
  ): Promise<StrategySeed> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('strategySeeds')
        .set({ ...patch, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`策略种子不存在: ${id}`)
      }

      const row = await getDb()
        .selectFrom('strategySeeds')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return {
        id: row.id,
        title: row.title,
        reasoning: row.reasoning,
        suggestion: row.suggestion,
        sourceExcerpt: row.sourceExcerpt,
        confidence: row.confidence,
        status: row.status as StrategySeedStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`策略种子更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await getDb()
        .deleteFrom('strategySeeds')
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numDeletedRows === 0n) {
        throw new NotFoundError(`策略种子不存在: ${id}`)
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`策略种子删除失败: ${(err as Error).message}`, err)
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    try {
      await getDb().deleteFrom('strategySeeds').where('projectId', '=', projectId).execute()
    } catch (err) {
      throw new DatabaseError(`策略种子删除失败: ${(err as Error).message}`, err)
    }
  }

  async findProjectId(seedId: string): Promise<string | null> {
    try {
      const row = await getDb()
        .selectFrom('strategySeeds')
        .select('projectId')
        .where('id', '=', seedId)
        .executeTakeFirst()
      return row?.projectId ?? null
    } catch (err) {
      throw new DatabaseError(`策略种子查询失败: ${(err as Error).message}`, err)
    }
  }

  async titleExists(projectId: string, title: string, excludeId?: string): Promise<boolean> {
    try {
      let query = getDb()
        .selectFrom('strategySeeds')
        .select('id')
        .where('projectId', '=', projectId)
        .where('title', '=', title)

      if (excludeId) {
        query = query.where('id', '!=', excludeId)
      }

      const row = await query.executeTakeFirst()
      return !!row
    } catch (err) {
      throw new DatabaseError(`策略种子查重失败: ${(err as Error).message}`, err)
    }
  }
}
