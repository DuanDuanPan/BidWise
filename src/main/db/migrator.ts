import { Migrator, type Migration } from 'kysely'
import { getDb } from './client'
import * as migration001 from './migrations/001_initial_schema'
import * as migration002 from './migrations/002_add_industry'
import * as migration003 from './migrations/003_create_tasks'
import * as migration004 from './migrations/004_create_requirements_scoring'
import * as migration005 from './migrations/005_create_mandatory_items'
import * as migration006 from './migrations/006_create_strategy_seeds'
import * as migration007 from './migrations/007_create_annotations'
import { createLogger } from '@main/utils/logger'

const logger = createLogger('db:migrator')

// 内联 Migration Provider（避免 Electron 打包路径问题）
const migrations: Record<string, Migration> = {
  '001_initial_schema': migration001,
  '002_add_industry': migration002,
  '003_create_tasks': migration003,
  '004_create_requirements_scoring': migration004,
  '005_create_mandatory_items': migration005,
  '006_create_strategy_seeds': migration006,
  '007_create_annotations': migration007,
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
