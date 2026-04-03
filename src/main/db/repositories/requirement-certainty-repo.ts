import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { RequirementCertainty, CertaintyLevel } from '@shared/analysis-types'

export class RequirementCertaintyRepository {
  async replaceByProject(
    projectId: string,
    items: Omit<RequirementCertainty, 'confirmed' | 'confirmedAt'>[]
  ): Promise<void> {
    const now = new Date().toISOString()
    const rows = items.map((item) => ({
      id: item.id || uuidv4(),
      projectId,
      requirementId: item.requirementId,
      certaintyLevel: item.certaintyLevel,
      reason: item.reason,
      suggestion: item.suggestion,
      confirmed: 0,
      confirmedAt: null as string | null,
      createdAt: item.createdAt ?? now,
      updatedAt: now,
    }))

    try {
      await getDb()
        .transaction()
        .execute(async (trx) => {
          await trx
            .deleteFrom('requirementCertainties')
            .where('projectId', '=', projectId)
            .execute()
          if (rows.length > 0) {
            await trx.insertInto('requirementCertainties').values(rows).execute()
          }
        })
    } catch (err) {
      throw new DatabaseError(`需求确定性分级替换失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(projectId: string): Promise<RequirementCertainty[]> {
    try {
      const rows = await getDb()
        .selectFrom('requirementCertainties')
        .selectAll()
        .where('projectId', '=', projectId)
        .orderBy((eb) =>
          eb
            .case()
            .when('certaintyLevel', '=', 'risky')
            .then(0)
            .when('certaintyLevel', '=', 'ambiguous')
            .then(1)
            .when('certaintyLevel', '=', 'clear')
            .then(2)
            .else(3)
            .end()
        )
        .execute()

      return rows.map((row) => ({
        id: row.id,
        requirementId: row.requirementId,
        certaintyLevel: row.certaintyLevel as CertaintyLevel,
        reason: row.reason,
        suggestion: row.suggestion,
        confirmed: row.confirmed === 1,
        confirmedAt: row.confirmedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
    } catch (err) {
      throw new DatabaseError(`需求确定性分级查询失败: ${(err as Error).message}`, err)
    }
  }

  async confirmItem(id: string): Promise<RequirementCertainty> {
    const now = new Date().toISOString()
    try {
      const result = await getDb()
        .updateTable('requirementCertainties')
        .set({ confirmed: 1, confirmedAt: now, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`需求确定性分级不存在: ${id}`)
      }

      const row = await getDb()
        .selectFrom('requirementCertainties')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return {
        id: row.id,
        requirementId: row.requirementId,
        certaintyLevel: row.certaintyLevel as CertaintyLevel,
        reason: row.reason,
        suggestion: row.suggestion,
        confirmed: row.confirmed === 1,
        confirmedAt: row.confirmedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`需求确定性确认失败: ${(err as Error).message}`, err)
    }
  }

  async batchConfirm(projectId: string): Promise<void> {
    const now = new Date().toISOString()
    try {
      await getDb()
        .updateTable('requirementCertainties')
        .set({ confirmed: 1, confirmedAt: now, updatedAt: now })
        .where('projectId', '=', projectId)
        .where('confirmed', '=', 0)
        .where('certaintyLevel', '!=', 'clear')
        .execute()
    } catch (err) {
      throw new DatabaseError(`需求确定性批量确认失败: ${(err as Error).message}`, err)
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    try {
      await getDb()
        .deleteFrom('requirementCertainties')
        .where('projectId', '=', projectId)
        .execute()
    } catch (err) {
      throw new DatabaseError(`需求确定性分级删除失败: ${(err as Error).message}`, err)
    }
  }

  async findProjectId(id: string): Promise<string | null> {
    try {
      const row = await getDb()
        .selectFrom('requirementCertainties')
        .select('projectId')
        .where('id', '=', id)
        .executeTakeFirst()
      return row?.projectId ?? null
    } catch (err) {
      throw new DatabaseError(`需求确定性分级查询失败: ${(err as Error).message}`, err)
    }
  }
}
