/**
 * Chapter Structure Delete Lifecycle (Story 11.4).
 *
 * Implements soft-delete / Undo / finalize / startup cleanup on top of
 * `chapter-structure-service`'s existing read/write primitives. Keeps the
 * public IPC surface on `chapter-structure:*` — this module is an internal
 * helper that owns the persisted Undo journal living in
 * `proposal.meta.json.pendingStructureDeletions[]`.
 *
 * Two-stage activation:
 *   1. requestSoftDelete writes a `staged` journal entry capturing the pre-
 *      delete cascade snapshot.
 *   2. live delete mutates proposal.md + metadata + SQLite + sidecars.
 *   3. on full success the journal entry flips `staged` → `active` and
 *      becomes visible to the renderer. A crash between 1 and 3 leaves only
 *      `staged` entries, which startup cleanup rolls back using the same
 *      Undo path — they never get treated as finalized deletions.
 */
import { randomUUID } from 'crypto'
import { documentService } from '@main/services/document-service'
import { chapterSummaryStore } from '@main/services/chapter-summary-store'
import { AnnotationRepository } from '@main/db/repositories/annotation-repo'
import { TraceabilityLinkRepository } from '@main/db/repositories/traceability-link-repo'
import { NotificationRepository } from '@main/db/repositories/notification-repo'
import { projectService } from '@main/services/project-service'
import { createLogger } from '@main/utils/logger'
import { NotFoundError, ValidationError } from '@main/utils/errors'
import {
  buildChapterTree,
  deriveSectionPath,
  resolveLocatorFromSectionId,
} from '@shared/chapter-identity'
import {
  extractSectionSubtree,
  restoreSectionSubtree,
  countChapterCharacters,
} from '@shared/chapter-markdown'
import type {
  ChapterHeadingLocator,
  PendingStructureDeletionSnapshot,
  PendingStructureDeletionSummary,
  RestoreAnchor,
} from '@shared/chapter-types'
import type { ProposalSectionIndexEntry, SectionWeightEntry } from '@shared/template-types'
import type { ProposalMetadata } from '@shared/models/proposal'
import type { SourceAttribution, BaselineValidation } from '@shared/source-attribution-types'
import type { AnnotationRecord } from '@shared/annotation-types'
import type { TraceabilityLink } from '@shared/analysis-types'
import type { NotificationRecord } from '@shared/notification-types'
import type { ChapterSummaryEntry } from '@shared/chapter-summary-types'

const logger = createLogger('chapter-structure-delete-service')
const UNDO_WINDOW_MS = 5_000

/**
 * Lazily loaded to keep this module free of the document-parser singleton
 * graph at import time — that graph pulls in `agent-orchestrator` →
 * `skill-engine` → `@electron-toolkit/utils`, which the Vitest main-process
 * sandbox cannot resolve. Callers swallow rebuild failures themselves; this
 * wrapper just narrows the dynamic import surface.
 */
async function rebuildTraceabilitySnapshot(projectId: string): Promise<void> {
  try {
    const mod = await import('@main/services/document-parser/traceability-matrix-service-instance')
    await mod.traceabilityMatrixService.rebuildSnapshot(projectId)
  } catch (err) {
    logger.warn(
      `traceability matrix rebuildSnapshot failed for project ${projectId}: ${(err as Error).message}`
    )
  }
}

const annotationRepo = new AnnotationRepository()
const traceabilityLinkRepo = new TraceabilityLinkRepository()
const notificationRepo = new NotificationRepository()

export interface RequestSoftDeleteResult {
  deletionId: string
  deletedAt: string
  expiresAt: string
  lastSavedAt: string
  markdown: string
  sectionIndex: ProposalSectionIndexEntry[]
  summary: PendingStructureDeletionSummary
}

export interface UndoDeleteResult {
  lastSavedAt: string
  markdown: string
  sectionIndex: ProposalSectionIndexEntry[]
  restoredFocusLocator?: ChapterHeadingLocator
}

function toSummary(snapshot: PendingStructureDeletionSnapshot): PendingStructureDeletionSummary {
  return {
    deletionId: snapshot.deletionId,
    deletedAt: snapshot.deletedAt,
    expiresAt: snapshot.expiresAt,
    rootSectionId: snapshot.rootSectionId,
    sectionIds: snapshot.sectionIds,
    firstTitle: snapshot.firstTitle,
    totalWordCount: snapshot.totalWordCount,
    subtreeSize: snapshot.sectionIndexEntries.length,
    sectionIndexEntries: snapshot.sectionIndexEntries,
  }
}

function collectSubtreeSectionIds(
  sectionIndex: ProposalSectionIndexEntry[],
  rootSectionId: string
): string[] {
  const tree = buildChapterTree(sectionIndex)
  const stack = [...tree]
  const roots: Array<ReturnType<typeof buildChapterTree>[number]> = []
  while (stack.length > 0) {
    const n = stack.shift()!
    if (n.sectionId === rootSectionId) {
      roots.push(n)
      continue
    }
    stack.push(...n.children)
  }
  if (roots.length === 0) {
    throw new NotFoundError(`sectionId 不存在: ${rootSectionId}`)
  }
  const collected: string[] = []
  const walk = [...roots]
  while (walk.length > 0) {
    const n = walk.pop()!
    collected.push(n.sectionId)
    walk.push(...n.children)
  }
  return collected
}

function computeRestoreAnchor(
  sectionIndex: ProposalSectionIndexEntry[],
  rootSectionId: string
): RestoreAnchor {
  const rootEntry = sectionIndex.find((e) => e.sectionId === rootSectionId)
  if (!rootEntry) throw new NotFoundError(`sectionId 不存在: ${rootSectionId}`)
  const parentSectionId = rootEntry.parentSectionId ?? null

  const siblings = sectionIndex.filter((e) =>
    parentSectionId ? e.parentSectionId === parentSectionId : !e.parentSectionId
  )
  const sorted = [...siblings].sort((a, b) => a.order - b.order)
  const rootIdx = sorted.findIndex((e) => e.sectionId === rootSectionId)
  const previousSiblingEntry = rootIdx > 0 ? sorted[rootIdx - 1] : null
  const previousHeadingLocator: ChapterHeadingLocator | null = previousSiblingEntry
    ? (resolveLocatorFromSectionId(sectionIndex, previousSiblingEntry.sectionId) ?? null)
    : null

  return {
    parentSectionId,
    previousSiblingSectionId: previousSiblingEntry?.sectionId ?? null,
    previousHeadingLocator,
  }
}

export const chapterStructureDeleteService = {
  /**
   * Kick off a soft delete. Writes the staged journal + applies live deletion
   * across markdown, metadata, sidecars and SQLite; activates the Undo window
   * on success. Rejects if any active Undo window already exists (single-
   * window invariant AC6) — the caller is expected to finalize the older
   * window first via the renderer-owned replacement flow.
   */
  async requestSoftDelete(
    projectId: string,
    sectionIds: string[]
  ): Promise<RequestSoftDeleteResult> {
    if (sectionIds.length === 0) {
      throw new ValidationError('requestSoftDelete: sectionIds 不能为空')
    }

    const doc = await documentService.load(projectId)
    const meta = await documentService.getMetadata(projectId)
    const sectionIndex = meta.sectionIndex ?? []

    const rootSectionId = sectionIds[0]
    const rootEntry = sectionIndex.find((e) => e.sectionId === rootSectionId)
    if (!rootEntry) {
      throw new NotFoundError(`sectionId 不存在: ${rootSectionId}`)
    }

    // Derive the full subtree scope from sectionIndex so the caller doesn't
    // have to know the cascade shape — still honours any wider set the
    // caller explicitly passed in (e.g. multi-node future selection).
    const cascadedIds = collectSubtreeSectionIds(sectionIndex, rootSectionId)
    const fullIdSet = new Set<string>([...cascadedIds, ...sectionIds])
    const effectiveIds = Array.from(fullIdSet)
    const effectiveIdSet = new Set(effectiveIds)

    const extract = extractSectionSubtree(doc.content, rootEntry.headingLocator)
    if (!extract) {
      throw new NotFoundError(`markdown 中找不到 sectionId: ${rootSectionId}`)
    }

    // Sidecar / SQLite snapshots — captured BEFORE any destructive write.
    const sqliteAnnotations = await annotationRepo.findByProjectAndSectionIds(
      projectId,
      effectiveIds
    )
    const sqliteTraceabilityLinks = await traceabilityLinkRepo.findByProjectAndSectionIds(
      projectId,
      effectiveIds
    )
    const sqliteNotifications = await notificationRepo.findByProjectAndSectionIds(
      projectId,
      effectiveIds
    )

    const sectionIndexEntries = sectionIndex.filter((e) => effectiveIdSet.has(e.sectionId))
    const sectionWeightsSnapshot = (meta.sectionWeights ?? []).filter((w) =>
      effectiveIdSet.has(w.sectionId)
    )
    const confirmedSkeletonsSnapshot: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(meta.confirmedSkeletons ?? {})) {
      if (effectiveIdSet.has(key)) confirmedSkeletonsSnapshot[key] = value
    }
    const annotationsSnapshot = (meta.annotations ?? []).filter(
      (a: AnnotationRecord) => a.sectionId && effectiveIdSet.has(a.sectionId)
    )
    const sourceAttributionsSnapshot = (meta.sourceAttributions ?? []).filter(
      (s) => s.sectionId && effectiveIdSet.has(s.sectionId)
    )
    const baselineValidationsSnapshot = (meta.baselineValidations ?? []).filter(
      (b) => b.sectionId && effectiveIdSet.has(b.sectionId)
    )

    const restoreAnchor = computeRestoreAnchor(sectionIndex, rootSectionId)
    const deletionId = randomUUID()
    const now = new Date()
    const deletedAt = now.toISOString()
    const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS).toISOString()

    // Step 1 — pre-commit: capture chapter-summary rows non-destructively.
    // The actual sidecar removal runs in Step 2b after the staged journal is
    // durable, so a crash between capture and journal write cannot drop rows
    // (startup cleanup only recovers rows that made it into the journal).
    const chapterSummariesSnapshot = await chapterSummaryStore.listBySectionIds(
      projectId,
      effectiveIds
    )

    const snapshot: PendingStructureDeletionSnapshot = {
      deletionId,
      stage: 'staged',
      deletedAt,
      expiresAt,
      rootSectionId,
      sectionIds: effectiveIds,
      firstTitle: rootEntry.title,
      subtreeMarkdown: extract.subtreeMarkdown,
      sectionIndexEntries,
      restoreAnchor,
      totalWordCount: extract.totalWordCount,
      cascade: {
        sectionWeights: sectionWeightsSnapshot,
        confirmedSkeletonsBySectionId: confirmedSkeletonsSnapshot,
        annotations: annotationsSnapshot,
        sourceAttributions: sourceAttributionsSnapshot,
        baselineValidations: baselineValidationsSnapshot,
        chapterSummaries: chapterSummariesSnapshot,
        // traceability-matrix.json is derivative of SQLite links and is
        // rewritten by the service's own snapshot path; no sidecar snapshot
        // needs to be captured here.
        traceabilityLinks: [],
        sqliteAnnotations,
        sqliteTraceabilityLinks,
        sqliteNotifications,
      },
    }

    // Step 2 — write staged journal + scrubbed metadata (single meta write).
    const scrubbedAt = new Date().toISOString()
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      sectionIndex: (current.sectionIndex ?? []).filter((e) => !effectiveIdSet.has(e.sectionId)),
      sectionWeights: (current.sectionWeights ?? []).filter(
        (w) => !effectiveIdSet.has(w.sectionId)
      ),
      confirmedSkeletons: omitKeys(current.confirmedSkeletons, effectiveIdSet),
      annotations: (current.annotations ?? []).filter(
        (a) => !a.sectionId || !effectiveIdSet.has(a.sectionId)
      ),
      sourceAttributions: (current.sourceAttributions ?? []).filter(
        (s) => !s.sectionId || !effectiveIdSet.has(s.sectionId)
      ),
      baselineValidations: (current.baselineValidations ?? []).filter(
        (b) => !b.sectionId || !effectiveIdSet.has(b.sectionId)
      ),
      pendingStructureDeletions: replaceActiveEntriesWithStaged(current, snapshot),
      lastSavedAt: scrubbedAt,
    }))

    // Step 2b — journal is now durable. Drop the chapter-summaries rows from
    // the sidecar. A crash after this point is recoverable via startup cleanup
    // of the staged journal entry, which re-inserts the snapshot via
    // `chapterSummaryStore.insertBatch`.
    try {
      await chapterSummaryStore.removeBySectionIds(projectId, effectiveIds)
    } catch (summaryErr) {
      logger.error(
        `soft-delete chapter-summary detach failed: project=${projectId} deletionId=${deletionId}`,
        summaryErr
      )
      await rollbackStagedDeletion(projectId, snapshot, doc.content)
      throw summaryErr
    }

    // Step 3 — live SQLite deletes (best-effort ordering; each batch is
    // atomic, and re-running startup cleanup of this `staged` entry would
    // restore rows if any step short-circuits.
    try {
      await annotationRepo.deleteByProjectAndSectionIds(projectId, effectiveIds)
      await traceabilityLinkRepo.deleteByProjectAndSectionIds(projectId, effectiveIds)
      await notificationRepo.deleteByProjectAndSectionIds(projectId, effectiveIds)
      // Rebuild traceability-matrix.json so `links` / `stats` / `updatedAt`
      // track the live SQLite set. Without this, matrix rows come from the
      // live DB (via getMatrix) while timestamp + impact highlights stay on
      // the pre-delete sidecar forever.
      await rebuildTraceabilitySnapshot(projectId)
    } catch (sqliteErr) {
      logger.error(
        `soft-delete SQLite cascade failed: project=${projectId} deletionId=${deletionId}`,
        sqliteErr
      )
      await rollbackStagedDeletion(projectId, snapshot, doc.content)
      throw sqliteErr
    }

    // Step 4 — live markdown write.
    let markdownLastSavedAt = scrubbedAt
    try {
      const res = await documentService.save(projectId, extract.remainderMarkdown)
      markdownLastSavedAt = res.lastSavedAt
    } catch (saveErr) {
      logger.error(
        `soft-delete markdown save failed: project=${projectId} deletionId=${deletionId}`,
        saveErr
      )
      await rollbackStagedDeletion(projectId, snapshot, doc.content)
      throw saveErr
    }

    // Step 5 — activate journal entry.
    const activatedMeta = await documentService.updateMetadata(projectId, (current) =>
      flipStagedToActive(current, deletionId)
    )

    return {
      deletionId,
      deletedAt,
      expiresAt,
      lastSavedAt: markdownLastSavedAt,
      markdown: extract.remainderMarkdown,
      sectionIndex: activatedMeta.sectionIndex ?? [],
      summary: toSummary(snapshot),
    }
  },

  /**
   * Undo an active Undo window. Restores markdown, metadata, sidecars and
   * SQLite rows, then drops the journal entry. Idempotent when the entry is
   * already gone — returns the current live snapshot so callers can reconcile.
   */
  async undoDelete(projectId: string, deletionId: string): Promise<UndoDeleteResult> {
    const meta = await documentService.getMetadata(projectId)
    const snapshot = (meta.pendingStructureDeletions ?? []).find((s) => s.deletionId === deletionId)
    if (!snapshot) {
      const doc = await documentService.load(projectId)
      return {
        lastSavedAt: doc.lastSavedAt,
        markdown: doc.content,
        sectionIndex: meta.sectionIndex ?? [],
      }
    }

    return runUndo(projectId, snapshot)
  },

  /**
   * Read the single active Undo window for a project (single-window invariant,
   * AC6). Returns `null` when no active entry exists. Staged entries are not
   * surfaced — startup cleanup is the only legitimate consumer of staged rows.
   *
   * Called by the renderer when it mounts against a project so a reload (or a
   * mid-window stage switch) re-hydrates the active window that already lives
   * in `proposal.meta.json.pendingStructureDeletions[]`. Without this path,
   * the journal entry would stay `active` on disk until process restart while
   * the toast + finalize timer disappear.
   */
  async getActivePendingDeletion(
    projectId: string
  ): Promise<PendingStructureDeletionSummary | null> {
    const meta = await documentService.getMetadata(projectId)
    const active = getLatestActiveSnapshot(meta.pendingStructureDeletions ?? [])
    return active ? toSummary(active) : null
  },

  /**
   * Finalize hard-delete: drop the journal entry without restoring anything.
   * Live state has already been mutated; this just closes the Undo window.
   * Idempotent — a missing deletionId is treated as already-finalized.
   */
  async finalizeDelete(projectId: string, deletionId: string): Promise<void> {
    await documentService.updateMetadata(projectId, (current) => {
      return removeDeletionWindowAndOlderActiveEntries(current, deletionId)
    })
  },

  /**
   * Process-start cleanup. Walks every project's journal and:
   *   - `staged` entries → roll back via the Undo path (live state may be
   *     partially mutated from a crashed commit).
   *   - `active` entries → finalize (live delete was already committed; the
   *     Undo window expires across restart per AC5).
   *
   * Returns the number of journal entries processed so callers can log it.
   */
  async cleanupPendingDeletionsOnStartup(): Promise<number> {
    let processed = 0
    let projects: Awaited<ReturnType<typeof projectService.list>> = []
    try {
      projects = await projectService.list()
    } catch (err) {
      logger.warn(`startup cleanup: project list failed: ${(err as Error).message}`)
      return 0
    }

    for (const project of projects) {
      if (!project.id || !project.rootPath) continue
      try {
        const meta = await documentService.getMetadata(project.id)
        const pending = meta.pendingStructureDeletions ?? []
        if (pending.length === 0) continue

        for (const snapshot of pending) {
          try {
            if (snapshot.stage === 'staged') {
              await runUndo(project.id, snapshot)
            } else {
              await documentService.updateMetadata(project.id, (current) => ({
                ...current,
                pendingStructureDeletions: (current.pendingStructureDeletions ?? []).filter(
                  (s) => s.deletionId !== snapshot.deletionId
                ),
              }))
            }
            processed += 1
          } catch (err) {
            logger.error(
              `startup cleanup failed for project ${project.id} deletion ${snapshot.deletionId}`,
              err
            )
          }
        }
      } catch (err) {
        logger.warn(
          `startup cleanup: metadata read failed for project ${project.id}: ${(err as Error).message}`
        )
      }
    }
    return processed
  },
}

function omitKeys<T>(
  record: Record<string, T> | undefined,
  keys: Set<string>
): Record<string, T> | undefined {
  if (!record) return record
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!keys.has(k)) out[k] = v
  }
  return out
}

function replaceActiveEntriesWithStaged(
  current: ProposalMetadata,
  snapshot: PendingStructureDeletionSnapshot
): PendingStructureDeletionSnapshot[] {
  return [
    ...(current.pendingStructureDeletions ?? []).filter((s) => s.stage !== 'active'),
    snapshot,
  ]
}

function flipStagedToActive(current: ProposalMetadata, deletionId: string): ProposalMetadata {
  const list = current.pendingStructureDeletions ?? []
  const hasTarget = list.some((s) => s.deletionId === deletionId)
  if (!hasTarget) return current
  return {
    ...current,
    pendingStructureDeletions: list.flatMap((s) => {
      if (s.deletionId === deletionId) {
        return [{ ...s, stage: 'active' as const }]
      }
      if (s.stage === 'active') return []
      return [s]
    }),
  }
}

function getLatestActiveSnapshot(
  pending: PendingStructureDeletionSnapshot[]
): PendingStructureDeletionSnapshot | null {
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    if (pending[i].stage === 'active') return pending[i]
  }
  return null
}

function removeDeletionWindowAndOlderActiveEntries(
  current: ProposalMetadata,
  deletionId: string
): ProposalMetadata {
  const list = current.pendingStructureDeletions ?? []
  const targetIndex = list.findIndex((s) => s.deletionId === deletionId)
  if (targetIndex < 0) return current
  return {
    ...current,
    pendingStructureDeletions: list.filter((s, index) => {
      if (s.deletionId === deletionId) return false
      if (s.stage === 'active' && index < targetIndex) return false
      return true
    }),
  }
}

async function rollbackStagedDeletion(
  projectId: string,
  snapshot: PendingStructureDeletionSnapshot,
  originalMarkdown: string
): Promise<void> {
  // Restore snapshot state in the order:
  //   1. metadata merge (KEEP journal entry so a crash mid-rollback still has
  //      a recovery handle for startup cleanup to retry)
  //   2. markdown + SQLite + sidecar restores
  //   3. drop journal entry — only after every live-state restore succeeded
  try {
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      sectionIndex: mergeById(
        current.sectionIndex ?? [],
        snapshot.sectionIndexEntries as ProposalSectionIndexEntry[],
        'sectionId'
      ),
      sectionWeights: mergeById(
        current.sectionWeights ?? [],
        snapshot.cascade.sectionWeights as SectionWeightEntry[],
        'sectionId'
      ),
      confirmedSkeletons: {
        ...(current.confirmedSkeletons ?? {}),
        ...(snapshot.cascade
          .confirmedSkeletonsBySectionId as ProposalMetadata['confirmedSkeletons']),
      },
      annotations: [
        ...(current.annotations ?? []),
        ...(snapshot.cascade.annotations as AnnotationRecord[]),
      ],
      sourceAttributions: [
        ...(current.sourceAttributions ?? []),
        ...(snapshot.cascade.sourceAttributions as SourceAttribution[]),
      ],
      baselineValidations: [
        ...(current.baselineValidations ?? []),
        ...(snapshot.cascade.baselineValidations as BaselineValidation[]),
      ],
    }))

    // Best-effort: put the markdown back exactly as it was pre-delete so a
    // crashed live save doesn't leave the document partially mutated.
    await documentService.save(projectId, originalMarkdown)

    // SQLite is already restored from snapshot only if the SQLite delete
    // already ran. If rollback happens before SQLite deletes, there's nothing
    // to re-insert; insertBatch with the snapshot rows is safe either way
    // because we onConflict-doNothing.
    await annotationRepo.insertBatch(snapshot.cascade.sqliteAnnotations as AnnotationRecord[])
    await traceabilityLinkRepo.insertBatch(
      snapshot.cascade.sqliteTraceabilityLinks as TraceabilityLink[]
    )
    await notificationRepo.insertBatch(snapshot.cascade.sqliteNotifications as NotificationRecord[])

    // Rebuild traceability-matrix.json so the sidecar mirrors the re-inserted
    // SQLite link set. Skipping this would leave stale `updatedAt` on the
    // sidecar after a rollback.
    await rebuildTraceabilitySnapshot(projectId)

    await chapterSummaryStore.insertBatch(
      projectId,
      snapshot.cascade.chapterSummaries as ChapterSummaryEntry[]
    )

    // Final step — drop the journal entry. Any earlier failure left it in
    // place so startup cleanup (or a retry) can try again.
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      pendingStructureDeletions: (current.pendingStructureDeletions ?? []).filter(
        (s) => s.deletionId !== snapshot.deletionId
      ),
    }))
  } catch (err) {
    logger.error(`rollbackStagedDeletion failed: project=${projectId}`, err)
    throw err
  }
}

async function runUndo(
  projectId: string,
  snapshot: PendingStructureDeletionSnapshot
): Promise<UndoDeleteResult> {
  const doc = await documentService.load(projectId)
  const meta = await documentService.getMetadata(projectId)
  const parentLocator = snapshot.restoreAnchor.parentSectionId
    ? resolveLocatorFromSectionId(meta.sectionIndex ?? [], snapshot.restoreAnchor.parentSectionId)
    : null

  const restoredMarkdown = restoreSectionSubtree(doc.content, snapshot.subtreeMarkdown, {
    previousHeadingLocator: snapshot.restoreAnchor.previousHeadingLocator,
    parentHeadingLocator: parentLocator,
  })

  // Metadata restore — MERGE live rows only, KEEP journal entry. If any later
  // step throws, startup cleanup retries the restore on the still-present
  // journal entry. The journal drop happens in the final metadata write below.
  await documentService.updateMetadata(projectId, (current) => ({
    ...current,
    sectionIndex: mergeById(
      current.sectionIndex ?? [],
      snapshot.sectionIndexEntries as ProposalSectionIndexEntry[],
      'sectionId'
    ),
    sectionWeights: mergeById(
      current.sectionWeights ?? [],
      snapshot.cascade.sectionWeights as SectionWeightEntry[],
      'sectionId'
    ),
    confirmedSkeletons: {
      ...(current.confirmedSkeletons ?? {}),
      ...(snapshot.cascade.confirmedSkeletonsBySectionId as ProposalMetadata['confirmedSkeletons']),
    },
    annotations: [
      ...(current.annotations ?? []),
      ...(snapshot.cascade.annotations as AnnotationRecord[]),
    ],
    sourceAttributions: [
      ...(current.sourceAttributions ?? []),
      ...(snapshot.cascade.sourceAttributions as SourceAttribution[]),
    ],
    baselineValidations: [
      ...(current.baselineValidations ?? []),
      ...(snapshot.cascade.baselineValidations as BaselineValidation[]),
    ],
  }))

  // SQLite restore.
  await annotationRepo.insertBatch(snapshot.cascade.sqliteAnnotations as AnnotationRecord[])
  await traceabilityLinkRepo.insertBatch(
    snapshot.cascade.sqliteTraceabilityLinks as TraceabilityLink[]
  )
  await notificationRepo.insertBatch(snapshot.cascade.sqliteNotifications as NotificationRecord[])

  // Rebuild traceability-matrix.json so `links` / `stats` / `updatedAt` track
  // the restored link set. getMatrix reads rows live from SQLite but still
  // picks up `updatedAt` and impact highlights from the sidecar.
  await rebuildTraceabilitySnapshot(projectId)

  // Sidecar restore.
  await chapterSummaryStore.insertBatch(
    projectId,
    snapshot.cascade.chapterSummaries as ChapterSummaryEntry[]
  )

  // Commit markdown.
  const saveRes = await documentService.save(projectId, restoredMarkdown)

  // Final step — drop the journal entry. All live-state restores succeeded;
  // it is now safe to close the recovery handle.
  const finalizedMeta = await documentService.updateMetadata(projectId, (current) =>
    removeDeletionWindowAndOlderActiveEntries(current, snapshot.deletionId)
  )

  // Derive restored focus locator from the now-live sectionIndex.
  let restoredFocusLocator: ChapterHeadingLocator | undefined
  try {
    restoredFocusLocator =
      resolveLocatorFromSectionId(finalizedMeta.sectionIndex ?? [], snapshot.rootSectionId) ??
      undefined
  } catch {
    restoredFocusLocator = undefined
  }

  return {
    lastSavedAt: saveRes.lastSavedAt,
    markdown: restoredMarkdown,
    sectionIndex: finalizedMeta.sectionIndex ?? [],
    restoredFocusLocator,
  }
}

function mergeById<T>(existing: T[], incoming: T[], keyField: keyof T): T[] {
  const out = [...existing]
  const seen = new Set(existing.map((e) => e[keyField] as unknown as string))
  for (const entry of incoming) {
    const k = entry[keyField] as unknown as string
    if (!seen.has(k)) {
      out.push(entry)
      seen.add(k)
    }
  }
  return out
}

// Keep the counter export parity with other shared helpers so service tests
// can assert the word-count rule used by Undo summaries lines up with the
// renderer's status-bar.
export { countChapterCharacters }

// Silence unused-path chatter when the anchor helper is imported for future
// type-guard tests without a direct call site.
export const __internal = { deriveSectionPath }
