import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('annotations')
    .addColumn('parent_id', 'text', (col) => col.references('annotations.id').onDelete('cascade'))
    .execute()

  await db.schema.alterTable('annotations').addColumn('assignee', 'text').execute()

  await db.schema
    .createIndex('annotations_parent_id_idx')
    .on('annotations')
    .column('parent_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('annotations_parent_id_idx').execute()

  await db.schema.alterTable('annotations').dropColumn('assignee').execute()

  await db.schema.alterTable('annotations').dropColumn('parent_id').execute()
}
