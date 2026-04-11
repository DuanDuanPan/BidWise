import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('adversarial_lineups')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('roles', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('generated'))
    .addColumn('generation_source', 'text', (col) => col.notNull().defaultTo('llm'))
    .addColumn('warning_message', 'text')
    .addColumn('generated_at', 'text', (col) => col.notNull())
    .addColumn('confirmed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('adversarial_lineups_project_id_unique', ['project_id'])
    .execute()

  await db.schema
    .createIndex('adversarial_lineups_project_id_idx')
    .on('adversarial_lineups')
    .column('project_id')
    .unique()
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('adversarial_lineups').execute()
}
