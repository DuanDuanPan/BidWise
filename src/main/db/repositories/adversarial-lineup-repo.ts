import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type {
  AdversarialLineup,
  AdversarialLineupStatus,
  AdversarialGenerationSource,
  AdversarialRole,
} from '@shared/adversarial-types'

export class AdversarialLineupRepository {
  async findByProjectId(projectId: string): Promise<AdversarialLineup | null> {
    try {
      const row = await getDb()
        .selectFrom('adversarialLineups')
        .selectAll()
        .where('projectId', '=', projectId)
        .executeTakeFirst()

      if (!row) return null

      return this.toLineup(row)
    } catch (err) {
      throw new DatabaseError(`对抗阵容查询失败: ${(err as Error).message}`, err)
    }
  }

  async save(input: {
    projectId: string
    roles: AdversarialRole[]
    status: AdversarialLineupStatus
    generationSource: AdversarialGenerationSource
    warningMessage: string | null
    confirmedAt?: string | null
  }): Promise<AdversarialLineup> {
    const now = new Date().toISOString()

    try {
      const existing = await getDb()
        .selectFrom('adversarialLineups')
        .select('id')
        .where('projectId', '=', input.projectId)
        .executeTakeFirst()

      if (existing) {
        // Update existing record in place
        await getDb()
          .updateTable('adversarialLineups')
          .set({
            roles: JSON.stringify(input.roles),
            status: input.status,
            generationSource: input.generationSource,
            warningMessage: input.warningMessage,
            generatedAt: now,
            confirmedAt: input.confirmedAt ?? null,
            updatedAt: now,
          })
          .where('id', '=', existing.id)
          .execute()

        return this.findByIdOrThrow(existing.id)
      }

      // Insert new record
      const id = uuidv4()
      await getDb()
        .insertInto('adversarialLineups')
        .values({
          id,
          projectId: input.projectId,
          roles: JSON.stringify(input.roles),
          status: input.status,
          generationSource: input.generationSource,
          warningMessage: input.warningMessage,
          generatedAt: now,
          confirmedAt: input.confirmedAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .execute()

      return this.findByIdOrThrow(id)
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err
      throw new DatabaseError(`对抗阵容保存失败: ${(err as Error).message}`, err)
    }
  }

  async update(
    id: string,
    patch: {
      roles?: AdversarialRole[]
      status?: AdversarialLineupStatus
      warningMessage?: string | null
      generationSource?: AdversarialGenerationSource
      confirmedAt?: string | null
    }
  ): Promise<AdversarialLineup> {
    const now = new Date().toISOString()

    try {
      const updateData: Record<string, unknown> = { updatedAt: now }
      if (patch.roles !== undefined) updateData.roles = JSON.stringify(patch.roles)
      if (patch.status !== undefined) updateData.status = patch.status
      if (patch.warningMessage !== undefined) updateData.warningMessage = patch.warningMessage
      if (patch.generationSource !== undefined) updateData.generationSource = patch.generationSource
      if (patch.confirmedAt !== undefined) updateData.confirmedAt = patch.confirmedAt

      const result = await getDb()
        .updateTable('adversarialLineups')
        .set(updateData)
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`对抗阵容不存在: ${id}`)
      }

      return this.findByIdOrThrow(id)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`对抗阵容更新失败: ${(err as Error).message}`, err)
    }
  }

  private async findByIdOrThrow(id: string): Promise<AdversarialLineup> {
    const row = await getDb()
      .selectFrom('adversarialLineups')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()

    return this.toLineup(row)
  }

  private toLineup(row: {
    id: string
    projectId: string
    roles: string
    status: string
    generationSource: string
    warningMessage: string | null
    generatedAt: string
    confirmedAt: string | null
    createdAt: string
    updatedAt: string
  }): AdversarialLineup {
    return {
      id: row.id,
      projectId: row.projectId,
      roles: JSON.parse(row.roles) as AdversarialRole[],
      status: row.status as AdversarialLineupStatus,
      generationSource: row.generationSource as AdversarialGenerationSource,
      warningMessage: row.warningMessage,
      generatedAt: row.generatedAt,
      confirmedAt: row.confirmedAt,
    }
  }
}
