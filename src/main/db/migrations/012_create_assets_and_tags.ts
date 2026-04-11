import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // assets table
  await db.schema
    .createTable('assets')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('project_id', 'text')
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('summary', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('asset_type', 'text', (col) => col.notNull())
    .addColumn('source_project', 'text')
    .addColumn('source_section', 'text')
    .addColumn('created_at', 'text', (col) => col.notNull())
    .addColumn('updated_at', 'text', (col) => col.notNull())
    .execute()

  await db.schema.createIndex('assets_asset_type_idx').on('assets').column('asset_type').execute()

  await db.schema.createIndex('assets_updated_at_idx').on('assets').column('updated_at').execute()

  await db.schema.createIndex('assets_project_id_idx').on('assets').column('project_id').execute()

  // tags table
  await db.schema
    .createTable('tags')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('normalized_name', 'text', (col) => col.notNull().unique())
    .addColumn('created_at', 'text', (col) => col.notNull())
    .execute()

  // asset_tags junction table
  await db.schema
    .createTable('asset_tags')
    .addColumn('asset_id', 'text', (col) =>
      col.notNull().references('assets.id').onDelete('cascade')
    )
    .addColumn('tag_id', 'text', (col) => col.notNull().references('tags.id').onDelete('cascade'))
    .execute()

  // Composite primary key via raw SQL (Kysely doesn't support composite PK in createTable)
  await sql`CREATE UNIQUE INDEX asset_tags_pk ON asset_tags(asset_id, tag_id)`.execute(db)

  await db.schema
    .createIndex('asset_tags_asset_id_idx')
    .on('asset_tags')
    .column('asset_id')
    .execute()

  await db.schema.createIndex('asset_tags_tag_id_idx').on('asset_tags').column('tag_id').execute()

  // FTS5 virtual table with trigram tokenizer for Chinese text search
  await sql`
    CREATE VIRTUAL TABLE assets_fts USING fts5(
      title,
      summary,
      content,
      content='assets',
      content_rowid='rowid',
      tokenize='trigram'
    )
  `.execute(db)

  // Triggers to keep FTS index in sync
  await sql`
    CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
      INSERT INTO assets_fts(rowid, title, summary, content)
      VALUES (new.rowid, new.title, new.summary, new.content);
    END
  `.execute(db)

  await sql`
    CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, title, summary, content)
      VALUES ('delete', old.rowid, old.title, old.summary, old.content);
    END
  `.execute(db)

  await sql`
    CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
      INSERT INTO assets_fts(assets_fts, rowid, title, summary, content)
      VALUES ('delete', old.rowid, old.title, old.summary, old.content);
      INSERT INTO assets_fts(rowid, title, summary, content)
      VALUES (new.rowid, new.title, new.summary, new.content);
    END
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS assets_au`.execute(db)
  await sql`DROP TRIGGER IF EXISTS assets_ad`.execute(db)
  await sql`DROP TRIGGER IF EXISTS assets_ai`.execute(db)
  await sql`DROP TABLE IF EXISTS assets_fts`.execute(db)
  await db.schema.dropTable('asset_tags').execute()
  await db.schema.dropTable('tags').execute()
  await db.schema.dropTable('assets').execute()
}
