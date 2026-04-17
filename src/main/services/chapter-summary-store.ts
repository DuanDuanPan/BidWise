/**
 * Chapter summary sidecar store (Story 3.12).
 *
 * Persists per-chapter LLM-generated summaries to
 *   `${resolveProjectDataPath(projectId)}/chapter-summaries.json`
 *
 * Identity key:    headingKey = createChapterLocatorKey(locator)
 *                  + occurrenceIndex (preserved for duplicate-title scenarios)
 * Hash invariant:  lineHash    = createContentDigest(directBody) — written by the
 *                  post-processor against the same direct body the read-side
 *                  uses, so write-time and read-time digests agree.
 *
 * Concurrency: writes go through a per-project chained promise so that
 * parallel sub-chapter completions cannot interleave a partial JSON write.
 */
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { createLogger } from '@main/utils/logger'
import {
  CHAPTER_SUMMARY_SIDECAR_VERSION,
  type ChapterSummaryEntry,
  type ChapterSummarySidecar,
} from '@shared/chapter-summary-types'

const logger = createLogger('chapter-summary-store')
const SIDECAR_FILENAME = 'chapter-summaries.json'

function emptySidecar(): ChapterSummarySidecar {
  return { version: CHAPTER_SUMMARY_SIDECAR_VERSION, entries: [] }
}

function sidecarPathFor(projectId: string): string {
  return join(resolveProjectDataPath(projectId), SIDECAR_FILENAME)
}

function entryMatchesKey(
  entry: ChapterSummaryEntry,
  headingKey: string,
  occurrenceIndex: number
): boolean {
  return entry.headingKey === headingKey && entry.occurrenceIndex === occurrenceIndex
}

class ChapterSummaryStore {
  private writeChain = new Map<string, Promise<void>>()

  async read(projectId: string): Promise<ChapterSummarySidecar> {
    const path = sidecarPathFor(projectId)
    let raw: string
    try {
      raw = await readFile(path, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptySidecar()
      }
      // Chapter summary cache is best-effort; a read failure must not block
      // chapter generation. Log and return an empty sidecar.
      logger.warn(`chapter-summary sidecar read failed for ${projectId}: ${(err as Error).message}`)
      return emptySidecar()
    }
    try {
      const parsed = JSON.parse(raw) as Partial<ChapterSummarySidecar>
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray(parsed.entries) &&
        parsed.version === CHAPTER_SUMMARY_SIDECAR_VERSION
      ) {
        return { version: CHAPTER_SUMMARY_SIDECAR_VERSION, entries: parsed.entries }
      }
      logger.warn(
        `Sidecar at ${path} has unexpected shape (version=${parsed?.version ?? 'missing'}); resetting in-memory copy`
      )
      return emptySidecar()
    } catch (err) {
      logger.warn(
        `Sidecar at ${path} is not valid JSON; treating as empty (${(err as Error).message})`
      )
      return emptySidecar()
    }
  }

  /** Read all entries for a project. */
  async list(projectId: string): Promise<ChapterSummaryEntry[]> {
    const sidecar = await this.read(projectId)
    return sidecar.entries
  }

  /**
   * Insert / overwrite a single entry, identified by (headingKey, occurrenceIndex).
   * Serialised per project to avoid lost-update races between concurrent batch
   * sub-chapter completions.
   */
  async upsert(projectId: string, entry: ChapterSummaryEntry): Promise<void> {
    await this.runSerialized(projectId, async () => {
      const sidecar = await this.read(projectId)
      const next = sidecar.entries.filter(
        (existing) => !entryMatchesKey(existing, entry.headingKey, entry.occurrenceIndex)
      )
      next.push(entry)
      await this.writeAtomic(projectId, { version: CHAPTER_SUMMARY_SIDECAR_VERSION, entries: next })
    })
  }

  /**
   * Drop sidecar entries that no longer match a heading in the current document.
   * Identity is `(headingKey, occurrenceIndex)`.
   */
  async pruneMissing(
    projectId: string,
    presentKeys: ReadonlySet<string>
  ): Promise<{ removed: number }> {
    let removedCount = 0
    await this.runSerialized(projectId, async () => {
      const sidecar = await this.read(projectId)
      const next = sidecar.entries.filter((entry) =>
        presentKeys.has(`${entry.headingKey}#${entry.occurrenceIndex}`)
      )
      removedCount = sidecar.entries.length - next.length
      if (removedCount > 0) {
        await this.writeAtomic(projectId, {
          version: CHAPTER_SUMMARY_SIDECAR_VERSION,
          entries: next,
        })
      }
    })
    return { removed: removedCount }
  }

  /** For tests: drop the in-memory write chain. */
  resetForTests(): void {
    this.writeChain.clear()
  }

  private async runSerialized<T>(projectId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.writeChain.get(projectId) ?? Promise.resolve()
    const current = previous.then(work, work)
    const trackable = current.then(
      () => undefined,
      () => undefined
    )
    this.writeChain.set(projectId, trackable)
    try {
      return await current
    } finally {
      if (this.writeChain.get(projectId) === trackable) {
        this.writeChain.delete(projectId)
      }
    }
  }

  private async writeAtomic(projectId: string, sidecar: ChapterSummarySidecar): Promise<void> {
    const path = sidecarPathFor(projectId)
    await mkdir(dirname(path), { recursive: true })
    const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmpPath, JSON.stringify(sidecar, null, 2), 'utf-8')
    await rename(tmpPath, path)
  }
}

export const chapterSummaryStore = new ChapterSummaryStore()
export type { ChapterSummaryStore }
