import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, sql, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'
import * as migration002 from '@main/db/migrations/002_add_industry'
import * as migration003 from '@main/db/migrations/003_create_tasks'
import * as migration004 from '@main/db/migrations/004_create_requirements_scoring'
import * as migration005 from '@main/db/migrations/005_create_mandatory_items'
import * as migration006 from '@main/db/migrations/006_create_strategy_seeds'

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
  '002_add_industry': migration002,
  '003_create_tasks': migration003,
  '004_create_requirements_scoring': migration004,
  '005_create_mandatory_items': migration005,
  '006_create_strategy_seeds': migration006,
}

describe('Database migrations', () => {
  let db: Kysely<DB>

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should run all migrations successfully', async () => {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    })
    const { error, results } = await migrator.migrateToLatest()

    expect(error).toBeUndefined()
    expect(results).toHaveLength(6)
    for (const result of results!) {
      expect(result.status).toBe('Success')
    }
    expect(results!.map((r) => r.migrationName)).toEqual([
      '001_initial_schema',
      '002_add_industry',
      '003_create_tasks',
      '004_create_requirements_scoring',
      '005_create_mandatory_items',
      '006_create_strategy_seeds',
    ])
  })

  it('should create projects table with correct columns', async () => {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()

    // Use a raw (no CamelCasePlugin) db for PRAGMA introspection
    const rawDb = new Kysely<DB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })
    // Run migration on rawDb too to inspect
    const rawMigrator = new Migrator({
      db: rawDb,
      provider: { getMigrations: async () => migrations },
    })
    await rawMigrator.migrateToLatest()

    const columns = await sql<{
      name: string
      type: string
      notnull: number
      dflt_value: string | null
      pk: number
    }>`PRAGMA table_info(projects)`.execute(rawDb)

    const colMap = new Map(columns.rows.map((c) => [c.name, c]))

    expect(colMap.has('id')).toBe(true)
    expect(colMap.get('id')!.pk).toBe(1)
    expect(colMap.get('id')!.type.toLowerCase()).toBe('text')

    expect(colMap.get('name')!.notnull).toBe(1)
    expect(colMap.get('customer_name')!.notnull).toBe(0)
    expect(colMap.get('deadline')!.notnull).toBe(0)

    expect(colMap.get('proposal_type')!.dflt_value).toBe("'presale-technical'")
    expect(colMap.get('sop_stage')!.dflt_value).toBe("'not-started'")
    expect(colMap.get('status')!.dflt_value).toBe("'active'")

    expect(colMap.get('created_at')!.notnull).toBe(1)
    expect(colMap.get('updated_at')!.notnull).toBe(1)
    expect(colMap.get('root_path')!.notnull).toBe(0)

    await rawDb.destroy()
  })

  it('should record 006_create_strategy_seeds in kysely_migration after full chain', async () => {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()

    const rows = await sql<{
      name: string
    }>`SELECT name FROM kysely_migration ORDER BY name`.execute(db)
    const names = rows.rows.map((r) => r.name)

    expect(names).toContain('006_create_strategy_seeds')
    expect(names).toHaveLength(6)
  })

  it('should be idempotent (running twice succeeds)', async () => {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    })
    await migrator.migrateToLatest()
    const { error, results } = await migrator.migrateToLatest()

    expect(error).toBeUndefined()
    expect(results).toHaveLength(0) // No new migrations
  })

  it('should create strategy_seeds table with the expected columns and unique constraint', async () => {
    const rawDb = new Kysely<DB>({
      dialect: new SqliteDialect({ database: new Database(':memory:') }),
    })

    try {
      const rawMigrator = new Migrator({
        db: rawDb,
        provider: { getMigrations: async () => migrations },
      })
      await rawMigrator.migrateToLatest()

      const columns = await sql<{
        name: string
        notnull: number
        dflt_value: string | null
      }>`PRAGMA table_info(strategy_seeds)`.execute(rawDb)

      const colMap = new Map(columns.rows.map((column) => [column.name, column]))

      expect(colMap.get('project_id')!.notnull).toBe(1)
      expect(colMap.get('title')!.notnull).toBe(1)
      expect(colMap.get('reasoning')!.notnull).toBe(1)
      expect(colMap.get('suggestion')!.notnull).toBe(1)
      expect(colMap.get('source_excerpt')!.dflt_value).toBe("''")
      expect(colMap.get('confidence')!.dflt_value).toBe('0.5')
      expect(colMap.get('status')!.dflt_value).toBe("'pending'")

      const indexes = await sql<{
        name: string
        unique: number
      }>`PRAGMA index_list(strategy_seeds)`.execute(rawDb)
      expect(indexes.rows.some((index) => index.unique === 1)).toBe(true)
      expect(indexes.rows.some((index) => index.name === 'strategy_seeds_project_id_idx')).toBe(
        true
      )
    } finally {
      await rawDb.destroy()
    }
  })
})
