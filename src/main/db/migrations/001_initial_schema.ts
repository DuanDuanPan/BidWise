import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('projects')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('customer_name', 'text')
    .addColumn('deadline', 'text')
    .addColumn('proposal_type', 'text', (col) => col.defaultTo('presale-technical'))
    .addColumn('sop_stage', 'text', (col) => col.defaultTo('not-started'))
    .addColumn('status', 'text', (col) => col.defaultTo('active'))
    .addColumn('root_path', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('projects').execute()
}
