import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── fs mock backed by in-memory map ───
const fsState = new Map<string, string>()

const mockReadFile = vi.fn(async (path: string, _enc: string) => {
  if (!fsState.has(path)) {
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  }
  return fsState.get(path)!
})
const mockWriteFile = vi.fn(async (path: string, data: string, _enc: string) => {
  fsState.set(path, data)
})
const mockRename = vi.fn(async (from: string, to: string) => {
  const data = fsState.get(from)
  if (data !== undefined) {
    fsState.set(to, data)
    fsState.delete(from)
  }
})
const mockMkdir = vi.fn(async () => undefined)
const mockCopyFile = vi.fn(async (src: string, dest: string) => {
  const data = fsState.get(src)
  if (data !== undefined) fsState.set(dest, data)
})
const mockRm = vi.fn(async (path: string, _opts?: { force?: boolean }) => {
  fsState.delete(path)
})

vi.mock('fs', () => ({
  existsSync: (path: string) => fsState.has(path),
}))

vi.mock('fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...(args as [string, string])),
  writeFile: (...args: unknown[]) => mockWriteFile(...(args as [string, string, string])),
  rename: (...args: unknown[]) => mockRename(...(args as [string, string])),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  copyFile: (...args: unknown[]) => mockCopyFile(...(args as [string, string])),
  rm: (...args: unknown[]) => mockRm(...(args as [string, { force?: boolean } | undefined])),
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('@main/utils/project-paths', () => ({
  resolveProjectDataPath: (projectId: string) => `/data/projects/${projectId}`,
}))

// ─── SQLite mock ───
interface FakeRow {
  projectId: string
  sectionId: string
  [k: string]: unknown
}

const tables = {
  annotations: [] as FakeRow[],
  traceabilityLinks: [] as FakeRow[],
  notifications: [] as FakeRow[],
} as const

function makeUpdate(tableKey: keyof typeof tables): unknown {
  let whereProject: string | null = null
  let whereSection: string | null = null
  let nextSection: string | null = null
  const chain = {
    set(patch: { sectionId?: string }) {
      nextSection = patch.sectionId ?? null
      return chain
    },
    where(col: string, _op: string, value: string) {
      if (col === 'projectId') whereProject = value
      if (col === 'sectionId') whereSection = value
      return chain
    },
    async executeTakeFirst() {
      if (!whereProject || !whereSection || !nextSection) return { numUpdatedRows: 0n }
      let count = 0n
      for (const row of tables[tableKey]) {
        if (row.projectId === whereProject && row.sectionId === whereSection) {
          row.sectionId = nextSection
          count += 1n
        }
      }
      return { numUpdatedRows: count }
    },
  }
  return chain
}

function makeSelect(tableKey: keyof typeof tables): unknown {
  let whereProject: string | null = null
  const chain = {
    select(_col: string) {
      return chain
    },
    where(col: string, _op: string, value: string) {
      if (col === 'projectId') whereProject = value
      return chain
    },
    distinct() {
      return chain
    },
    async execute() {
      const seen = new Set<string>()
      const out: Array<{ sectionId: string }> = []
      for (const row of tables[tableKey]) {
        if (whereProject && row.projectId !== whereProject) continue
        if (seen.has(row.sectionId)) continue
        seen.add(row.sectionId)
        out.push({ sectionId: row.sectionId })
      }
      return out
    },
  }
  return chain
}

let updateThrowOn: Set<keyof typeof tables> = new Set()

const mockDb = {
  transaction: () => ({
    async execute<T>(fn: (trx: typeof mockDb) => Promise<T>): Promise<T> {
      return fn(mockDb)
    },
  }),
  updateTable(key: keyof typeof tables) {
    if (updateThrowOn.has(key)) {
      const err = new Error(`forced SQLite failure on ${key}`)
      // throw lazily inside executeTakeFirst so the chain shape is preserved
      return {
        set: () => ({
          where: () => ({
            where: () => ({
              async executeTakeFirst() {
                throw err
              },
            }),
          }),
        }),
      }
    }
    return makeUpdate(key)
  },
  selectFrom(key: keyof typeof tables) {
    return makeSelect(key)
  },
}

vi.mock('@main/db/client', () => ({
  getDb: () => mockDb,
}))

import { chapterIdentityMigrationService } from '@main/services/chapter-identity-migration-service'

const PROJECT_ID = 'proj-1'
const ROOT = `/data/projects/${PROJECT_ID}`
const META_PATH = `${ROOT}/proposal.meta.json`
const SUMMARIES_PATH = `${ROOT}/chapter-summaries.json`
const MATRIX_PATH = `${ROOT}/traceability-matrix.json`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function seedLegacyMeta(): void {
  fsState.set(
    META_PATH,
    JSON.stringify({
      version: '1.0',
      projectId: PROJECT_ID,
      annotations: [
        {
          id: 'ann-1',
          projectId: PROJECT_ID,
          sectionId: 's1.1',
          type: 'human',
          content: '需复核背景',
          author: 'user',
          status: 'pending',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ],
      scores: [],
      sourceAttributions: [
        {
          id: 'sa-1',
          sectionLocator: { title: '项目背景', level: 2, occurrenceIndex: 0 },
          paragraphIndex: 0,
          paragraphDigest: 'hash',
          sourceType: 'ai-inference',
          confidence: 0.7,
        },
      ],
      baselineValidations: [
        {
          id: 'bv-1',
          sectionLocator: { title: '项目背景', level: 2, occurrenceIndex: 0 },
          paragraphIndex: 0,
          claim: 'x',
          claimDigest: 'h',
          matched: true,
        },
      ],
      sectionIndex: [
        {
          sectionId: 's1',
          title: '项目概述',
          level: 1,
          order: 0,
          occurrenceIndex: 0,
          headingLocator: { title: '项目概述', level: 1, occurrenceIndex: 0 },
        },
        {
          sectionId: 's1.1',
          title: '项目背景',
          level: 2,
          order: 1,
          parentSectionId: 's1',
          occurrenceIndex: 0,
          headingLocator: { title: '项目背景', level: 2, occurrenceIndex: 0 },
        },
      ],
      sectionWeights: [
        {
          sectionId: 's1',
          sectionTitle: '项目概述',
          weightPercent: 20,
          isKeyFocus: true,
        },
      ],
      confirmedSkeletons: {
        '2:项目背景:0': {
          parentTitle: '项目背景',
          parentLevel: 2,
          sections: [{ title: '子节', level: 3, dimensions: ['functional'] }],
          dimensionChecklist: ['functional'],
          confirmedAt: '2026-03-01T00:00:00Z',
        },
      },
      lastSavedAt: '2026-04-01T00:00:00Z',
    })
  )
}

function seedSummariesSidecar(): void {
  fsState.set(
    SUMMARIES_PATH,
    JSON.stringify({
      version: 1,
      entries: [
        {
          headingKey: '2:项目背景:0',
          headingTitle: '项目背景',
          headingLevel: 2,
          occurrenceIndex: 0,
          lineHash: 'h1',
          summary: 'legacy summary',
          generatedAt: '2026-03-01T00:00:00Z',
          provider: 'claude',
          model: 'claude-opus',
        },
      ],
    })
  )
}

function seedMatrixSidecar(): void {
  fsState.set(
    MATRIX_PATH,
    JSON.stringify({
      projectId: PROJECT_ID,
      links: [
        {
          id: 'link-1',
          projectId: PROJECT_ID,
          requirementId: 'req-1',
          sectionId: 's1.1',
          sectionTitle: '项目背景',
          coverageStatus: 'covered',
          confidence: 0.9,
          source: 'auto',
        },
      ],
    })
  )
}

function seedSqliteRows(legacySectionId = 's1.1'): void {
  tables.annotations.length = 0
  tables.traceabilityLinks.length = 0
  tables.notifications.length = 0

  tables.annotations.push({
    id: 'ann-1',
    projectId: PROJECT_ID,
    sectionId: legacySectionId,
  })
  tables.traceabilityLinks.push({
    id: 'link-1',
    projectId: PROJECT_ID,
    sectionId: legacySectionId,
  })
  tables.notifications.push({
    id: 'ntf-1',
    projectId: PROJECT_ID,
    sectionId: legacySectionId,
  })
}

describe('chapter-identity-migration-service @story-11-1', () => {
  beforeEach(() => {
    fsState.clear()
    chapterIdentityMigrationService.resetForTests()
    mockReadFile.mockClear()
    mockWriteFile.mockClear()
    mockRename.mockClear()
    mockMkdir.mockClear()
    mockCopyFile.mockClear()
    mockRm.mockClear()
    updateThrowOn = new Set()
    seedLegacyMeta()
    seedSummariesSidecar()
    seedMatrixSidecar()
    seedSqliteRows()
  })

  afterEach(() => {
    fsState.clear()
    chapterIdentityMigrationService.resetForTests()
  })

  it('mints UUIDs for legacy template keys and stamps schema v2', async () => {
    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    expect(report.alreadyMigrated).toBe(false)
    expect(report.legacyIdCount).toBeGreaterThan(0)
    expect(report.rewrittenArtifacts).toContain('proposal.meta.json')

    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    expect(nextMeta.chapterIdentitySchemaVersion).toBe(2)
    for (const entry of nextMeta.sectionIndex) {
      expect(entry.sectionId).toMatch(UUID_RE)
    }
    const bgEntry = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目背景')
    expect(bgEntry.templateSectionKey).toBe('s1.1')

    const root = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目概述')
    expect(bgEntry.parentSectionId).toBe(root.sectionId)
  })

  it('rewrites SQLite sectionId references inside the transaction', async () => {
    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    expect(report.sqliteRowsUpdated.annotations).toBe(1)
    expect(report.sqliteRowsUpdated.traceabilityLinks).toBe(1)
    expect(report.sqliteRowsUpdated.notifications).toBe(1)

    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    const bgEntry = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目背景')
    expect(tables.annotations[0].sectionId).toBe(bgEntry.sectionId)
    expect(tables.traceabilityLinks[0].sectionId).toBe(bgEntry.sectionId)
    expect(tables.notifications[0].sectionId).toBe(bgEntry.sectionId)
  })

  it('migrates confirmedSkeletons key from locator key to UUID', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    const bgEntry = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目背景')
    const keys = Object.keys(nextMeta.confirmedSkeletons)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toBe(bgEntry.sectionId)
    expect(keys[0]).toMatch(UUID_RE)
  })

  it('stamps canonical sectionId on sidecar attributions, validations, and summaries', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    const bgEntry = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目背景')
    expect(nextMeta.sourceAttributions[0].sectionId).toBe(bgEntry.sectionId)
    expect(nextMeta.baselineValidations[0].sectionId).toBe(bgEntry.sectionId)

    const summaries = JSON.parse(fsState.get(SUMMARIES_PATH)!)
    expect(summaries.entries[0].sectionId).toBe(bgEntry.sectionId)
  })

  it('rewrites traceability-matrix.json sidecar link references', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    const bgEntry = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目背景')
    const snap = JSON.parse(fsState.get(MATRIX_PATH)!)
    expect(snap.links[0].sectionId).toBe(bgEntry.sectionId)
  })

  it('is idempotent: re-running after v2 marker returns alreadyMigrated=true', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    chapterIdentityMigrationService.resetForTests()

    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.alreadyMigrated).toBe(true)
    expect(report.legacyIdCount).toBe(0)
  })

  it('writes backup copies before mutating proposal.meta.json', async () => {
    const originalMeta = fsState.get(META_PATH)
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    const backupEntries = Array.from(fsState.keys()).filter(
      (p) => p.includes('/.backup-') && p.endsWith('/proposal.meta.json')
    )
    expect(backupEntries.length).toBe(1)
    expect(fsState.get(backupEntries[0])).toBe(originalMeta)
  })

  it('treats missing proposal.meta.json as already migrated (brand-new project)', async () => {
    fsState.delete(META_PATH)
    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.alreadyMigrated).toBe(true)
  })

  it('backfills templateSectionKey from legacy template-style id', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    const root = nextMeta.sectionIndex.find((s: { title: string }) => s.title === '项目概述')
    expect(root.templateSectionKey).toBe('s1')
  })

  it('@review-11-1-f3 does NOT promote locator-key sectionId to templateSectionKey', async () => {
    // Seed a v1 meta where the legacy sectionId is a locator key
    // (`level:title:occ`) — historically misclassified as a template key.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
        sectionIndex: [
          {
            sectionId: '2:项目背景:0',
            title: '项目背景',
            level: 2,
            order: 0,
            occurrenceIndex: 0,
            headingLocator: { title: '项目背景', level: 2, occurrenceIndex: 0 },
          },
          {
            sectionId: 'heading-2-deadbeef',
            title: '另一节',
            level: 2,
            order: 1,
            occurrenceIndex: 0,
            headingLocator: { title: '另一节', level: 2, occurrenceIndex: 0 },
          },
        ],
      })
    )

    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    const nextMeta = JSON.parse(fsState.get(META_PATH)!)
    for (const entry of nextMeta.sectionIndex) {
      expect(entry.templateSectionKey).toBeUndefined()
    }
  })

  it('@review-11-1-f1 stamps schema v2 only AFTER sidecar + SQLite writes', async () => {
    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    // Capture the order in which files were written (writeFile uses tmp paths
    // followed by rename, so we look at rename targets).
    const renameOrder = mockRename.mock.calls.map(([, to]) => to as string)
    const metaWrites = renameOrder.filter((p) => p.endsWith('/proposal.meta.json'))

    // Two writes to proposal.meta.json: first WITHOUT version stamp, second
    // WITH version stamp. There must be at least one sidecar / matrix write
    // BETWEEN them so that a partial failure leaves meta on v1.
    expect(metaWrites.length).toBeGreaterThanOrEqual(2)
    const firstMetaIdx = renameOrder.indexOf(metaWrites[0])
    const lastMetaIdx = renameOrder.lastIndexOf(metaWrites[metaWrites.length - 1])
    const between = renameOrder.slice(firstMetaIdx + 1, lastMetaIdx)
    const sidecarWriteCount = between.filter(
      (p) => p.endsWith('/chapter-summaries.json') || p.endsWith('/traceability-matrix.json')
    ).length
    expect(sidecarWriteCount).toBeGreaterThan(0)
  })

  it('@review-11-1-f1 leaves meta on v1 when SQLite migration fails (no sticky stamp)', async () => {
    updateThrowOn = new Set(['traceabilityLinks'])
    await expect(chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)).rejects.toThrow(
      /章节身份迁移失败/
    )

    const meta = JSON.parse(fsState.get(META_PATH)!)
    expect(meta.chapterIdentitySchemaVersion).not.toBe(2)

    // Retry with the SQLite failure cleared — must complete and stamp v2.
    updateThrowOn = new Set()
    chapterIdentityMigrationService.resetForTests()
    seedSqliteRows() // re-seed the rows the mock reset between calls
    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.alreadyMigrated).toBe(false)
    const finalMeta = JSON.parse(fsState.get(META_PATH)!)
    expect(finalMeta.chapterIdentitySchemaVersion).toBe(2)
  })

  it('@review-11-1-f2 empty sectionIndex with legacy SQLite refs rewrites instead of stamping', async () => {
    // Project with no sectionIndex but legacy locator-key annotation rows —
    // pre-Story-2.8 shape. Blind v2 stamp would freeze legacy ids in place.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
        // no sectionIndex
      })
    )
    fsState.delete(SUMMARIES_PATH)
    fsState.delete(MATRIX_PATH)
    seedSqliteRows('2:项目背景:0')

    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    // Must have rewritten SQLite rows to a UUID — not short-circuited.
    expect(report.legacyIdCount).toBeGreaterThan(0)
    expect(report.sqliteRowsUpdated.annotations).toBe(1)
    expect(tables.annotations[0].sectionId).toMatch(UUID_RE)
    expect(tables.traceabilityLinks[0].sectionId).toMatch(UUID_RE)
    expect(tables.notifications[0].sectionId).toMatch(UUID_RE)

    // Schema marker stamped only after the rewrite succeeded.
    const meta = JSON.parse(fsState.get(META_PATH)!)
    expect(meta.chapterIdentitySchemaVersion).toBe(2)
  })

  it('@review-11-1-f2 empty sectionIndex with NO legacy refs still stamps v2 (brand-new)', async () => {
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
      })
    )
    fsState.delete(SUMMARIES_PATH)
    fsState.delete(MATRIX_PATH)
    tables.annotations.length = 0
    tables.traceabilityLinks.length = 0
    tables.notifications.length = 0

    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.alreadyMigrated).toBe(true)
    const meta = JSON.parse(fsState.get(META_PATH)!)
    expect(meta.chapterIdentitySchemaVersion).toBe(2)
  })

  it('@review-11-1-fB1 no-sectionIndex probe rewrites headingKey-only summary entries', async () => {
    // Legacy summary sidecar carries `headingKey` but no `sectionId` — this
    // is the v1 shape. Prior probe missed these entries entirely.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
      })
    )
    fsState.set(
      SUMMARIES_PATH,
      JSON.stringify({
        version: 1,
        entries: [
          {
            // sectionId intentionally omitted — pure v1 shape.
            headingKey: '2:遗留章节:0',
            headingTitle: '遗留章节',
            headingLevel: 2,
            occurrenceIndex: 0,
            lineHash: 'h',
            summary: 'legacy',
            generatedAt: '2026-03-01T00:00:00Z',
            provider: 'claude',
            model: 'claude-opus',
          },
        ],
      })
    )
    fsState.delete(MATRIX_PATH)
    tables.annotations.length = 0
    tables.traceabilityLinks.length = 0
    tables.notifications.length = 0

    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.legacyIdCount).toBeGreaterThan(0)

    const summaries = JSON.parse(fsState.get(SUMMARIES_PATH)!)
    expect(summaries.entries[0].sectionId).toMatch(UUID_RE)
  })

  it('@review-11-1-fB2 no-sectionIndex branch remaps in-meta legacy refs before stamping v2', async () => {
    // Project carries legacy refs in proposal.meta.json: locator-key
    // annotation, locator-key confirmedSkeletons, sectionLocator-only
    // attribution + validation. Without an in-meta remap, these would
    // survive into v2 untouched.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [
          {
            id: 'ann-1',
            projectId: PROJECT_ID,
            sectionId: '2:遗留章节:0',
            type: 'human',
            content: 'x',
            author: 'u',
            status: 'pending',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
        scores: [],
        sourceAttributions: [
          {
            id: 'sa-1',
            sectionLocator: { title: '遗留章节', level: 2, occurrenceIndex: 0 },
            paragraphIndex: 0,
            paragraphDigest: 'h',
            sourceType: 'ai-inference',
            confidence: 0.5,
          },
        ],
        baselineValidations: [
          {
            id: 'bv-1',
            sectionLocator: { title: '遗留章节', level: 2, occurrenceIndex: 0 },
            paragraphIndex: 0,
            claim: 'x',
            claimDigest: 'h',
            matched: true,
          },
        ],
        confirmedSkeletons: {
          '2:遗留章节:0': {
            parentTitle: '遗留章节',
            parentLevel: 2,
            sections: [],
            dimensionChecklist: [],
            confirmedAt: '2026-03-01T00:00:00Z',
          },
        },
      })
    )
    fsState.delete(SUMMARIES_PATH)
    fsState.delete(MATRIX_PATH)
    tables.annotations.length = 0
    tables.traceabilityLinks.length = 0
    tables.notifications.length = 0

    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    const meta = JSON.parse(fsState.get(META_PATH)!)

    expect(meta.chapterIdentitySchemaVersion).toBe(2)
    expect(meta.annotations[0].sectionId).toMatch(UUID_RE)
    expect(meta.sourceAttributions[0].sectionId).toMatch(UUID_RE)
    expect(meta.baselineValidations[0].sectionId).toMatch(UUID_RE)
    const skeletonKeys = Object.keys(meta.confirmedSkeletons)
    expect(skeletonKeys).toHaveLength(1)
    expect(skeletonKeys[0]).toMatch(UUID_RE)

    // All four refs to the same legacy chapter must resolve to the SAME UUID.
    const uuid = meta.annotations[0].sectionId
    expect(meta.sourceAttributions[0].sectionId).toBe(uuid)
    expect(meta.baselineValidations[0].sectionId).toBe(uuid)
    expect(skeletonKeys[0]).toBe(uuid)
  })

  it('@review-11-1-fA no-sectionIndex replay reuses progress-file UUIDs after partial failure', async () => {
    // No sectionIndex; legacy refs in summary sidecar + SQLite. Force the
    // first SQLite update to throw — the sidecar gets rewritten with UUID-X,
    // SQLite stays on legacy. On retry the same UUID-X must propagate to
    // SQLite via the persisted progress file.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
      })
    )
    fsState.set(
      SUMMARIES_PATH,
      JSON.stringify({
        version: 1,
        entries: [
          {
            headingKey: '2:重放章节:0',
            headingTitle: '重放章节',
            headingLevel: 2,
            occurrenceIndex: 0,
            lineHash: 'h',
            summary: 's',
            generatedAt: '2026-03-01T00:00:00Z',
            provider: 'claude',
            model: 'claude-opus',
          },
        ],
      })
    )
    fsState.delete(MATRIX_PATH)
    seedSqliteRows('2:重放章节:0')

    updateThrowOn = new Set(['annotations'])
    await expect(chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)).rejects.toThrow(
      /章节身份迁移失败/
    )

    // After failed first run: sidecar rewritten with UUID-X, progress file
    // present, meta still on v1, SQLite untouched.
    const summariesAfterFail = JSON.parse(fsState.get(SUMMARIES_PATH)!)
    const uuidFromFirstRun = summariesAfterFail.entries[0].sectionId
    expect(uuidFromFirstRun).toMatch(UUID_RE)
    const progressPath = `${ROOT}/.chapter-identity-migration-progress.json`
    expect(fsState.has(progressPath)).toBe(true)
    const metaAfterFail = JSON.parse(fsState.get(META_PATH)!)
    expect(metaAfterFail.chapterIdentitySchemaVersion).not.toBe(2)
    // SQLite annotations row still legacy because the throw happened on it.
    expect(tables.annotations[0].sectionId).toBe('2:重放章节:0')

    // Retry — clear the forced failure, reset session memo.
    updateThrowOn = new Set()
    chapterIdentityMigrationService.resetForTests()
    const report = await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    expect(report.alreadyMigrated).toBe(false)

    // SQLite + sidecar must both carry the SAME UUID minted in the first
    // run — proving the progress-file mapping was reused.
    expect(tables.annotations[0].sectionId).toBe(uuidFromFirstRun)
    expect(tables.traceabilityLinks[0].sectionId).toBe(uuidFromFirstRun)
    expect(tables.notifications[0].sectionId).toBe(uuidFromFirstRun)
    const summariesFinal = JSON.parse(fsState.get(SUMMARIES_PATH)!)
    expect(summariesFinal.entries[0].sectionId).toBe(uuidFromFirstRun)

    // Schema stamped, progress file deleted.
    const finalMeta = JSON.parse(fsState.get(META_PATH)!)
    expect(finalMeta.chapterIdentitySchemaVersion).toBe(2)
    expect(fsState.has(progressPath)).toBe(false)
  })

  it('@review-11-1-fC no-sectionIndex collapses locator-key + title-hash aliases of the same chapter onto one UUID', async () => {
    // Mixed-id legacy project: same chapter referenced as locator-key in
    // summary + confirmedSkeletons, and as title-hash fallback in matrix
    // link sectionId. The two forms must resolve to the SAME UUID.
    const sharedTitle = '共享章节'
    const sharedLevel = 2
    const sharedOcc = 0
    const locatorKey = `${sharedLevel}:${sharedTitle}:${sharedOcc}`
    const titleHashFallback = `heading-${sharedLevel}-${createHash('sha1')
      .update(`${sharedLevel}:${sharedTitle}:${sharedOcc}`)
      .digest('hex')}`

    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
        confirmedSkeletons: {
          [locatorKey]: {
            parentTitle: sharedTitle,
            parentLevel: sharedLevel,
            sections: [],
            dimensionChecklist: [],
            confirmedAt: '2026-03-01T00:00:00Z',
          },
        },
      })
    )
    fsState.set(
      SUMMARIES_PATH,
      JSON.stringify({
        version: 1,
        entries: [
          {
            headingKey: locatorKey,
            headingTitle: sharedTitle,
            headingLevel: sharedLevel,
            occurrenceIndex: sharedOcc,
            lineHash: 'h',
            summary: 's',
            generatedAt: '2026-03-01T00:00:00Z',
            provider: 'claude',
            model: 'claude-opus',
          },
        ],
      })
    )
    fsState.set(
      MATRIX_PATH,
      JSON.stringify({
        projectId: PROJECT_ID,
        links: [
          {
            id: 'link-1',
            projectId: PROJECT_ID,
            requirementId: 'req-1',
            sectionId: titleHashFallback,
            sectionTitle: sharedTitle,
            coverageStatus: 'covered',
            confidence: 0.9,
            source: 'auto',
          },
        ],
      })
    )
    tables.annotations.length = 0
    tables.traceabilityLinks.length = 0
    tables.notifications.length = 0

    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)

    const meta = JSON.parse(fsState.get(META_PATH)!)
    const summaries = JSON.parse(fsState.get(SUMMARIES_PATH)!)
    const matrix = JSON.parse(fsState.get(MATRIX_PATH)!)
    const skeletonKeys = Object.keys(meta.confirmedSkeletons)

    const summaryUuid = summaries.entries[0].sectionId
    const matrixUuid = matrix.links[0].sectionId
    const skeletonUuid = skeletonKeys[0]

    expect(summaryUuid).toMatch(UUID_RE)
    expect(matrixUuid).toMatch(UUID_RE)
    expect(skeletonUuid).toMatch(UUID_RE)
    expect(matrixUuid).toBe(summaryUuid)
    expect(skeletonUuid).toBe(summaryUuid)
  })

  it('@review-11-1-fC distinct chapters still get distinct UUIDs (no over-collapse)', async () => {
    // Two genuinely different chapters: only their locator-keys appear, in
    // separate artifacts. Must NOT be collapsed onto one UUID.
    fsState.set(
      META_PATH,
      JSON.stringify({
        version: '1.0',
        projectId: PROJECT_ID,
        annotations: [
          {
            id: 'ann-1',
            projectId: PROJECT_ID,
            sectionId: '2:章节A:0',
            type: 'human',
            content: 'x',
            author: 'u',
            status: 'pending',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
          {
            id: 'ann-2',
            projectId: PROJECT_ID,
            sectionId: '2:章节B:0',
            type: 'human',
            content: 'y',
            author: 'u',
            status: 'pending',
            createdAt: '2026-03-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
        ],
        scores: [],
        sourceAttributions: [],
        baselineValidations: [],
      })
    )
    fsState.delete(SUMMARIES_PATH)
    fsState.delete(MATRIX_PATH)
    tables.annotations.length = 0
    tables.traceabilityLinks.length = 0
    tables.notifications.length = 0

    await chapterIdentityMigrationService.ensureMigrated(PROJECT_ID)
    const meta = JSON.parse(fsState.get(META_PATH)!)
    const uuidA = meta.annotations.find((a: { id: string }) => a.id === 'ann-1').sectionId
    const uuidB = meta.annotations.find((a: { id: string }) => a.id === 'ann-2').sectionId
    expect(uuidA).toMatch(UUID_RE)
    expect(uuidB).toMatch(UUID_RE)
    expect(uuidA).not.toBe(uuidB)
  })
})
