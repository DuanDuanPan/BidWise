/**
 * Chapter Structure Service (Story 11.1).
 *
 * Canonical read-side gateway into `proposal.meta.json.sectionIndex`.
 * Subsequent stories (11.2 focus state machine, 11.3 xmind-keymap cascade
 * delete, etc.) will expand this service with create/update/move/delete
 * mutations. For the 11.1 foundation, only read operations are exposed so
 * later stories can layer mutation semantics on a stable contract.
 */
import { documentService } from '@main/services/document-service'
import { NotFoundError, ValidationError } from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import { buildChapterTree, deriveSectionPath } from '@shared/chapter-identity'
import { extractMarkdownHeadings, findMarkdownHeading } from '@shared/chapter-markdown'
import type { ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const logger = createLogger('chapter-structure-service')

export const chapterStructureService = {
  /** Return the flat sectionIndex for a project (UUID `sectionId` canonical). */
  async list(projectId: string): Promise<ProposalSectionIndexEntry[]> {
    const meta = await documentService.getMetadata(projectId)
    return meta.sectionIndex ?? []
  },

  /** Return a single entry by UUID `sectionId` or `undefined`. */
  async get(projectId: string, sectionId: string): Promise<ProposalSectionIndexEntry | undefined> {
    const list = await this.list(projectId)
    return list.find((entry) => entry.sectionId === sectionId)
  },

  /** Materialized tree view of the sectionIndex. */
  async tree(projectId: string): Promise<ChapterTreeNode[]> {
    const list = await this.list(projectId)
    return buildChapterTree(list)
  },

  /** Derive display path (e.g. "2.1.3") for a sectionId; null when unknown. */
  async path(projectId: string, sectionId: string): Promise<string | null> {
    const list = await this.list(projectId)
    return deriveSectionPath(list, sectionId)
  },

  /**
   * Rename a single chapter in place (Story 11.2 AC2).
   *
   * Order: metadata FIRST, markdown SECOND. If markdown save fails, metadata
   * is rolled back to the pre-call snapshot so `proposal.md` heading lines
   * and `sectionIndex.headingLocator` never diverge permanently — divergence
   * would break `resolveSectionIdFromLocator` and every downstream lookup
   * that relies on it.
   *
   * Throws `ValidationError` for empty titles, `NotFoundError` when the
   * sectionId is unknown. Heading line may be missing in `proposal.md` for
   * skeleton-only projects — in that case sectionIndex update still applies
   * and the markdown is written when the heading later appears.
   */
  async updateTitle(
    projectId: string,
    sectionId: string,
    title: string
  ): Promise<ProposalSectionIndexEntry> {
    const trimmed = title.trim()
    if (!trimmed) {
      throw new ValidationError('章节标题不能为空')
    }

    const doc = await documentService.load(projectId)
    const meta = await documentService.getMetadata(projectId)
    const index = meta.sectionIndex ?? []
    const target = index.find((e) => e.sectionId === sectionId)
    if (!target) {
      throw new NotFoundError(`sectionId 不存在: ${sectionId}`)
    }

    // Compute next markdown in memory (no disk write yet).
    let nextMarkdown = doc.content
    if (doc.content.length > 0) {
      const headings = extractMarkdownHeadings(doc.content)
      const heading = findMarkdownHeading(headings, target.headingLocator)
      if (heading) {
        const lines = doc.content.split('\n')
        lines[heading.lineIndex] = '#'.repeat(target.level) + ' ' + trimmed
        nextMarkdown = lines.join('\n')
      }
    }
    const markdownChanged = nextMarkdown !== doc.content

    // Step 1: commit metadata under lock. If this throws, nothing on disk has
    // changed — the caller surfaces the error and the two files stay aligned.
    const updated = await documentService.updateMetadata(projectId, (current) => {
      const entries = current.sectionIndex ?? []
      const renamed = entries.map((entry) =>
        entry.sectionId === sectionId
          ? {
              ...entry,
              title: trimmed,
              headingLocator: { ...entry.headingLocator, title: trimmed },
            }
          : entry
      )
      const counts = new Map<string, number>()
      const recomputed = renamed.map((entry) => {
        const key = `${entry.level}:${entry.title}`
        const occurrenceIndex = counts.get(key) ?? 0
        counts.set(key, occurrenceIndex + 1)
        return {
          ...entry,
          occurrenceIndex,
          headingLocator: { ...entry.headingLocator, occurrenceIndex },
        }
      })
      return { ...current, sectionIndex: recomputed }
    })

    // Step 2: commit markdown. On failure, restore ONLY the chapter-structure
    // slice of metadata. Other services (annotations, source attribution,
    // writing style, confirmed skeletons) may have committed unrelated writes
    // after Step 1; rolling back the whole snapshot would erase them.
    if (markdownChanged) {
      try {
        await documentService.save(projectId, nextMarkdown)
      } catch (saveErr) {
        try {
          await documentService.updateMetadata(projectId, (current) => ({
            ...current,
            sectionIndex: meta.sectionIndex,
          }))
        } catch (rollbackErr) {
          logger.error(
            `updateTitle rollback failed: project=${projectId} sectionId=${sectionId} — metadata/markdown out of sync`,
            rollbackErr
          )
        }
        throw saveErr
      }
    }

    const nextEntry = (updated.sectionIndex ?? []).find((e) => e.sectionId === sectionId)
    if (!nextEntry) {
      throw new NotFoundError(`sectionId 重命名后丢失: ${sectionId}`)
    }
    return nextEntry
  },
}
