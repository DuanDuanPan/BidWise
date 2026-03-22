import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('requirements')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('sequence_number', 'integer', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('source_pages', 'text', (col) => col.notNull())
    .addColumn('category', 'text', (col) => col.notNull().defaultTo('other'))
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('medium'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('extracted'))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('scoring_models')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('total_score', 'real', (col) => col.notNull())
    .addColumn('criteria', 'text', (col) => col.notNull())
    .addColumn('extracted_at', 'text', (col) => col.notNull())
    .addColumn('confirmed_at', 'text')
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('scoring_models_project_id_unique', ['project_id'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('scoring_models').execute()
  await db.schema.dropTable('requirements').execute()
}
