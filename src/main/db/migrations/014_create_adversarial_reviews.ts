import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('adversarial_review_sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('lineup_id', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    .addColumn('role_results', 'text')
    .addColumn('started_at', 'text')
    .addColumn('completed_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('adversarial_review_sessions_project_id_unique', ['project_id'])
    .execute()

  await db.schema
    .createTable('adversarial_findings')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('session_id', 'text', (col) =>
      col.notNull().references('adversarial_review_sessions.id').onDelete('cascade')
    )
    .addColumn('role_id', 'text', (col) => col.notNull())
    .addColumn('role_name', 'text', (col) => col.notNull())
    .addColumn('severity', 'text', (col) => col.notNull())
    .addColumn('section_ref', 'text')
    .addColumn('section_locator', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('suggestion', 'text')
    .addColumn('reasoning', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('rebuttal_reason', 'text')
    .addColumn('contradiction_group_id', 'text')
    .addColumn('sort_order', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('adversarial_findings_session_id_idx')
    .on('adversarial_findings')
    .column('session_id')
    .execute()

  await db.schema
    .createIndex('adversarial_findings_contradiction_group_id_idx')
    .on('adversarial_findings')
    .column('contradiction_group_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('adversarial_findings').execute()
  await db.schema.dropTable('adversarial_review_sessions').execute()
}
