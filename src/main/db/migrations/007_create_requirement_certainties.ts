import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('requirement_certainties')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('requirement_id', 'text', (col) =>
      col.notNull().references('requirements.id').onDelete('cascade')
    )
    .addColumn('certainty_level', 'text', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('suggestion', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('confirmed', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('confirmed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('requirement_certainties_project_requirement_unique', [
      'project_id',
      'requirement_id',
    ])
    .execute()

  await db.schema
    .createIndex('requirement_certainties_project_id_idx')
    .on('requirement_certainties')
    .column('project_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('requirement_certainties').execute()
}
