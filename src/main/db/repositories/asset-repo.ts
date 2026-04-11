import { sql } from 'kysely'
import { getDb } from '../client'
import { DatabaseError, NotFoundError } from '@main/utils/errors'
import type { Asset, AssetType, AssetListFilter, Tag } from '@shared/asset-types'

export interface AssetSearchInput {
  keyword: string
  tagNames: string[]
  assetTypes: AssetType[]
}

export interface AssetSearchOutput {
  items: Asset[]
  total: number
  rawRanks: Record<string, number>
}

export interface AssetListOutput {
  items: Asset[]
  total: number
}

// Trigram FTS requires keyword length >= 3 characters.
// Only use FTS when the keyword is purely word characters (letters/digits/CJK)
// and whitespace. Any punctuation or operator (+ / : - ^ ~ " etc.) falls back to LIKE.
function shouldUseFts(keyword: string): boolean {
  if (keyword.length < 3) return false
  if (/[^\p{L}\p{N}\s_]/u.test(keyword)) return false
  return true
}

export class AssetRepository {
  async search(input: AssetSearchInput): Promise<AssetSearchOutput> {
    try {
      const db = getDb()
      const { keyword, tagNames, assetTypes } = input
      const hasKeyword = keyword.trim().length > 0
      const hasTags = tagNames.length > 0
      const hasTypes = assetTypes.length > 0

      // Pure tag / pure type filter — no FTS
      if (!hasKeyword) {
        return this.listWithFilters(tagNames, assetTypes)
      }

      const trimmedKeyword = keyword.trim()
      const useFts = shouldUseFts(trimmedKeyword)

      if (useFts) {
        // FTS5 trigram search with bm25 ranking — build via sql template
        // because Kysely's typed join doesn't know about virtual tables.
        const fragments = [
          sql`SELECT assets.*, bm25(assets_fts) AS rank
               FROM assets
               INNER JOIN assets_fts ON assets.rowid = assets_fts.rowid
               WHERE assets_fts MATCH ${trimmedKeyword}`,
        ]

        if (hasTypes) {
          fragments.push(
            sql`AND assets.asset_type IN (${sql.join(assetTypes.map((t) => sql`${t}`))})`
          )
        }

        if (hasTags) {
          for (const tagName of tagNames) {
            const normalized = tagName.trim().toLowerCase()
            fragments.push(sql`AND EXISTS (
              SELECT 1 FROM asset_tags
              INNER JOIN tags ON tags.id = asset_tags.tag_id
              WHERE asset_tags.asset_id = assets.id
              AND tags.normalized_name = ${normalized}
            )`)
          }
        }

        fragments.push(sql`ORDER BY bm25(assets_fts) ASC`)

        type FtsRow = {
          id: string
          project_id: string | null
          title: string
          summary: string
          content: string
          asset_type: string
          source_project: string | null
          source_section: string | null
          created_at: string
          updated_at: string
          rank: number
        }

        const result = await sql.join(fragments, sql` `).execute(db)
        const rows = result.rows as FtsRow[]

        const items: Asset[] = rows.map((r) => ({
          id: r.id,
          projectId: r.project_id,
          title: r.title,
          summary: r.summary,
          content: r.content,
          assetType: r.asset_type as AssetType,
          sourceProject: r.source_project,
          sourceSection: r.source_section,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }))

        const rawRanks: Record<string, number> = {}
        for (const r of rows) {
          rawRanks[r.id] = r.rank
        }

        return { items, total: items.length, rawRanks }
      }

      // Fallback: LIKE search for short keywords or special characters
      let query = db
        .selectFrom('assets')
        .selectAll()
        .where((eb) =>
          eb.or([
            eb('title', 'like', `%${trimmedKeyword}%`),
            eb('summary', 'like', `%${trimmedKeyword}%`),
            eb('content', 'like', `%${trimmedKeyword}%`),
          ])
        )

      if (hasTypes) {
        query = query.where('assetType', 'in', assetTypes)
      }

      if (hasTags) {
        for (const tagName of tagNames) {
          const normalized = tagName.trim().toLowerCase()
          query = query.where((eb) =>
            eb.exists(
              eb
                .selectFrom('assetTags')
                .innerJoin('tags', 'tags.id', 'assetTags.tagId')
                .whereRef('assetTags.assetId', '=', 'assets.id')
                .where('tags.normalizedName', '=', normalized)
                .select(sql<number>`1`.as('one'))
            )
          )
        }
      }

      query = query.orderBy('updatedAt', 'desc')

      const rows = await query.execute()
      const items = rows as unknown as Asset[]

      return { items, total: items.length, rawRanks: {} }
    } catch (err) {
      if (err instanceof NotFoundError) throw err
      throw new DatabaseError(`资产检索失败: ${(err as Error).message}`, err)
    }
  }

  async list(filter?: AssetListFilter): Promise<AssetListOutput> {
    try {
      const db = getDb()
      let query = db.selectFrom('assets').selectAll()

      if (filter?.assetTypes && filter.assetTypes.length > 0) {
        query = query.where('assetType', 'in', filter.assetTypes)
      }

      query = query.orderBy('updatedAt', 'desc')

      const rows = await query.execute()
      const items = rows as unknown as Asset[]
      return { items, total: items.length }
    } catch (err) {
      throw new DatabaseError(`资产列表查询失败: ${(err as Error).message}`, err)
    }
  }

  async findById(id: string): Promise<Asset | null> {
    try {
      const row = await getDb()
        .selectFrom('assets')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst()
      return (row as unknown as Asset | undefined) ?? null
    } catch (err) {
      throw new DatabaseError(`资产查询失败: ${(err as Error).message}`, err)
    }
  }

  async findTagsByAssetId(assetId: string): Promise<Tag[]> {
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

  private async listWithFilters(
    tagNames: string[],
    assetTypes: AssetType[]
  ): Promise<AssetSearchOutput> {
    const db = getDb()
    let query = db.selectFrom('assets').selectAll()

    if (assetTypes.length > 0) {
      query = query.where('assetType', 'in', assetTypes)
    }

    if (tagNames.length > 0) {
      for (const tagName of tagNames) {
        const normalized = tagName.trim().toLowerCase()
        query = query.where((eb) =>
          eb.exists(
            eb
              .selectFrom('assetTags')
              .innerJoin('tags', 'tags.id', 'assetTags.tagId')
              .whereRef('assetTags.assetId', '=', 'assets.id')
              .where('tags.normalizedName', '=', normalized)
              .select(sql<number>`1`.as('one'))
          )
        )
      }
    }

    query = query.orderBy('updatedAt', 'desc')

    const rows = await query.execute()
    const items = rows as unknown as Asset[]
    return { items, total: items.length, rawRanks: {} }
  }
}
