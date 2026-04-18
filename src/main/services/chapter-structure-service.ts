/**
 * Chapter Structure Service (Story 11.1).
 *
 * Canonical read-side gateway into `proposal.meta.json.sectionIndex`.
 * Subsequent stories (11.2 focus state machine, 11.3 xmind-keymap cascade
 * delete, etc.) will expand this service with create/update/move/delete
 * mutations. For the 11.1 foundation, only read operations are exposed so
 * later stories can layer mutation semantics on a stable contract.
 */
import { randomUUID } from 'crypto'
import { documentService } from '@main/services/document-service'
import { BidWiseError, NotFoundError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { createLogger } from '@main/utils/logger'
import {
  buildChapterTree,
  deriveSectionPath,
  normalizeSiblingOrder,
} from '@shared/chapter-identity'
import {
  DEFAULT_NEW_SECTION_TITLE,
  extractMarkdownHeadings,
  findMarkdownHeading,
  indentSectionSubtree,
  insertChildAtEnd,
  insertSiblingAfterSection,
  moveSubtreeInMarkdown,
  outdentSectionSubtree,
  type MoveSubtreePlacement,
} from '@shared/chapter-markdown'
import type { ChapterHeadingLocator, ChapterTreeNode } from '@shared/chapter-types'
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
  ): Promise<StructureMutationSnapshot> {
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
    return {
      markdown: nextMarkdown,
      sectionIndex: updated.sectionIndex ?? [],
      affectedSectionId: sectionId,
      focusLocator: nextEntry.headingLocator,
    }
  },

  /**
   * Insert a new sibling after the target section's subtree (Story 11.3).
   * Default title is `新章节`. Returns a snapshot with the committed markdown,
   * updated sectionIndex, and the new entry's sectionId.
   */
  async insertSibling(
    projectId: string,
    sectionId: string,
    title: string = DEFAULT_NEW_SECTION_TITLE
  ): Promise<StructureMutationSnapshot> {
    const trimmed = title.trim() || DEFAULT_NEW_SECTION_TITLE
    return applyStructureMutation(projectId, sectionId, 'insertSibling', {
      markdownFn: (markdown, locator) => {
        const outcome = insertSiblingAfterSection(markdown, locator, trimmed)
        if (!outcome.ok) throw new NotFoundError(`sectionId 不在 markdown 中: ${sectionId}`)
        return outcome.result
      },
      treeFn: (tree, target) => {
        const parentId = target.parentSectionId
        const newId = randomUUID()
        const newNode: ChapterTreeNode = {
          sectionId: newId,
          parentSectionId: parentId,
          order: target.order + 1,
          title: trimmed,
          level: target.level,
          occurrenceIndex: 0,
          headingLocator: {
            title: trimmed,
            level: target.level,
            occurrenceIndex: 0,
          },
          children: [],
        }
        const siblings = findSiblingContainer(tree, parentId)
        const idx = siblings.findIndex((n) => n.sectionId === target.sectionId)
        siblings.splice(idx + 1, 0, newNode)
        return { createdSectionId: newId, affectedSectionId: newId }
      },
    })
  },

  /** Indent target subtree under the previous sibling (Story 11.3 AC1 Tab). */
  async indent(projectId: string, sectionId: string): Promise<StructureMutationSnapshot> {
    return applyStructureMutation(projectId, sectionId, 'indent', {
      markdownFn: (markdown, locator) => {
        const outcome = indentSectionSubtree(markdown, locator)
        if (!outcome.ok) {
          throw new StructureBoundaryError(
            outcome.reason === 'no-previous-sibling'
              ? '没有前一个同级兄弟'
              : outcome.reason === 'max-depth'
                ? '子树深度超过最大限制 (H4)'
                : '无法缩进',
            outcome.reason
          )
        }
        return outcome.result
      },
      treeFn: (tree, target) => {
        const siblings = findSiblingContainer(tree, target.parentSectionId)
        const idx = siblings.findIndex((n) => n.sectionId === target.sectionId)
        if (idx <= 0) throw new StructureBoundaryError('没有前一个同级兄弟', 'no-previous-sibling')
        const [node] = siblings.splice(idx, 1)
        const newParent = siblings[idx - 1]
        // Shift level for node + descendants.
        shiftNodeLevels(node, 1)
        node.parentSectionId = newParent.sectionId
        node.order = newParent.children.length
        newParent.children.push(node)
        return { affectedSectionId: node.sectionId }
      },
    })
  },

  /**
   * Insert a new H(n+1) section as the LAST child of parent (Story 11.9).
   * Default title is `新章节`. Rejects `STRUCTURE_BOUNDARY` when parent is at H4.
   */
  async insertChild(
    projectId: string,
    parentSectionId: string,
    title: string = DEFAULT_NEW_SECTION_TITLE
  ): Promise<StructureMutationSnapshot> {
    const trimmed = title.trim() || DEFAULT_NEW_SECTION_TITLE
    return applyStructureMutation(projectId, parentSectionId, 'insertChild', {
      markdownFn: (markdown, locator) => {
        const outcome = insertChildAtEnd(markdown, locator, trimmed)
        if (!outcome.ok) {
          if (outcome.reason === 'max-depth') {
            throw new StructureBoundaryError('子节点深度超过最大限制 (H4)', 'max-depth')
          }
          throw new NotFoundError(`parentSectionId 不在 markdown 中: ${parentSectionId}`)
        }
        return outcome.result
      },
      treeFn: (tree, parent) => {
        const newId = randomUUID()
        const newLevel = (parent.level + 1) as ChapterHeadingLocator['level']
        const newNode: ChapterTreeNode = {
          sectionId: newId,
          parentSectionId: parent.sectionId,
          order: 0, // recomputed via normalizeSiblingOrder in rebuildSectionIndex
          title: trimmed,
          level: newLevel,
          occurrenceIndex: 0,
          headingLocator: {
            title: trimmed,
            level: newLevel,
            occurrenceIndex: 0,
          },
          children: [],
        }
        const parentNode = findNodeById(tree, parent.sectionId)
        if (!parentNode) throw new NotFoundError('父节点丢失')
        newNode.order = parentNode.children.length
        parentNode.children.push(newNode)
        return { createdSectionId: newId, affectedSectionId: newId }
      },
    })
  },

  /**
   * Move a section + descendants to a new position relative to `dropSectionId`
   * (Story 11.9). Mirrors AntD Tree DnD semantics: placement='before' | 'after'
   * splices as sibling, 'inside' nests as last child with level+1.
   */
  async moveSubtree(
    projectId: string,
    dragSectionId: string,
    dropSectionId: string,
    placement: MoveSubtreePlacement
  ): Promise<StructureMutationSnapshot> {
    if (dragSectionId === dropSectionId) {
      throw new StructureBoundaryError('不能移动到自身', 'not-found')
    }
    const doc = await documentService.load(projectId)
    const meta = await documentService.getMetadata(projectId)
    const originalIndex = meta.sectionIndex ?? []
    const dragTarget = originalIndex.find((e) => e.sectionId === dragSectionId)
    if (!dragTarget) throw new NotFoundError(`sectionId 不存在: ${dragSectionId}`)
    const dropTarget = originalIndex.find((e) => e.sectionId === dropSectionId)
    if (!dropTarget) throw new NotFoundError(`sectionId 不存在: ${dropSectionId}`)

    // Step 1 — markdown mutation.
    const mdOutcome = moveSubtreeInMarkdown(
      doc.content,
      dragTarget.headingLocator,
      dropTarget.headingLocator,
      placement
    )
    if (!mdOutcome.ok) {
      if (mdOutcome.reason === 'cycle') {
        throw new StructureBoundaryError('不能移动到自身的后代节点', 'not-found')
      }
      if (mdOutcome.reason === 'max-depth') {
        throw new StructureBoundaryError('子树深度超过最大限制 (H4)', 'max-depth')
      }
      if (mdOutcome.reason === 'min-depth') {
        throw new StructureBoundaryError('子树深度越界', 'min-depth')
      }
      if (mdOutcome.reason === 'same-position') {
        throw new StructureBoundaryError('节点已在目标位置', 'not-found')
      }
      throw new NotFoundError(`sectionId 不在 markdown 中`)
    }
    const nextMarkdown = mdOutcome.result.markdown

    // Step 2 — tree mutation (mirrors markdown so rebuildSectionIndex aligns).
    const tree = buildChapterTree(originalIndex)
    const dragNode = findNodeById(tree, dragSectionId)
    if (!dragNode) throw new NotFoundError('拖拽节点丢失')
    const dropNode = findNodeById(tree, dropSectionId)
    if (!dropNode) throw new NotFoundError('目标节点丢失')
    if (isDescendantOf(dragNode, dropSectionId)) {
      throw new StructureBoundaryError('不能移动到自身的后代节点', 'not-found')
    }
    const dragSiblings = findSiblingContainer(tree, dragNode.parentSectionId ?? undefined)
    const dragIdx = dragSiblings.findIndex((n) => n.sectionId === dragNode.sectionId)
    if (dragIdx < 0) throw new NotFoundError('拖拽节点未在父容器中')
    dragSiblings.splice(dragIdx, 1)

    if (placement === 'inside') {
      const newLevel = (dropNode.level + 1) as ChapterHeadingLocator['level']
      shiftNodeLevels(dragNode, newLevel - dragNode.level)
      dragNode.parentSectionId = dropNode.sectionId
      dragNode.order = dropNode.children.length
      dropNode.children.push(dragNode)
    } else {
      const dropSiblings = findSiblingContainer(tree, dropNode.parentSectionId ?? undefined)
      const dropIdx = dropSiblings.findIndex((n) => n.sectionId === dropNode.sectionId)
      if (dropIdx < 0) throw new NotFoundError('目标节点未在父容器中')
      shiftNodeLevels(dragNode, dropNode.level - dragNode.level)
      dragNode.parentSectionId = dropNode.parentSectionId
      const insertIdx = placement === 'before' ? dropIdx : dropIdx + 1
      dropSiblings.splice(insertIdx, 0, dragNode)
    }

    // Step 3 — rebuild sectionIndex.
    const nextIndex = rebuildSectionIndex(nextMarkdown, tree, originalIndex)

    // Step 4 — commit metadata then markdown; rollback on failure.
    const previousSectionIndex = originalIndex
    const updatedMeta = await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      sectionIndex: nextIndex,
    }))
    try {
      await documentService.save(projectId, nextMarkdown)
    } catch (saveErr) {
      try {
        await documentService.updateMetadata(projectId, (current) => ({
          ...current,
          sectionIndex: previousSectionIndex,
        }))
      } catch (rollbackErr) {
        logger.error(
          `moveSubtree rollback failed: project=${projectId} drag=${dragSectionId} drop=${dropSectionId}`,
          rollbackErr
        )
      }
      throw saveErr
    }

    const committedIndex = updatedMeta.sectionIndex ?? []
    const affected = committedIndex.find((e) => e.sectionId === dragSectionId)
    if (!affected) {
      throw new NotFoundError(`moveSubtree 后 sectionId 丢失: ${dragSectionId}`)
    }
    return {
      markdown: nextMarkdown,
      sectionIndex: committedIndex,
      affectedSectionId: dragSectionId,
      focusLocator: affected.headingLocator,
    }
  },

  /** Outdent target subtree to its grandparent (Story 11.3 AC1 Shift+Tab). */
  async outdent(projectId: string, sectionId: string): Promise<StructureMutationSnapshot> {
    return applyStructureMutation(projectId, sectionId, 'outdent', {
      markdownFn: (markdown, locator) => {
        const outcome = outdentSectionSubtree(markdown, locator)
        if (!outcome.ok) {
          throw new StructureBoundaryError(
            outcome.reason === 'already-top-level'
              ? '已经是顶层节点'
              : outcome.reason === 'max-depth' || outcome.reason === 'min-depth'
                ? '子树深度越界'
                : '无法反缩进',
            outcome.reason
          )
        }
        return outcome.result
      },
      treeFn: (tree, target) => {
        if (!target.parentSectionId) {
          throw new StructureBoundaryError('已经是顶层节点', 'already-top-level')
        }
        const parentNode = findNodeById(tree, target.parentSectionId)
        if (!parentNode) throw new NotFoundError('父节点丢失')
        // Container that holds `parentNode` itself as a sibling — i.e. the
        // grandparent's children (or tree roots when no grandparent exists).
        const grandContainer = findSiblingContainer(tree, parentNode.parentSectionId)
        const parentIdx = grandContainer.findIndex((n) => n.sectionId === parentNode.sectionId)
        if (parentIdx < 0) throw new NotFoundError('父节点丢失')

        // Remove target from current parent.
        const targetIdx = parentNode.children.findIndex((n) => n.sectionId === target.sectionId)
        const [node] = parentNode.children.splice(targetIdx, 1)
        shiftNodeLevels(node, -1)
        node.parentSectionId = parentNode.parentSectionId
        // Insert right after former parent.
        grandContainer.splice(parentIdx + 1, 0, node)
        return { affectedSectionId: node.sectionId }
      },
    })
  },
}

// ─── Story 11.3 mutation internals ──────────────────────────────────────────

export interface StructureMutationSnapshot {
  markdown: string
  sectionIndex: ProposalSectionIndexEntry[]
  affectedSectionId: string
  focusLocator: ChapterHeadingLocator
  createdSectionId?: string
}

export class StructureBoundaryError extends BidWiseError {
  constructor(
    message: string,
    public readonly reason:
      | 'no-previous-sibling'
      | 'already-top-level'
      | 'max-depth'
      | 'min-depth'
      | 'not-found'
  ) {
    super(ErrorCode.STRUCTURE_BOUNDARY, message)
    this.name = 'StructureBoundaryError'
  }
}

interface MutationHandlers {
  markdownFn: (
    markdown: string,
    locator: ChapterHeadingLocator
  ) => {
    markdown: string
    affectedLineIndex: number
    affectedLevel: ChapterHeadingLocator['level']
  }
  treeFn: (
    tree: ChapterTreeNode[],
    target: ProposalSectionIndexEntry
  ) => { affectedSectionId: string; createdSectionId?: string }
}

async function applyStructureMutation(
  projectId: string,
  sectionId: string,
  opLabel: 'insertSibling' | 'insertChild' | 'indent' | 'outdent',
  handlers: MutationHandlers
): Promise<StructureMutationSnapshot> {
  const doc = await documentService.load(projectId)
  const meta = await documentService.getMetadata(projectId)
  const originalIndex = meta.sectionIndex ?? []
  const target = originalIndex.find((e) => e.sectionId === sectionId)
  if (!target) {
    throw new NotFoundError(`sectionId 不存在: ${sectionId}`)
  }

  // Step 1 — compute next markdown in memory.
  const mdResult = handlers.markdownFn(doc.content, target.headingLocator)
  const nextMarkdown = mdResult.markdown

  // Step 2 — mutate tree in memory.
  const tree = buildChapterTree(originalIndex)
  const treeResult = handlers.treeFn(tree, target)

  // Step 3 — re-derive flat sectionIndex from (mutatedTree + newMarkdown).
  const nextIndex = rebuildSectionIndex(nextMarkdown, tree, originalIndex)

  // Step 4 — commit metadata first, then markdown. Roll back on markdown failure.
  const previousSectionIndex = originalIndex
  const updatedMeta = await documentService.updateMetadata(projectId, (current) => ({
    ...current,
    sectionIndex: nextIndex,
  }))

  try {
    await documentService.save(projectId, nextMarkdown)
  } catch (saveErr) {
    try {
      await documentService.updateMetadata(projectId, (current) => ({
        ...current,
        sectionIndex: previousSectionIndex,
      }))
    } catch (rollbackErr) {
      logger.error(
        `${opLabel} rollback failed: project=${projectId} sectionId=${sectionId} — metadata/markdown out of sync`,
        rollbackErr
      )
    }
    throw saveErr
  }

  const committedIndex = updatedMeta.sectionIndex ?? []
  const affected = committedIndex.find((e) => e.sectionId === treeResult.affectedSectionId)
  if (!affected) {
    throw new NotFoundError(`${opLabel} 后 sectionId 丢失: ${treeResult.affectedSectionId}`)
  }
  return {
    markdown: nextMarkdown,
    sectionIndex: committedIndex,
    affectedSectionId: treeResult.affectedSectionId,
    focusLocator: affected.headingLocator,
    createdSectionId: treeResult.createdSectionId,
  }
}

function findSiblingContainer(
  tree: ChapterTreeNode[],
  parentSectionId: string | undefined
): ChapterTreeNode[] {
  if (!parentSectionId) return tree
  const stack = [...tree]
  while (stack.length > 0) {
    const n = stack.shift()!
    if (n.sectionId === parentSectionId) return n.children
    stack.push(...n.children)
  }
  throw new NotFoundError(`父节点不存在: ${parentSectionId}`)
}

function isDescendantOf(dragNode: ChapterTreeNode, dropSectionId: string): boolean {
  const stack: ChapterTreeNode[] = [...dragNode.children]
  while (stack.length > 0) {
    const n = stack.pop()!
    if (n.sectionId === dropSectionId) return true
    stack.push(...n.children)
  }
  return false
}

function findNodeById(tree: ChapterTreeNode[], sectionId: string): ChapterTreeNode | null {
  const stack = [...tree]
  while (stack.length > 0) {
    const n = stack.shift()!
    if (n.sectionId === sectionId) return n
    stack.push(...n.children)
  }
  return null
}

function shiftNodeLevels(node: ChapterTreeNode, delta: number): void {
  const stack: ChapterTreeNode[] = [node]
  while (stack.length > 0) {
    const n = stack.pop()!
    const nextLevel = (n.level + delta) as ChapterHeadingLocator['level']
    n.level = nextLevel
    n.headingLocator = { ...n.headingLocator, level: nextLevel }
    stack.push(...n.children)
  }
}

/**
 * Re-derive a flat `sectionIndex` from (mutatedTree + postMutationMarkdown).
 *
 * Strategy: a pre-order walk of the tree produces nodes in the same order the
 * markdown headings appear, so we can pair them by position and recompute
 * `occurrenceIndex` from the live markdown. Raw title fields on the tree nodes
 * win when they already exist (respect `updateTitle` edits); otherwise we fall
 * back to the parsed heading title.
 */
function rebuildSectionIndex(
  nextMarkdown: string,
  tree: ChapterTreeNode[],
  original: ReadonlyArray<ProposalSectionIndexEntry>
): ProposalSectionIndexEntry[] {
  const headings = extractMarkdownHeadings(nextMarkdown)
  const preorder: ChapterTreeNode[] = []
  const walk = (nodes: ChapterTreeNode[]): void => {
    for (const n of nodes) {
      preorder.push(n)
      walk(n.children)
    }
  }
  walk(tree)

  if (preorder.length !== headings.length) {
    throw new Error(
      `structure mutation: heading count mismatch tree=${preorder.length} markdown=${headings.length}`
    )
  }

  const byId = new Map(original.map((e) => [e.sectionId, e]))
  const flat: ProposalSectionIndexEntry[] = []
  const emit = (nodes: ChapterTreeNode[], parentSectionId: string | undefined): void => {
    nodes.forEach((node, order) => {
      const preorderIndex = preorder.indexOf(node)
      const h = headings[preorderIndex]
      const previous = byId.get(node.sectionId)
      const title = previous?.title ?? node.title ?? h.title
      flat.push({
        sectionId: node.sectionId,
        templateSectionKey: previous?.templateSectionKey ?? node.templateSectionKey,
        title,
        level: h.level,
        parentSectionId,
        order,
        occurrenceIndex: h.occurrenceIndex,
        headingLocator: {
          title: h.title,
          level: h.level,
          occurrenceIndex: h.occurrenceIndex,
        },
        weightPercent: previous?.weightPercent,
        isKeyFocus: previous?.isKeyFocus,
      })
      emit(node.children, node.sectionId)
    })
  }
  emit(tree, undefined)
  return normalizeSiblingOrder(flat)
}
