import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('tasks')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('agent_type', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('priority', 'text', (col) => col.notNull().defaultTo('normal'))
    .addColumn('progress', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('input', 'text', (col) => col.notNull())
    .addColumn('output', 'text')
    .addColumn('error', 'text')
    .addColumn('retry_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('max_retries', 'integer', (col) => col.notNull().defaultTo(3))
    .addColumn('checkpoint', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addColumn('completed_at', 'text')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('tasks').execute()
}
