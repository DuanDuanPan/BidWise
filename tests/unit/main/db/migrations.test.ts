import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, Migrator, SqliteDialect, sql, type Migration } from 'kysely'
import type { DB } from '@main/db/schema'
import * as migration001 from '@main/db/migrations/001_initial_schema'

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
}

describe('Database migrations', () => {
  let db: Kysely<DB>

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(async () => {
    await db.destroy()
  })

  it('should run 001_initial_schema successfully', async () => {
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    })
    const { error, results } = await migrator.migrateToLatest()

    expect(error).toBeUndefined()
    expect(results).toHaveLength(1)
    expect(results![0].status).toBe('Success')
    expect(results![0].migrationName).toBe('001_initial_schema')
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
})
