import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import type { DB } from '@main/db/schema'

function createTestDb(): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: new Database(':memory:') }),
    plugins: [new CamelCasePlugin()],
  })
}

describe('Kysely client', () => {
  let db: Kysely<DB>

  afterEach(async () => {
    if (db) await db.destroy()
  })

  it('should create Kysely instance with in-memory SQLite', () => {
    db = createTestDb()
    expect(db).toBeDefined()
  })

  it('should support CamelCasePlugin for snake_case ↔ camelCase mapping', async () => {
    db = createTestDb()

    // Create table with snake_case columns
    await db.schema
      .createTable('projects')
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('customer_name', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('proposal_type', 'text')
      .addColumn('sop_stage', 'text')
      .addColumn('status', 'text')
      .addColumn('deadline', 'text')
      .addColumn('root_path', 'text')
      .execute()

    // Insert using camelCase (CamelCasePlugin converts to snake_case)
    await db
      .insertInto('projects')
      .values({
        id: 'test-1',
        name: 'Test Project',
        customerName: '测试客户',
        createdAt: '2026-03-19T00:00:00.000Z',
        updatedAt: '2026-03-19T00:00:00.000Z',
        proposalType: 'presale-technical',
        sopStage: 'not-started',
        status: 'active',
        deadline: null,
        rootPath: null,
      })
      .execute()

    // Select and verify camelCase mapping
    const project = await db
      .selectFrom('projects')
      .selectAll()
      .where('id', '=', 'test-1')
      .executeTakeFirstOrThrow()

    expect(project.customerName).toBe('测试客户')
    expect(project.createdAt).toBe('2026-03-19T00:00:00.000Z')
    expect(project.proposalType).toBe('presale-technical')
    expect(project.sopStage).toBe('not-started')
  })
})
