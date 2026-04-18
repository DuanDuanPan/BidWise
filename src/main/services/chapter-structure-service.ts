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
import { buildChapterTree, deriveSectionPath } from '@shared/chapter-identity'
import type { ChapterTreeNode } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

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
}
