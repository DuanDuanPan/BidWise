/**
 * Chapter Identity Migration Service (Story 11.1).
 *
 * Upgrades a project's chapter identity model from v1 (mixed template keys /
 * locator keys / title-hash fallbacks) to v2 (project-level UUID v4 on every
 * `sectionId`).
 *
 * Scope:
 *   - proposal.meta.json: sectionIndex, sectionWeights, confirmedSkeletons,
 *     annotations, sourceAttributions, baselineValidations.
 *   - chapter-summaries.json sidecar.
 *   - traceability-matrix.json sidecar.
 *   - SQLite: annotations.section_id, traceability_links.section_id,
 *     notifications.section_id.
 *
 * Safety:
 *   - Backs up every touched artifact to
 *     `{rootPath}/.backup-{timestamp}/chapter-identity-v1/` before mutating.
 *   - Idempotent: projects already on v2 skip instantly.
 *   - In-memory `migratedProjects` set guards repeat work within a session.
 *   - Errors surface as `BidWiseError`; the original artifacts stay on disk
 *     because writes are tmp-rename + explicit backup.
 */
import { createHash } from 'node:crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@main/db/client'
import { BidWiseError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { ErrorCode } from '@shared/constants'
import { createChapterLocatorKey, parseChapterLocatorKey } from '@shared/chapter-locator-key'
import { isStableSectionId } from '@shared/chapter-identity'
import { CHAPTER_IDENTITY_SCHEMA_LATEST } from '@shared/models/proposal'
import type { ProposalMetadata } from '@shared/models/proposal'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import type { ChapterSummarySidecar } from '@shared/chapter-summary-types'

const logger = createLogger('chapter-identity-migration-service')

const PROPOSAL_META_FILENAME = 'proposal.meta.json'
const CHAPTER_SUMMARIES_FILENAME = 'chapter-summaries.json'
const TRACEABILITY_MATRIX_FILENAME = 'traceability-matrix.json'

/**
 * Persisted canonical legacy→UUID map for the no-sectionIndex branch
 * (Story 11.1 review fix A). Written BEFORE any artifact rewrite so a
 * partial-failure replay reuses the same UUIDs instead of minting a fresh
 * (and inconsistent) set. Deleted only after the schema marker is stamped.
 */
const MIGRATION_PROGRESS_FILENAME = '.chapter-identity-migration-progress.json'

interface MigrationProgressFile {
  schemaVersion: 1
  branch: 'no-section-index'
  startedAt: string
  legacyMap: Record<string, string>
}

/**
 * Template-local structural keys produced by built-in / company templates
 * (e.g. `s1`, `s1.1`, `s2.3.1`). Used to distinguish a legitimate template
 * key from a locator key (`level:title:occ`) or title-hash fallback id
 * (`heading-2-...`) when backfilling `templateSectionKey` during migration.
 */
const TEMPLATE_SECTION_KEY_RE = /^s\d+(?:\.\d+)*$/i

function looksLikeTemplateSectionKey(id: string | undefined | null): boolean {
  return typeof id === 'string' && TEMPLATE_SECTION_KEY_RE.test(id)
}

interface MigrationReport {
  alreadyMigrated: boolean
  projectId: string
  legacyIdCount: number
  rewrittenArtifacts: string[]
  backupDir?: string
  sqliteRowsUpdated: {
    annotations: number
    traceabilityLinks: number
    notifications: number
  }
}

/** sha1-based fallback used by pre-11.1 traceability-matrix-service. */
function legacyTitleHashId(section: {
  title: string
  level: number
  occurrenceIndex: number
}): string {
  const digest = createHash('sha1')
    .update(`${section.level}:${section.title}:${section.occurrenceIndex}`)
    .digest('hex')
  return `heading-${section.level}-${digest}`
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function tryReadJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
  await rename(tmp, path)
}

async function backupFile(sourcePath: string, backupDir: string, relName: string): Promise<void> {
  if (!existsSync(sourcePath)) return
  await mkdir(backupDir, { recursive: true })
  await copyFile(sourcePath, join(backupDir, relName))
}

class LegacyIdMap {
  private readonly byLegacy = new Map<string, string>()

  getOrMint(legacyId: string): string {
    if (isStableSectionId(legacyId)) {
      // Already a UUID — pass through; keep the identity in the map so later
      // lookups stay O(1) and idempotent.
      this.byLegacy.set(legacyId, legacyId)
      return legacyId
    }
    const existing = this.byLegacy.get(legacyId)
    if (existing) return existing
    const fresh = uuidv4()
    this.byLegacy.set(legacyId, fresh)
    return fresh
  }

  set(legacyId: string, uuid: string): void {
    this.byLegacy.set(legacyId, uuid)
  }

  has(legacyId: string): boolean {
    return this.byLegacy.has(legacyId)
  }

  get(legacyId: string): string | undefined {
    return this.byLegacy.get(legacyId)
  }

  /** Map of original → canonical UUID. */
  entries(): Array<[string, string]> {
    return Array.from(this.byLegacy.entries())
  }

  size(): number {
    return this.byLegacy.size
  }
}

/**
 * Migrate `proposal.meta.json.sectionIndex` to UUID `sectionId`. Each entry
 * gets a fresh UUID; legacy ids (template key / locator key / title-hash) are
 * registered against the new UUID in the map so downstream sidecars and
 * SQLite rows can be rewritten consistently.
 */
function migrateSectionIndex(
  sectionIndex: ProposalSectionIndexEntry[],
  legacyMap: LegacyIdMap
): ProposalSectionIndexEntry[] {
  return sectionIndex.map((entry) => {
    const originalId = entry.sectionId
    const newId = legacyMap.getOrMint(originalId)

    // Also map legacy alternative keys so downstream references (sidecar,
    // SQLite) resolve regardless of which variant they stored. Templates
    // historically wrote three flavors of legacy id and we register all of
    // them against the same UUID to keep retries idempotent (see Story 11.1
    // partial-failure replay path).
    const locatorKey = createChapterLocatorKey(entry.headingLocator)
    if (!legacyMap.has(locatorKey)) legacyMap.set(locatorKey, newId)
    const fallbackId = legacyTitleHashId({
      title: entry.headingLocator.title,
      level: entry.headingLocator.level,
      occurrenceIndex: entry.headingLocator.occurrenceIndex,
    })
    if (!legacyMap.has(fallbackId)) legacyMap.set(fallbackId, newId)
    if (entry.templateSectionKey && !legacyMap.has(entry.templateSectionKey)) {
      legacyMap.set(entry.templateSectionKey, newId)
    }

    // Backfill `templateSectionKey` only when the legacy id is shaped like a
    // real template key (`s1`, `s1.1`, ...). Locator keys (`2:项目背景:0`)
    // and title-hash fallbacks (`heading-2-...`) must NOT leak into this
    // field — downstream code treats `templateSectionKey` as a stable
    // template-local identifier.
    return {
      ...entry,
      sectionId: newId,
      templateSectionKey:
        entry.templateSectionKey ??
        (looksLikeTemplateSectionKey(originalId) ? originalId : undefined),
    }
  })
}

/** Fix up parentSectionId references using the legacy → UUID map. */
function remapParentIds(
  sectionIndex: ProposalSectionIndexEntry[],
  legacyMap: LegacyIdMap
): ProposalSectionIndexEntry[] {
  return sectionIndex.map((entry) => {
    if (!entry.parentSectionId) return entry
    const resolved = legacyMap.get(entry.parentSectionId)
    return resolved && resolved !== entry.parentSectionId
      ? { ...entry, parentSectionId: resolved }
      : entry
  })
}

function remapSectionWeights(
  weights: ProposalMetadata['sectionWeights'],
  legacyMap: LegacyIdMap
): ProposalMetadata['sectionWeights'] {
  if (!weights) return weights
  return weights.map((w) => {
    const resolved = legacyMap.get(w.sectionId)
    return resolved
      ? {
          ...w,
          sectionId: resolved,
          // Same templateSectionKey rule as migrateSectionIndex: only adopt
          // the original id when it actually matches the template-key shape.
          templateSectionKey:
            w.templateSectionKey ??
            (looksLikeTemplateSectionKey(w.sectionId) ? w.sectionId : undefined),
        }
      : w
  })
}

function remapConfirmedSkeletons(
  confirmed: ProposalMetadata['confirmedSkeletons'],
  legacyMap: LegacyIdMap
): ProposalMetadata['confirmedSkeletons'] {
  if (!confirmed) return confirmed
  const next: NonNullable<ProposalMetadata['confirmedSkeletons']> = {}
  for (const [legacyKey, plan] of Object.entries(confirmed)) {
    const resolved = legacyMap.get(legacyKey) ?? legacyMap.getOrMint(legacyKey)
    next[resolved] = plan
  }
  return next
}

function remapAnnotations(
  annotations: ProposalMetadata['annotations'],
  legacyMap: LegacyIdMap
): ProposalMetadata['annotations'] {
  return annotations.map((ann) => {
    const resolved = legacyMap.get(ann.sectionId)
    return resolved && resolved !== ann.sectionId ? { ...ann, sectionId: resolved } : ann
  })
}

function remapSourceAttributions(
  attrs: ProposalMetadata['sourceAttributions'],
  legacyMap: LegacyIdMap
): ProposalMetadata['sourceAttributions'] {
  return attrs.map((attr) => {
    if (attr.sectionId && isStableSectionId(attr.sectionId)) return attr
    const key = createChapterLocatorKey(attr.sectionLocator)
    const resolved = legacyMap.get(key)
    return resolved ? { ...attr, sectionId: resolved } : attr
  })
}

function remapBaselineValidations(
  validations: ProposalMetadata['baselineValidations'],
  legacyMap: LegacyIdMap
): ProposalMetadata['baselineValidations'] {
  return validations.map((v) => {
    if (v.sectionId && isStableSectionId(v.sectionId)) return v
    const key = createChapterLocatorKey(v.sectionLocator)
    const resolved = legacyMap.get(key)
    return resolved ? { ...v, sectionId: resolved } : v
  })
}

interface ChapterSummariesV1 extends ChapterSummarySidecar {}

async function migrateChapterSummariesSidecar(
  rootPath: string,
  legacyMap: LegacyIdMap,
  backupDir: string
): Promise<boolean> {
  const path = join(rootPath, CHAPTER_SUMMARIES_FILENAME)
  const sidecar = await tryReadJson<ChapterSummariesV1>(path)
  if (!sidecar || !Array.isArray(sidecar.entries)) return false
  await backupFile(path, backupDir, CHAPTER_SUMMARIES_FILENAME)

  const next: ChapterSummarySidecar = {
    version: sidecar.version,
    entries: sidecar.entries.map((entry) => {
      if (entry.sectionId && isStableSectionId(entry.sectionId)) return entry
      const resolved = legacyMap.get(entry.headingKey)
      return resolved ? { ...entry, sectionId: resolved } : entry
    }),
  }
  await writeJsonAtomic(path, next)
  return true
}

interface TraceabilityMatrixV1 {
  projectId?: string
  links?: Array<{ sectionId: string; [k: string]: unknown }>
  [k: string]: unknown
}

async function migrateTraceabilityMatrixSidecar(
  rootPath: string,
  legacyMap: LegacyIdMap,
  backupDir: string
): Promise<boolean> {
  const path = join(rootPath, TRACEABILITY_MATRIX_FILENAME)
  const snapshot = await tryReadJson<TraceabilityMatrixV1>(path)
  if (!snapshot || !Array.isArray(snapshot.links)) return false
  await backupFile(path, backupDir, TRACEABILITY_MATRIX_FILENAME)

  const next = {
    ...snapshot,
    links: snapshot.links.map((link) => {
      const resolved = legacyMap.get(link.sectionId)
      return resolved && resolved !== link.sectionId ? { ...link, sectionId: resolved } : link
    }),
  }
  await writeJsonAtomic(path, next)
  return true
}

async function migrateSqliteReferences(
  projectId: string,
  legacyMap: LegacyIdMap
): Promise<MigrationReport['sqliteRowsUpdated']> {
  const entries = legacyMap.entries().filter(([legacy, next]) => legacy !== next)
  const totals = { annotations: 0, traceabilityLinks: 0, notifications: 0 }
  if (entries.length === 0) return totals

  const db = getDb()
  await db.transaction().execute(async (trx) => {
    for (const [legacyId, nextId] of entries) {
      const a = await trx
        .updateTable('annotations')
        .set({ sectionId: nextId })
        .where('projectId', '=', projectId)
        .where('sectionId', '=', legacyId)
        .executeTakeFirst()
      totals.annotations += Number(a.numUpdatedRows ?? 0n)

      const t = await trx
        .updateTable('traceabilityLinks')
        .set({ sectionId: nextId })
        .where('projectId', '=', projectId)
        .where('sectionId', '=', legacyId)
        .executeTakeFirst()
      totals.traceabilityLinks += Number(t.numUpdatedRows ?? 0n)

      const n = await trx
        .updateTable('notifications')
        .set({ sectionId: nextId })
        .where('projectId', '=', projectId)
        .where('sectionId', '=', legacyId)
        .executeTakeFirst()
      totals.notifications += Number(n.numUpdatedRows ?? 0n)
    }
  })
  return totals
}

const memoedMigrations = new Map<string, Promise<MigrationReport>>()

/**
 * Resolve the canonical `legacy → UUID` mapping for the no-sectionIndex
 * branch by scanning every dependent artifact AND collapsing alias forms of
 * the same chapter onto one UUID.
 *
 * Why this matters (Story 11.1 review fix C):
 *   pre-Story-11.1 writers stored chapter references in three flavours that
 *   all describe the same chapter:
 *
 *     - locator-key   `2:项目背景:0`              (summaries.headingKey,
 *                                                  confirmedSkeletons keys,
 *                                                  some annotations)
 *     - title-hash    `heading-2-{sha1(...)}`     (traceability-matrix
 *                                                  fallback IDs from
 *                                                  `buildFallbackSectionId`)
 *     - free-form id  `s1.1` / opaque             (template materialization,
 *                                                  legacy assignments)
 *
 *   Without an anchor (sectionIndex), a naive probe mints a fresh UUID per
 *   distinct token — so the same chapter ends up with two UUIDs across
 *   artifacts. The fix: whenever an artifact entry exposes the structural
 *   triple (level, title, occurrenceIndex) — directly via `sectionLocator` /
 *   summary heading fields, or indirectly via a parseable locator-key — we
 *   pre-bind BOTH the locator-key form AND the title-hash form to one UUID.
 *   Standalone tokens with no canonical match (pure title-hash, opaque
 *   template keys) still get their own UUIDs as a best-effort fallback.
 */
function isValidLevel(n: unknown): n is 1 | 2 | 3 | 4 {
  return n === 1 || n === 2 || n === 3 || n === 4
}

interface CanonicalChapter {
  title: string
  level: 1 | 2 | 3 | 4
  occurrenceIndex: number
}

async function resolveLegacyAliasMap(
  projectId: string,
  rootPath: string,
  meta: Partial<ProposalMetadata>,
  priorMap: Record<string, string>
): Promise<{ legacyMap: LegacyIdMap; probedTokens: Set<string> }> {
  const legacyMap = new LegacyIdMap()
  for (const [k, v] of Object.entries(priorMap)) legacyMap.set(k, v)
  const probedTokens = new Set<string>()

  const registerCanonical = (chapter: CanonicalChapter): void => {
    const locatorKey = createChapterLocatorKey(chapter)
    const titleHash = legacyTitleHashId(chapter)
    // Reuse any UUID already bound to either alias — keeps prior-progress
    // assignments stable rather than overwriting them.
    let uuid = legacyMap.get(locatorKey) ?? legacyMap.get(titleHash)
    if (!uuid) uuid = uuidv4()
    if (!legacyMap.has(locatorKey)) legacyMap.set(locatorKey, uuid)
    if (!legacyMap.has(titleHash)) legacyMap.set(titleHash, uuid)
  }

  const probe = (token: string | undefined | null): void => {
    if (typeof token !== 'string' || !token) return
    if (isStableSectionId(token)) return
    probedTokens.add(token)
    const parsed = parseChapterLocatorKey(token)
    if (parsed) registerCanonical(parsed)
  }

  // proposal.meta.json fields.
  for (const ann of meta.annotations ?? []) probe(ann.sectionId)
  for (const attr of meta.sourceAttributions ?? []) {
    probe(attr.sectionId)
    if (attr.sectionLocator) {
      registerCanonical(attr.sectionLocator)
      probedTokens.add(createChapterLocatorKey(attr.sectionLocator))
    }
  }
  for (const v of meta.baselineValidations ?? []) {
    probe(v.sectionId)
    if (v.sectionLocator) {
      registerCanonical(v.sectionLocator)
      probedTokens.add(createChapterLocatorKey(v.sectionLocator))
    }
  }
  for (const w of meta.sectionWeights ?? []) probe(w.sectionId)
  if (meta.confirmedSkeletons) {
    for (const key of Object.keys(meta.confirmedSkeletons)) probe(key)
  }

  // chapter-summaries sidecar.
  const summaries = await tryReadJson<ChapterSummariesV1>(
    join(rootPath, CHAPTER_SUMMARIES_FILENAME)
  )
  if (summaries?.entries) {
    for (const entry of summaries.entries) {
      probe((entry as { sectionId?: string }).sectionId)
      probe(entry.headingKey)
      // Summary entries carry the structural triple directly — canonicalise
      // even when the headingKey didn't parse (e.g., titles containing
      // unusual characters that break parseChapterLocatorKey).
      if (typeof entry.headingTitle === 'string' && isValidLevel(entry.headingLevel)) {
        registerCanonical({
          title: entry.headingTitle,
          level: entry.headingLevel,
          occurrenceIndex: typeof entry.occurrenceIndex === 'number' ? entry.occurrenceIndex : 0,
        })
      }
    }
  }

  // traceability-matrix sidecar. Link entries usually omit level/occ on the
  // wire, so we mostly rely on `probe`'s locator-key parse and on the
  // canonical bindings already produced from summaries / sectionLocator.
  const matrix = await tryReadJson<TraceabilityMatrixV1>(
    join(rootPath, TRACEABILITY_MATRIX_FILENAME)
  )
  if (matrix?.links) {
    for (const link of matrix.links) {
      probe(link.sectionId)
      const linkLevel =
        (link as { sectionLevel?: number }).sectionLevel ?? (link as { level?: number }).level
      const linkTitle =
        (link as { sectionTitle?: string }).sectionTitle ?? (link as { title?: string }).title
      const linkOcc = (link as { occurrenceIndex?: number }).occurrenceIndex
      if (typeof linkTitle === 'string' && isValidLevel(linkLevel)) {
        registerCanonical({
          title: linkTitle,
          level: linkLevel,
          occurrenceIndex: typeof linkOcc === 'number' ? linkOcc : 0,
        })
      }
    }
  }

  // SQLite — opaque tokens, but `probe` still tries locator-key parsing.
  try {
    const db = getDb()
    for (const table of ['annotations', 'traceabilityLinks', 'notifications'] as const) {
      const rows = await db
        .selectFrom(table)
        .select('sectionId')
        .where('projectId', '=', projectId)
        .distinct()
        .execute()
      for (const row of rows) {
        probe((row as { sectionId?: string | null }).sectionId)
      }
    }
  } catch (err) {
    logger.warn(
      `chapter-identity probe: SQLite scan failed for project=${projectId}; ` +
        `falling back to sidecar evidence only`,
      err
    )
  }

  // Final pass: any probed token still without a UUID gets a fresh one.
  // Catches pure title-hash tokens with no canonical match, opaque template
  // keys, and any other legacy form that couldn't be aliased.
  for (const token of probedTokens) {
    if (!legacyMap.has(token)) legacyMap.getOrMint(token)
  }

  return { legacyMap, probedTokens }
}

async function readMigrationProgress(rootPath: string): Promise<MigrationProgressFile | null> {
  return tryReadJson<MigrationProgressFile>(join(rootPath, MIGRATION_PROGRESS_FILENAME))
}

async function deleteMigrationProgress(rootPath: string): Promise<void> {
  try {
    await rm(join(rootPath, MIGRATION_PROGRESS_FILENAME), { force: true })
  } catch {
    // Best-effort cleanup; a stale progress file at most causes the next
    // session to reuse the same (already-applied) mapping, which is a no-op.
  }
}

/**
 * Stamp `chapterIdentitySchemaVersion: LATEST` onto an existing meta blob.
 * Best-effort — silently swallowed because callers must remain readable even
 * when the marker write fails (next session retries).
 */
async function stampSchemaVersion(
  metaPath: string,
  current: Partial<ProposalMetadata>
): Promise<void> {
  const stamped: Partial<ProposalMetadata> = {
    ...current,
    chapterIdentitySchemaVersion: CHAPTER_IDENTITY_SCHEMA_LATEST,
  }
  try {
    await writeJsonAtomic(metaPath, stamped)
  } catch {
    // Best-effort stamp; if the write fails we retry next session.
  }
}

/**
 * Migration path for projects that never built a sectionIndex but still
 * carry locator-key / title-hash references somewhere (in proposal.meta.json,
 * in summary/matrix sidecars, or in SQLite rows).
 *
 * Story 11.1 review fixes:
 *   - **A (replay determinism)**: the canonical `legacyMap` is persisted to
 *     `.chapter-identity-migration-progress.json` BEFORE any artifact
 *     rewrite. A failure mid-pipeline leaves both the progress file and
 *     whatever rewrites already happened on disk. The next session reads the
 *     progress file, reuses the same UUIDs, and re-runs the (idempotent)
 *     rewrites — so a chapter ends up with one stable UUID across every
 *     artifact regardless of how many partial-failure replays it took.
 *   - **B (in-meta refs)**: the meta blob is remapped (annotations,
 *     sourceAttributions, baselineValidations, sectionWeights,
 *     confirmedSkeletons) and re-written together with the schema stamp, so
 *     v2 is never stamped while legacy refs still live in proposal.meta.json.
 */
async function migrateWithoutSectionIndex(
  projectId: string,
  rootPath: string,
  meta: Partial<ProposalMetadata>,
  legacyMap: LegacyIdMap,
  prior: MigrationProgressFile | null
): Promise<MigrationReport> {
  const metaPath = join(rootPath, PROPOSAL_META_FILENAME)
  const progressPath = join(rootPath, MIGRATION_PROGRESS_FILENAME)

  // 1. Persist the alias-resolved canonical map BEFORE any rewrite —
  //    first-write-wins for retry idempotency. If this write itself fails,
  //    no harm done because no rewrites have happened yet.
  const progressPayload: MigrationProgressFile = {
    schemaVersion: 1,
    branch: 'no-section-index',
    startedAt: prior?.startedAt ?? new Date().toISOString(),
    legacyMap: Object.fromEntries(legacyMap.entries()),
  }
  await writeJsonAtomic(progressPath, progressPayload)

  // 2. Backup proposal.meta.json (idempotent file copy is fine on retries).
  const ts = timestamp()
  const backupDir = join(rootPath, `.backup-${ts}`, 'chapter-identity-v1')
  await mkdir(backupDir, { recursive: true })
  await backupFile(metaPath, backupDir, PROPOSAL_META_FILENAME)

  const rewrittenArtifacts: string[] = []

  // 3. Sidecars — both rewrites are idempotent (already-UUID entries pass
  //    through), so retries don't double-mutate.
  const summariesRewritten = await migrateChapterSummariesSidecar(rootPath, legacyMap, backupDir)
  if (summariesRewritten) rewrittenArtifacts.push(CHAPTER_SUMMARIES_FILENAME)
  const matrixRewritten = await migrateTraceabilityMatrixSidecar(rootPath, legacyMap, backupDir)
  if (matrixRewritten) rewrittenArtifacts.push(TRACEABILITY_MATRIX_FILENAME)

  // 4. SQLite — UPDATE WHERE sectionId='legacy' is a no-op once rows hold
  //    UUIDs, so retries are safe.
  const sqliteRowsUpdated = await migrateSqliteReferences(projectId, legacyMap)

  // 5. Remap in-meta legacy refs and stamp v2 in a single atomic write so
  //    proposal.meta.json never goes from "v1 with legacy refs" to "v2 with
  //    legacy refs" — the marker bump and the rewrite happen together.
  const annotations = remapAnnotations(meta.annotations ?? [], legacyMap)
  const sourceAttributions = remapSourceAttributions(meta.sourceAttributions ?? [], legacyMap)
  const baselineValidations = remapBaselineValidations(meta.baselineValidations ?? [], legacyMap)
  const sectionWeights = remapSectionWeights(meta.sectionWeights, legacyMap)
  const confirmedSkeletons = remapConfirmedSkeletons(meta.confirmedSkeletons, legacyMap)

  const stampedMeta: Partial<ProposalMetadata> = {
    ...meta,
    annotations,
    sourceAttributions,
    baselineValidations,
    ...(sectionWeights ? { sectionWeights } : {}),
    ...(confirmedSkeletons ? { confirmedSkeletons } : {}),
    chapterIdentitySchemaVersion: CHAPTER_IDENTITY_SCHEMA_LATEST,
  }
  await writeJsonAtomic(metaPath, stampedMeta)
  rewrittenArtifacts.push(PROPOSAL_META_FILENAME)

  // 6. Migration complete — drop the progress file. Any subsequent failure
  //    here only delays cleanup; the next session will re-enter via the
  //    `chapterIdentitySchemaVersion === LATEST` short-circuit and the
  //    stale progress file is harmless (the v2 short-circuit fires first).
  await deleteMigrationProgress(rootPath)

  logger.info(
    `Chapter identity migrated (no sectionIndex): project=${projectId} ` +
      `legacyKeys=${legacyMap.size()} artifacts=[${rewrittenArtifacts.join(', ')}] ` +
      `sqlite=ann=${sqliteRowsUpdated.annotations},` +
      `trc=${sqliteRowsUpdated.traceabilityLinks},` +
      `ntf=${sqliteRowsUpdated.notifications}`
  )

  return {
    alreadyMigrated: false,
    projectId,
    legacyIdCount: legacyMap.size(),
    rewrittenArtifacts,
    backupDir,
    sqliteRowsUpdated,
  }
}

async function performMigration(projectId: string): Promise<MigrationReport> {
  const rootPath = resolveProjectDataPath(projectId)
  const metaPath = join(rootPath, PROPOSAL_META_FILENAME)
  const meta = await tryReadJson<Partial<ProposalMetadata>>(metaPath)

  // Brand-new projects (no metadata yet) or already-v2 projects: no-op.
  if (!meta) {
    return {
      alreadyMigrated: true,
      projectId,
      legacyIdCount: 0,
      rewrittenArtifacts: [],
      sqliteRowsUpdated: { annotations: 0, traceabilityLinks: 0, notifications: 0 },
    }
  }
  if (meta.chapterIdentitySchemaVersion === CHAPTER_IDENTITY_SCHEMA_LATEST) {
    return {
      alreadyMigrated: true,
      projectId,
      legacyIdCount: 0,
      rewrittenArtifacts: [],
      sqliteRowsUpdated: { annotations: 0, traceabilityLinks: 0, notifications: 0 },
    }
  }

  // No chapter structure yet (project created pre-skeleton): build an
  // alias-resolved canonical map before stamping v2. Pre-Story-2.8 projects
  // can carry locator keys + title-hash fallbacks for the SAME chapter in
  // different artifacts; the resolver collapses both forms onto one UUID
  // (Story 11.1 review fix C).
  if (!Array.isArray(meta.sectionIndex) || meta.sectionIndex.length === 0) {
    const inProgress = await readMigrationProgress(rootPath)
    const { legacyMap, probedTokens } = await resolveLegacyAliasMap(
      projectId,
      rootPath,
      meta,
      inProgress?.legacyMap ?? {}
    )
    // Resume an in-progress migration even when this round finds nothing
    // new — the previous attempt may have rewritten every artifact up to
    // (but not including) the schema stamp, in which case we still need to
    // enter migrateWithoutSectionIndex to finish stamping + cleanup.
    if (probedTokens.size === 0 && !inProgress) {
      await stampSchemaVersion(metaPath, meta)
      return {
        alreadyMigrated: true,
        projectId,
        legacyIdCount: 0,
        rewrittenArtifacts: [],
        sqliteRowsUpdated: { annotations: 0, traceabilityLinks: 0, notifications: 0 },
      }
    }
    logger.info(
      `Chapter identity migration: project=${projectId} has no sectionIndex but ` +
        `${probedTokens.size} legacy id(s) found in dependents` +
        (inProgress ? ' (resuming in-progress migration)' : '') +
        ' — performing UUID rewrite'
    )
    return migrateWithoutSectionIndex(projectId, rootPath, meta, legacyMap, inProgress)
  }

  const ts = timestamp()
  const backupDir = join(rootPath, `.backup-${ts}`, 'chapter-identity-v1')
  await mkdir(backupDir, { recursive: true })

  const rewrittenArtifacts: string[] = []
  const legacyMap = new LegacyIdMap()

  // 1. Back up proposal.meta.json before we touch anything.
  await backupFile(metaPath, backupDir, PROPOSAL_META_FILENAME)

  // 2. sectionIndex is the canonical seed — migrate it first to register all
  //    legacy → UUID mappings for downstream remapping steps.
  let sectionIndex = (meta.sectionIndex ?? []) as ProposalSectionIndexEntry[]
  sectionIndex = migrateSectionIndex(sectionIndex, legacyMap)
  sectionIndex = remapParentIds(sectionIndex, legacyMap)

  // 3. Remap every sidecar field using the now-populated legacyMap.
  const sectionWeights = remapSectionWeights(meta.sectionWeights, legacyMap)
  const confirmedSkeletons = remapConfirmedSkeletons(meta.confirmedSkeletons, legacyMap)
  const annotations = remapAnnotations(meta.annotations ?? [], legacyMap)
  const sourceAttributions = remapSourceAttributions(meta.sourceAttributions ?? [], legacyMap)
  const baselineValidations = remapBaselineValidations(meta.baselineValidations ?? [], legacyMap)

  // Build the rewritten meta WITHOUT the schema marker. The marker is the
  // resume signal — if any later step (sidecars, SQLite) throws, the next
  // session must observe a non-v2 meta and retry the full migration. The
  // sectionIndex on disk now holds UUIDs while the dependent files may still
  // reference legacy ids, but `migrateSectionIndex` also registers
  // locator-key / title-hash / templateSectionKey aliases against the same
  // UUID, so the retry's legacyMap covers all three flavours via the
  // already-UUID sectionIndex.
  const nextMetaWithoutVersion: ProposalMetadata = {
    version: meta.version || '1.0',
    projectId,
    annotations,
    scores: (meta.scores ?? []) as [],
    sourceAttributions,
    baselineValidations,
    ...(sectionWeights ? { sectionWeights } : {}),
    ...(sectionIndex.length > 0 ? { sectionIndex } : {}),
    ...(meta.templateId ? { templateId: meta.templateId } : {}),
    ...(meta.writingStyleId ? { writingStyleId: meta.writingStyleId } : {}),
    ...(confirmedSkeletons ? { confirmedSkeletons } : {}),
    lastSavedAt: meta.lastSavedAt || new Date().toISOString(),
  }
  await writeJsonAtomic(metaPath, nextMetaWithoutVersion)
  rewrittenArtifacts.push(PROPOSAL_META_FILENAME)

  // 4. Sidecars that live next to proposal.md.
  const summariesRewritten = await migrateChapterSummariesSidecar(rootPath, legacyMap, backupDir)
  if (summariesRewritten) rewrittenArtifacts.push(CHAPTER_SUMMARIES_FILENAME)
  const matrixRewritten = await migrateTraceabilityMatrixSidecar(rootPath, legacyMap, backupDir)
  if (matrixRewritten) rewrittenArtifacts.push(TRACEABILITY_MATRIX_FILENAME)

  // 5. SQLite references — single transaction covering annotations,
  //    traceability_links, notifications.
  const sqliteRowsUpdated = await migrateSqliteReferences(projectId, legacyMap)

  // 6. Stamp the schema marker LAST so a partial-failure replay re-runs the
  //    full pipeline instead of short-circuiting on a half-migrated project.
  const stamped: ProposalMetadata = {
    ...nextMetaWithoutVersion,
    chapterIdentitySchemaVersion: CHAPTER_IDENTITY_SCHEMA_LATEST,
  }
  await writeJsonAtomic(metaPath, stamped)

  logger.info(
    `Chapter identity migrated: project=${projectId} legacyKeys=${legacyMap.size()} ` +
      `artifacts=[${rewrittenArtifacts.join(', ')}] sqlite=` +
      `ann=${sqliteRowsUpdated.annotations},` +
      `trc=${sqliteRowsUpdated.traceabilityLinks},` +
      `ntf=${sqliteRowsUpdated.notifications}`
  )

  return {
    alreadyMigrated: false,
    projectId,
    legacyIdCount: legacyMap.size(),
    rewrittenArtifacts,
    backupDir,
    sqliteRowsUpdated,
  }
}

export const chapterIdentityMigrationService = {
  /**
   * Ensure the given project is on the latest chapter identity schema. Safe
   * to call repeatedly — short-circuits after the first successful run
   * (per session in memory; persistently via
   * `chapterIdentitySchemaVersion` in proposal.meta.json).
   */
  async ensureMigrated(projectId: string): Promise<MigrationReport> {
    const cached = memoedMigrations.get(projectId)
    if (cached) return cached
    const pending = (async () => {
      try {
        return await performMigration(projectId)
      } catch (err) {
        memoedMigrations.delete(projectId)
        throw new BidWiseError(
          ErrorCode.FILE_SYSTEM,
          `章节身份迁移失败: ${(err as Error).message}`,
          err
        )
      }
    })()
    memoedMigrations.set(projectId, pending)
    return pending
  },

  /** Test-only: drop the in-memory session cache. */
  resetForTests(): void {
    memoedMigrations.clear()
  },
}
