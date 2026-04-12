import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import type { TerminologyEntry } from '@shared/terminology-types'
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
import * as migration013 from '@main/db/migrations/013_create_adversarial_lineups'
import * as migration014 from '@main/db/migrations/014_create_adversarial_reviews'
import * as migration015 from '@main/db/migrations/015_create_terminology_entries'

let testDb: Kysely<DB>

vi.mock('@main/db/client', () => ({
  getDb: () => testDb,
}))

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
  '013_create_adversarial_lineups': migration013,
  '014_create_adversarial_reviews': migration014,
  '015_create_terminology_entries': migration015,
}

// Must import AFTER mocking
const { TerminologyRepository } = await import('@main/db/repositories/terminology-repo')

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

describe('TerminologyRepository', () => {
  let repo: InstanceType<typeof TerminologyRepository>

  beforeEach(async () => {
    testDb = createTestDb()
    const migrator = new Migrator({
      db: testDb,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()
    repo = new TerminologyRepository()
  })

  afterEach(async () => {
    await testDb.destroy()
  })

  it('create() inserts a record with auto-generated id and timestamps', async () => {
    const entry = await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: '军工装备',
      description: '行业标准术语',
    })

    expect(entry.id).toBeTruthy()
    expect(entry.sourceTerm).toBe('设备管理')
    expect(entry.targetTerm).toBe('装备全寿命周期管理')
    expect(entry.normalizedSourceTerm).toBe('设备管理')
    expect(entry.category).toBe('军工装备')
    expect(entry.isActive).toBe(true)
    expect(entry.createdAt).toBeTruthy()
    expect(entry.updatedAt).toBeTruthy()
  })

  it('create() with isActive=0 sets isActive to false', async () => {
    const entry = await repo.create({
      sourceTerm: '系统',
      targetTerm: '信息化平台',
      normalizedSourceTerm: '系统',
      category: null,
      description: null,
      isActive: 0,
    })

    expect(entry.isActive).toBe(false)
  })

  it('findByNormalizedSourceTerm() returns matching entry', async () => {
    await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
    })

    const found = await repo.findByNormalizedSourceTerm('设备管理')
    expect(found).not.toBeNull()
    expect(found!.sourceTerm).toBe('设备管理')
  })

  it('findByNormalizedSourceTerm() returns null for non-existent', async () => {
    const found = await repo.findByNormalizedSourceTerm('不存在')
    expect(found).toBeNull()
  })

  it('list() with searchQuery filters by source_term and target_term', async () => {
    await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
    })
    await repo.create({
      sourceTerm: '系统',
      targetTerm: '信息化平台',
      normalizedSourceTerm: '系统',
      category: null,
      description: null,
    })

    const results = await repo.list({ searchQuery: '装备' })
    expect(results).toHaveLength(1)
    expect(results[0].targetTerm).toBe('装备全寿命周期管理')
  })

  it('list() with category filters by exact match', async () => {
    await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: '军工装备',
      description: null,
    })
    await repo.create({
      sourceTerm: '系统',
      targetTerm: '信息化平台',
      normalizedSourceTerm: '系统',
      category: '信息化',
      description: null,
    })

    const results = await repo.list({ category: '军工装备' })
    expect(results).toHaveLength(1)
    expect(results[0].sourceTerm).toBe('设备管理')
  })

  it('list() with isActive filters by active status', async () => {
    await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
      isActive: 1,
    })
    await repo.create({
      sourceTerm: '系统',
      targetTerm: '信息化平台',
      normalizedSourceTerm: '系统',
      category: null,
      description: null,
      isActive: 0,
    })

    const activeOnly = await repo.list({ isActive: true })
    expect(activeOnly).toHaveLength(1)
    expect(activeOnly[0].sourceTerm).toBe('设备管理')
  })

  it('findActive() returns only active entries sorted by sourceTerm length DESC', async () => {
    await repo.create({
      sourceTerm: '系统',
      targetTerm: '信息化平台',
      normalizedSourceTerm: '系统',
      category: null,
      description: null,
      isActive: 1,
    })
    await repo.create({
      sourceTerm: '设备管理系统',
      targetTerm: '装备综合管理信息系统',
      normalizedSourceTerm: '设备管理系统',
      category: null,
      description: null,
      isActive: 1,
    })
    await repo.create({
      sourceTerm: '禁用术语',
      targetTerm: '不会出现',
      normalizedSourceTerm: '禁用术语',
      category: null,
      description: null,
      isActive: 0,
    })

    const active = await repo.findActive()
    expect(active).toHaveLength(2)
    // Longest first
    expect(active[0].sourceTerm).toBe('设备管理系统')
    expect(active[1].sourceTerm).toBe('系统')
  })

  it('update() refreshes updatedAt', async () => {
    const created = await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
    })

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10))

    const updated = await repo.update(created.id, { targetTerm: '装备管理' })
    expect(updated.targetTerm).toBe('装备管理')
    expect(updated.updatedAt).not.toBe(created.updatedAt)
  })

  it('delete() removes the entry', async () => {
    const created = await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
    })

    await repo.delete(created.id)

    const found = await repo.findById(created.id)
    expect(found).toBeNull()
  })

  it('UNIQUE constraint on normalizedSourceTerm throws on duplicate', async () => {
    await repo.create({
      sourceTerm: '设备管理',
      targetTerm: '装备全寿命周期管理',
      normalizedSourceTerm: '设备管理',
      category: null,
      description: null,
    })

    await expect(
      repo.create({
        sourceTerm: '设备管理',
        targetTerm: '另一个映射',
        normalizedSourceTerm: '设备管理',
        category: null,
        description: null,
      })
    ).rejects.toThrow()
  })
})
