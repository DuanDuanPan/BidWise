import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('mandatory_items')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('source_text', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('source_pages', 'text', (col) => col.notNull().defaultTo('[]'))
    .addColumn('confidence', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('detected'))
    .addColumn('linked_requirement_id', 'text', (col) =>
      col.references('requirements.id').onDelete('set null')
    )
    .addColumn('detected_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('mandatory_items_project_content_unique', ['project_id', 'content'])
    .execute()

  await db.schema
    .createIndex('mandatory_items_project_id_idx')
    .on('mandatory_items')
    .column('project_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('mandatory_items').execute()
}
