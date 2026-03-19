import Database from 'better-sqlite3'
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely'
import { DatabaseError } from '@main/utils/errors'
import type { DB } from './schema'

let db: Kysely<DB> | null = null

export function getDb(): Kysely<DB> {
  if (!db) {
    throw new DatabaseError('数据库未初始化，请先调用 initDb()')
  }
  return db
}

export function initDb(dbPath: string): Kysely<DB> {
  const dialect = new SqliteDialect({
    database: new Database(dbPath),
  })
  db = new Kysely<DB>({
    dialect,
    plugins: [new CamelCasePlugin()],
  })
  return db
}

export async function destroyDb(): Promise<void> {
  if (db) {
    await db.destroy()
    db = null
  }
}
