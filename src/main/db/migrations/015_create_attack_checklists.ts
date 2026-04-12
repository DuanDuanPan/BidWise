import type { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('attack_checklists')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text', (col) =>
      col.notNull().references('projects.id').onDelete('cascade').unique()
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('generating'))
    .addColumn('generation_source', 'text', (col) => col.notNull().defaultTo('llm'))
    .addColumn('warning_message', 'text')
    .addColumn('generated_at', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createTable('attack_checklist_items')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('checklist_id', 'text', (col) =>
      col.notNull().references('attack_checklists.id').onDelete('cascade')
    )
    .addColumn('category', 'text', (col) => col.notNull())
    .addColumn('attack_angle', 'text', (col) => col.notNull())
    .addColumn('severity', 'text', (col) => col.notNull().defaultTo('major'))
    .addColumn('defense_suggestion', 'text', (col) => col.notNull())
    .addColumn('target_section', 'text')
    .addColumn('target_section_locator', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('unaddressed'))
    .addColumn('sort_order', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema
    .createIndex('idx_attack_checklist_items_checklist_id')
    .on('attack_checklist_items')
    .column('checklist_id')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('attack_checklist_items').execute()
  await db.schema.dropTable('attack_checklists').execute()
}
