import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('notifications')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('project_name', 'text', (col) => col.notNull())
    .addColumn('section_id', 'text', (col) => col.notNull())
    .addColumn('annotation_id', 'text', (col) =>
      col.notNull().references('annotations.id').onDelete('cascade')
    )
    .addColumn('target_user', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull())
    .addColumn('read', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('notifications_target_user_idx')
    .on('notifications')
    .column('target_user')
    .execute()

  await db.schema
    .createIndex('notifications_target_user_read_idx')
    .on('notifications')
    .columns(['target_user', 'read'])
    .execute()

  await db.schema
    .createIndex('notifications_annotation_id_idx')
    .on('notifications')
    .column('annotation_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notifications').execute()
}
