import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('traceability_links')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade')
    )
    .addColumn('requirement_id', 'text', (col) =>
      col.notNull().references('requirements.id').onDelete('cascade')
    )
    .addColumn('section_id', 'text', (col) => col.notNull())
    .addColumn('section_title', 'text', (col) => col.notNull())
    .addColumn('coverage_status', 'text', (col) => col.notNull().defaultTo('uncovered'))
    .addColumn('confidence', 'real', (col) => col.notNull().defaultTo(0))
    .addColumn('match_reason', 'text')
    .addColumn('source', 'text', (col) => col.notNull().defaultTo('auto'))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .addUniqueConstraint('traceability_links_project_req_section_unique', [
      'project_id',
      'requirement_id',
      'section_id',
    ])
    .execute()

  await db.schema
    .createIndex('traceability_links_project_id_idx')
    .on('traceability_links')
    .column('project_id')
    .execute()

  await db.schema
    .createIndex('traceability_links_project_requirement_idx')
    .on('traceability_links')
    .columns(['project_id', 'requirement_id'])
    .execute()

  await db.schema
    .createIndex('traceability_links_project_section_idx')
    .on('traceability_links')
    .columns(['project_id', 'section_id'])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('traceability_links').execute()
}
