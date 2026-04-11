import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'
import * as migration002 from '@main/db/migrations/002_add_industry'
import * as migration003 from '@main/db/migrations/003_create_tasks'
import * as migration004 from '@main/db/migrations/004_create_requirements_scoring'
import * as migration005 from '@main/db/migrations/005_create_mandatory_items'
import * as migration006 from '@main/db/migrations/006_create_strategy_seeds'
import * as migration007 from '@main/db/migrations/007_create_annotations'
import * as migration008 from '@main/db/migrations/008_create_requirement_certainties'
import * as migration009 from '@main/db/migrations/009_create_traceability_links'
import * as migration010 from '@main/db/migrations/010_add_annotation_thread_fields'
import * as migration011 from '@main/db/migrations/011_create_notifications'
import * as migration012 from '@main/db/migrations/012_create_assets_and_tags'

// We need to test against a real SQLite because FTS5 and triggers are involved.
// We'll mock getDb() to return our in-memory DB.

import { vi } from 'vitest'

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
  '002_add_industry': migration002,
  '003_create_tasks': migration003,
  '004_create_requirements_scoring': migration004,
  '005_create_mandatory_items': migration005,
  '006_create_strategy_seeds': migration006,
  '007_create_annotations': migration007,
  '008_create_requirement_certainties': migration008,
  '009_create_traceability_links': migration009,
  '010_add_annotation_thread_fields': migration010,
  '011_create_notifications': migration011,
  '012_create_assets_and_tags': migration012,
}

let testDb: Kysely<DB>

vi.mock('@main/db/client', () => ({
  getDb: () => testDb,
}))

vi.mock('@main/utils/errors', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>
  return mod
})

const { AssetRepository } = await import('@main/db/repositories/asset-repo')

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

async function seedAsset(
  db: Kysely<DB>,
  data: {
    id: string
    title: string
    content: string
    assetType: string
    summary?: string
    sourceProject?: string
  }
): Promise<void> {
  const now = new Date().toISOString()
  await db
    .insertInto('assets')
    .values({
      id: data.id,
      projectId: null,
      title: data.title,
      summary: data.summary ?? '',
      content: data.content,
      assetType: data.assetType,
      sourceProject: data.sourceProject ?? null,
      sourceSection: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute()
}

async function seedTag(db: Kysely<DB>, data: { id: string; name: string }): Promise<void> {
  await db
    .insertInto('tags')
    .values({
      id: data.id,
      name: data.name,
      normalizedName: data.name.toLowerCase(),
      createdAt: new Date().toISOString(),
    })
    .execute()
}

async function linkAssetTag(db: Kysely<DB>, assetId: string, tagId: string): Promise<void> {
  await db.insertInto('assetTags').values({ assetId, tagId }).execute()
}

describe('AssetRepository', () => {
  let repo: InstanceType<typeof AssetRepository>

  beforeEach(async () => {
    testDb = createTestDb()
    const migrator = new Migrator({
      db: testDb,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()
    repo = new AssetRepository()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  it('search with Chinese keyword returns matching assets via FTS', async () => {
    await seedAsset(testDb, {
      id: 'a1',
      title: '微服务架构设计',
      content: '基于微服务架构的分布式系统设计方案',
      assetType: 'text',
    })
    await seedAsset(testDb, {
      id: 'a2',
      title: '数据库优化指南',
      content: 'SQL性能调优最佳实践',
      assetType: 'text',
    })

    const result = await repo.search({ keyword: '微服务', tagNames: [], assetTypes: [] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a1')
    expect(result.rawRanks).toHaveProperty('a1')
  })

  it('search with tag AND filtering', async () => {
    await seedAsset(testDb, {
      id: 'a1',
      title: '架构图示例',
      content: '这是架构图',
      assetType: 'diagram',
    })
    await seedAsset(testDb, { id: 'a2', title: '案例分析', content: '这是案例', assetType: 'case' })
    await seedTag(testDb, { id: 't1', name: '架构图' })
    await seedTag(testDb, { id: 't2', name: '案例' })
    await linkAssetTag(testDb, 'a1', 't1')
    await linkAssetTag(testDb, 'a2', 't2')

    // Single tag filter
    const result = await repo.search({ keyword: '', tagNames: ['架构图'], assetTypes: [] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a1')
  })

  it('search with asset type filter', async () => {
    await seedAsset(testDb, { id: 'a1', title: '文本片段', content: '内容', assetType: 'text' })
    await seedAsset(testDb, { id: 'a2', title: '架构图片', content: '图片', assetType: 'diagram' })

    const result = await repo.search({ keyword: '', tagNames: [], assetTypes: ['diagram'] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a2')
  })

  it('short keyword fallback to LIKE search', async () => {
    await seedAsset(testDb, { id: 'a1', title: 'AI系统', content: 'AI相关内容', assetType: 'text' })

    // keyword < 3 chars should fallback to LIKE
    const result = await repo.search({ keyword: 'AI', tagNames: [], assetTypes: [] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a1')
  })

  it('list returns all assets ordered by updatedAt desc', async () => {
    await seedAsset(testDb, { id: 'a1', title: '旧资产', content: '内容1', assetType: 'text' })
    // Give a slight delay in timestamp
    await seedAsset(testDb, { id: 'a2', title: '新资产', content: '内容2', assetType: 'case' })

    const result = await repo.list()
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
  })

  it('list with type filter', async () => {
    await seedAsset(testDb, { id: 'a1', title: 'T1', content: 'C1', assetType: 'text' })
    await seedAsset(testDb, { id: 'a2', title: 'T2', content: 'C2', assetType: 'table' })

    const result = await repo.list({ assetTypes: ['table'] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a2')
  })

  it('findById returns null for missing asset', async () => {
    const result = await repo.findById('nonexistent')
    expect(result).toBeNull()
  })

  it('findTagsByAssetId returns tags for asset', async () => {
    await seedAsset(testDb, { id: 'a1', title: 'T', content: 'C', assetType: 'text' })
    await seedTag(testDb, { id: 't1', name: '标签A' })
    await seedTag(testDb, { id: 't2', name: '标签B' })
    await linkAssetTag(testDb, 'a1', 't1')
    await linkAssetTag(testDb, 'a1', 't2')

    const tags = await repo.findTagsByAssetId('a1')
    expect(tags).toHaveLength(2)
  })

  it('multiple tags filter with AND semantics', async () => {
    await seedAsset(testDb, { id: 'a1', title: 'Both', content: 'content', assetType: 'text' })
    await seedAsset(testDb, { id: 'a2', title: 'One', content: 'content', assetType: 'text' })
    await seedTag(testDb, { id: 't1', name: 'tag1' })
    await seedTag(testDb, { id: 't2', name: 'tag2' })
    await linkAssetTag(testDb, 'a1', 't1')
    await linkAssetTag(testDb, 'a1', 't2')
    await linkAssetTag(testDb, 'a2', 't1')

    const result = await repo.search({ keyword: '', tagNames: ['tag1', 'tag2'], assetTypes: [] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('a1')
  })

  describe('create', () => {
    it('inserts asset and returns it with generated id and timestamps', async () => {
      const asset = await repo.create({
        title: '新建资产',
        content: '这是一段测试内容',
        assetType: 'text',
      })

      expect(asset.id).toBeDefined()
      expect(asset.id).toHaveLength(36) // UUID v4 format
      expect(asset.title).toBe('新建资产')
      expect(asset.content).toBe('这是一段测试内容')
      expect(asset.assetType).toBe('text')
      expect(asset.createdAt).toBeDefined()
      expect(asset.updatedAt).toBeDefined()
      // Timestamps should be valid ISO-8601
      expect(new Date(asset.createdAt).toISOString()).toBe(asset.createdAt)
      expect(new Date(asset.updatedAt).toISOString()).toBe(asset.updatedAt)
    })

    it('auto-truncates summary from content when summary is empty', async () => {
      const longContent = '这是一段非常长的内容'.repeat(50) // > 200 chars
      const asset = await repo.create({
        title: '长内容资产',
        content: longContent,
        assetType: 'text',
        summary: '',
      })

      expect(asset.summary).toBe(longContent.slice(0, 200))
      expect(asset.summary.length).toBe(200)
    })

    it('writes projectId as null', async () => {
      const asset = await repo.create({
        title: '无项目资产',
        content: '内容',
        assetType: 'case',
      })

      expect(asset.projectId).toBeNull()
    })

    it('created asset is searchable via FTS (triggers work)', async () => {
      await repo.create({
        title: '分布式系统架构',
        content: '基于微服务的分布式系统设计方案',
        assetType: 'text',
      })

      const result = await repo.search({ keyword: '分布式系统', tagNames: [], assetTypes: [] })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].title).toBe('分布式系统架构')
    })
  })
})
