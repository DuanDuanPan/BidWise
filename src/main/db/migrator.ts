import { Migrator, type Migration } from 'kysely'
import { getDb } from './client'
import * as migration001 from './migrations/001_initial_schema'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('db:migrator')

// 内联 Migration Provider（避免 Electron 打包路径问题）
const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
}

export async function runMigrations(): Promise<void> {
  const db = getDb()
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  })
  const { error, results } = await migrator.migrateToLatest()
  results?.forEach((r) => {
    if (r.status === 'Success') {
      logger.info(`迁移完成: ${r.migrationName}`)
    } else if (r.status === 'Error') {
      logger.error(`迁移失败: ${r.migrationName}`)
    }
  })
  if (error) {
    throw error
  }
}
