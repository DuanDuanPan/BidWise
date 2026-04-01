import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('strategy_seeds')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('reasoning', 'text', (col) => col.notNull())
    .addColumn('suggestion', 'text', (col) => col.notNull())
    .addColumn('source_excerpt', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('confidence', 'real', (col) => col.notNull().defaultTo(0.5))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('strategy_seeds_project_title_unique', ['project_id', 'title'])
    .execute()

  await db.schema
    .createIndex('strategy_seeds_project_id_idx')
    .on('strategy_seeds')
    .column('project_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('strategy_seeds').execute()
}
