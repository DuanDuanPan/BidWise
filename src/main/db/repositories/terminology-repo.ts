import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { TerminologyEntry, TerminologyListFilter } from '@shared/terminology-types'

function toBoolean(value: number): boolean {
  return value === 1
}

function fromBoolean(value: boolean): number {
  return value ? 1 : 0
}

function rowToEntry(row: Record<string, unknown>): TerminologyEntry {
  return {
    ...(row as unknown as Omit<TerminologyEntry, 'isActive'>),
    isActive: toBoolean(row.isActive as number),
  }
}

export class TerminologyRepository {
  async list(filter?: TerminologyListFilter): Promise<TerminologyEntry[]> {
    try {
      const db = getDb()
      let query = db.selectFrom('terminologyEntries').selectAll()

      if (filter?.searchQuery) {
        const keyword = `%${filter.searchQuery}%`
        query = query.where((eb) =>
          eb.or([eb('sourceTerm', 'like', keyword), eb('targetTerm', 'like', keyword)])
        )
      }

      if (filter?.category) {
        query = query.where('category', '=', filter.category)
      }

      if (filter?.isActive !== undefined) {
        query = query.where('isActive', '=', fromBoolean(filter.isActive))
      }

      query = query.orderBy('updatedAt', 'desc')

      const rows = await query.execute()
      return rows.map((r) => rowToEntry(r as unknown as Record<string, unknown>))
    } catch (err) {
      throw new DatabaseError(`术语列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<TerminologyEntry | null> {
    try {
      const row = await getDb()
        .selectFrom('terminologyEntries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      if (!row) return null
      return rowToEntry(row as unknown as Record<string, unknown>)
    } catch (err) {
      throw new DatabaseError(`术语查询失败: ${(err as Error).message}`, err)
    }
  }

  async findByNormalizedSourceTerm(normalized: string): Promise<TerminologyEntry | null> {
    try {
      const row = await getDb()
        .selectFrom('terminologyEntries')
        .selectAll()
        .where('normalizedSourceTerm', '=', normalized)
        .executeTakeFirst()
      if (!row) return null
      return rowToEntry(row as unknown as Record<string, unknown>)
    } catch (err) {
      throw new DatabaseError(`术语查询失败: ${(err as Error).message}`, err)
    }
  }

  async create(input: {
    sourceTerm: string
    targetTerm: string
    normalizedSourceTerm: string
    category: string | null
    description: string | null
    isActive?: number
  }): Promise<TerminologyEntry> {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const id = uuidv4()

      await db
        .insertInto('terminologyEntries')
        .values({
          id,
          sourceTerm: input.sourceTerm,
          targetTerm: input.targetTerm,
          normalizedSourceTerm: input.normalizedSourceTerm,
          category: input.category,
          description: input.description,
          isActive: input.isActive ?? 1,
          createdAt: now,
          updatedAt: now,
        })
        .execute()

      const row = await db
        .selectFrom('terminologyEntries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow()

      return rowToEntry(row as unknown as Record<string, unknown>)
    } catch (err) {
      throw new DatabaseError(`术语创建失败: ${(err as Error).message}`, err)
    }
  }

  async update(
    id: string,
    fields: Partial<{
      sourceTerm: string
      targetTerm: string
      normalizedSourceTerm: string
      category: string | null
      description: string | null
      isActive: number
    }>
  ): Promise<TerminologyEntry> {
    try {
      const db = getDb()
      const now = new Date().toISOString()

      await db
        .updateTable('terminologyEntries')
        .set({ ...fields, updatedAt: now })
        .where('id', '=', id)
        .execute()

      const row = await db
        .selectFrom('terminologyEntries')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()

      if (!row) {
        throw new NotFoundError(`术语条目不存在: ${id}`)
      }

      return rowToEntry(row as unknown as Record<string, unknown>)
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`术语更新失败: ${(err as Error).message}`, err)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await getDb().deleteFrom('terminologyEntries').where('id', '=', id).execute()
    } catch (err) {
      throw new DatabaseError(`术语删除失败: ${(err as Error).message}`, err)
    }
  }

  async findActive(): Promise<TerminologyEntry[]> {
    try {
      const db = getDb()
      const rows = await db
        .selectFrom('terminologyEntries')
        .selectAll()
        .where('isActive', '=', 1)
        .execute()

      // Sort by sourceTerm length DESC for longest-match-first
      const entries = rows.map((r) => rowToEntry(r as unknown as Record<string, unknown>))
      entries.sort((a, b) => b.sourceTerm.length - a.sourceTerm.length)
      return entries
    } catch (err) {
      throw new DatabaseError(`活跃术语查询失败: ${(err as Error).message}`, err)
    }
  }

  async count(filter?: TerminologyListFilter): Promise<number> {
    try {
      const db = getDb()
      let query = db.selectFrom('terminologyEntries').select(db.fn.countAll<number>().as('count'))

      if (filter?.searchQuery) {
        const keyword = `%${filter.searchQuery}%`
        query = query.where((eb) =>
          eb.or([eb('sourceTerm', 'like', keyword), eb('targetTerm', 'like', keyword)])
        )
      }

      if (filter?.category) {
        query = query.where('category', '=', filter.category)
      }

      if (filter?.isActive !== undefined) {
        query = query.where('isActive', '=', fromBoolean(filter.isActive))
      }

      const result = await query.executeTakeFirstOrThrow()
      return result.count
    } catch (err) {
      throw new DatabaseError(`术语计数失败: ${(err as Error).message}`, err)
    }
  }
}
