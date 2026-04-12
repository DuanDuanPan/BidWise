import { type Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('terminology_entries')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('source_term', 'text', (col) => col.notNull())
    .addColumn('target_term', 'text', (col) => col.notNull())
    .addColumn('normalized_source_term', 'text', (col) => col.notNull().unique())
    .addColumn('category', 'text')
    .addColumn('description', 'text')
    .addColumn('is_active', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_terminology_category')
    .on('terminology_entries')
    .column('category')
    .execute()

  await db.schema
    .createIndex('idx_terminology_is_active')
    .on('terminology_entries')
    .column('is_active')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('terminology_entries').execute()
}
