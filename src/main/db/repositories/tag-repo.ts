import { v4 as uuidv4 } from 'uuid'
import { sql } from 'kysely'
import { getDb } from '../client'
import { DatabaseError } from '@main/utils/errors'
import type { Tag } from '@shared/asset-types'

export class TagRepository {
  async findOrCreateMany(tagNames: string[]): Promise<Tag[]> {
    try {
      const db = getDb()
      const now = new Date().toISOString()
      const result: Tag[] = []

      for (const name of tagNames) {
        const trimmed = name.trim()
        if (!trimmed) continue
        const normalized = trimmed.toLowerCase()

        const existing = await db
          .selectFrom('tags')
          .selectAll()
          .where('normalizedName', '=', normalized)
          .executeTakeFirst()

        if (existing) {
          result.push(existing as unknown as Tag)
        } else {
          const tag: Tag = {
            id: uuidv4(),
            name: trimmed,
            normalizedName: normalized,
            createdAt: now,
          }
          await db.insertInto('tags').values(tag).execute()
          result.push(tag)
        }
      }

      return result
    } catch (err) {
      throw new DatabaseError(`标签批量创建失败: ${(err as Error).message}`, err)
    }
  }

  async findByAssetId(assetId: string): Promise<Tag[]> {
    try {
      const rows = await getDb()
        .selectFrom('tags')
        .innerJoin('assetTags', 'assetTags.tagId', 'tags.id')
        .where('assetTags.assetId', '=', assetId)
        .selectAll('tags')
        .orderBy('tags.name', 'asc')
        .execute()
      return rows as unknown as Tag[]
    } catch (err) {
      throw new DatabaseError(`资产标签查询失败: ${(err as Error).message}`, err)
    }
  }

  async replaceAssetTags(assetId: string, tagIds: string[]): Promise<void> {
    try {
      const db = getDb()

      await db.deleteFrom('assetTags').where('assetId', '=', assetId).execute()

      if (tagIds.length > 0) {
        const rows = tagIds.map((tagId) => ({ assetId, tagId }))
        await db.insertInto('assetTags').values(rows).execute()
      }
    } catch (err) {
      throw new DatabaseError(`资产标签替换失败: ${(err as Error).message}`, err)
    }
  }

  async deleteOrphanedTags(): Promise<void> {
    try {
      await getDb()
        .deleteFrom('tags')
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom('assetTags')
                .whereRef('assetTags.tagId', '=', 'tags.id')
                .select(sql<number>`1`.as('one'))
            )
          )
        )
        .execute()
    } catch (err) {
      throw new DatabaseError(`孤立标签清理失败: ${(err as Error).message}`, err)
    }
  }
}
