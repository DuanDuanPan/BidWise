import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type {
  TraceabilityLink,
  CoverageStatus,
  TraceabilityLinkSource,
} from '@shared/analysis-types'

export class TraceabilityLinkRepository {
  /**
   * Replace all auto links for a project, preserving manual links.
   * Runs in a transaction: delete auto → insert new auto.
   */
  async replaceAutoByProject(projectId: string, links: TraceabilityLink[]): Promise<void> {
    const now = new Date().toISOString()

    // Deduplicate by (requirementId, sectionId) - keep first occurrence
    const seen = new Set<string>()
    const uniqueLinks = links.filter((link) => {
      const key = `${link.requirementId}::${link.sectionId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    const rows = uniqueLinks.map((link) => ({
      id: link.id || uuidv4(),
      projectId,
      requirementId: link.requirementId,
      sectionId: link.sectionId,
      sectionTitle: link.sectionTitle,
      coverageStatus: link.coverageStatus,
      confidence: link.confidence,
      matchReason: link.matchReason ?? null,
      source: 'auto' as const,
      createdAt: link.createdAt ?? now,
      updatedAt: now,
    }))

    try {
      await getDb()
        .transaction()
        .execute(async (trx) => {
          // Only delete auto links, preserve manual
          await trx
            .deleteFrom('traceabilityLinks')
            .where('projectId', '=', projectId)
            .where('source', '=', 'auto')
            .execute()
          if (rows.length > 0) {
            await trx.insertInto('traceabilityLinks').values(rows).execute()
          }
        })
    } catch (err) {
      throw new DatabaseError(`追溯链接替换失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<TraceabilityLink | null> {
    try {
      const row = await getDb()
        .selectFrom('traceabilityLinks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()

      return row ? this.toModel(row) : null
    } catch (err) {
      throw new DatabaseError(`追溯链接查询失败: ${(err as Error).message}`, err)
    }
  }

  async findByProject(projectId: string): Promise<TraceabilityLink[]> {
    try {
      const rows = await getDb()
        .selectFrom('traceabilityLinks')
        .selectAll()
        .where('projectId', '=', projectId)
        .execute()

      return rows.map(this.toModel)
    } catch (err) {
      throw new DatabaseError(`追溯链接查询失败: ${(err as Error).message}`, err)
    }
  }

  async findByRequirement(projectId: string, requirementId: string): Promise<TraceabilityLink[]> {
    try {
      const rows = await getDb()
        .selectFrom('traceabilityLinks')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('requirementId', '=', requirementId)
        .execute()

      return rows.map(this.toModel)
    } catch (err) {
      throw new DatabaseError(`追溯链接查询失败: ${(err as Error).message}`, err)
    }
  }

  async findBySection(projectId: string, sectionId: string): Promise<TraceabilityLink[]> {
    try {
      const rows = await getDb()
        .selectFrom('traceabilityLinks')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('sectionId', '=', sectionId)
        .execute()

      return rows.map(this.toModel)
    } catch (err) {
      throw new DatabaseError(`追溯链接查询失败: ${(err as Error).message}`, err)
    }
  }

  async create(link: TraceabilityLink): Promise<TraceabilityLink> {
    const now = new Date().toISOString()
    const row = {
      id: link.id || uuidv4(),
      projectId: link.projectId,
      requirementId: link.requirementId,
      sectionId: link.sectionId,
      sectionTitle: link.sectionTitle,
      coverageStatus: link.coverageStatus,
      confidence: link.confidence,
      matchReason: link.matchReason ?? null,
      source: link.source,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await getDb().insertInto('traceabilityLinks').values(row).execute()
      return this.toModel(row)
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('UNIQUE constraint failed')) {
        throw new DatabaseError(`追溯链接已存在（需求+章节组合重复）: ${message}`, err)
      }
      throw new DatabaseError(`追溯链接创建失败: ${message}`, err)
    }
  }

  async update(
    id: string,
    patch: Partial<Pick<TraceabilityLink, 'coverageStatus' | 'source' | 'matchReason'>>
  ): Promise<TraceabilityLink> {
    try {
      const now = new Date().toISOString()
      const result = await getDb()
        .updateTable('traceabilityLinks')
        .set({ ...patch, updatedAt: now })
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numUpdatedRows === 0n) {
        throw new NotFoundError(`追溯链接不存在: ${id}`)
      }

      const row = await getDb()
        .selectFrom('traceabilityLinks')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return this.toModel(row)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`追溯链接更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const result = await getDb()
        .deleteFrom('traceabilityLinks')
        .where('id', '=', id)
        .executeTakeFirst()

      if (result.numDeletedRows === 0n) {
        throw new NotFoundError(`追溯链接不存在: ${id}`)
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`追溯链接删除失败: ${(err as Error).message}`, err)
    }
  }

  async deleteByProject(projectId: string): Promise<void> {
    try {
      await getDb().deleteFrom('traceabilityLinks').where('projectId', '=', projectId).execute()
    } catch (err) {
      throw new DatabaseError(`追溯链接清除失败: ${(err as Error).message}`, err)
    }
  }

  private toModel(row: {
    id: string
    projectId: string
    requirementId: string
    sectionId: string
    sectionTitle: string
    coverageStatus: string
    confidence: number
    matchReason: string | null
    source: string
    createdAt: string
    updatedAt: string
  }): TraceabilityLink {
    return {
      id: row.id,
      projectId: row.projectId,
      requirementId: row.requirementId,
      sectionId: row.sectionId,
      sectionTitle: row.sectionTitle,
      coverageStatus: row.coverageStatus as CoverageStatus,
      confidence: row.confidence,
      matchReason: row.matchReason,
      source: row.source as TraceabilityLinkSource,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
}
