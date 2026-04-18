import type { SkeletonSection } from '@shared/template-types'
import type { StructureTreeNode } from '../components/StructureTreeView.types'

/**
 * Pure adapter between `SkeletonSection[]` (`SolutionDesignView` draft phase)
 * and the public `StructureTreeNode[]` contract. The public node shape only
 * carries the fields the tree view actually renders; every other SkeletonSection
 * field (guidanceText + scoring* traceability links) is stashed in a module-level
 * Map keyed by the STABLE `section.id` / `node.key`. That key survives the
 * `cloneTree({...n})` spread inside `draftMutations`, so round-trips through
 * add/rename/delete/drop stay lossless.
 *
 * Must preserve scoring* + guidanceText — `template-service.sectionsToMarkdown`
 * renders guidanceText as the `> guidance` block and `extractSectionWeights`
 * copies scoring* into `section_weights.json` for downstream traceability.
 */

interface Sidecar {
  guidanceText?: string
  scoringCriterionId?: string
  scoringCriterionName?: string
  scoringSubItemId?: string
  scoringSubItemName?: string
}

const sidecarByKey = new Map<string, Sidecar>()

function captureSidecar(section: SkeletonSection): void {
  const entry: Sidecar = {}
  if (section.guidanceText !== undefined) entry.guidanceText = section.guidanceText
  if (section.scoringCriterionId !== undefined)
    entry.scoringCriterionId = section.scoringCriterionId
  if (section.scoringCriterionName !== undefined)
    entry.scoringCriterionName = section.scoringCriterionName
  if (section.scoringSubItemId !== undefined) entry.scoringSubItemId = section.scoringSubItemId
  if (section.scoringSubItemName !== undefined)
    entry.scoringSubItemName = section.scoringSubItemName
  if (Object.keys(entry).length === 0) {
    sidecarByKey.delete(section.id)
    return
  }
  sidecarByKey.set(section.id, entry)
}

export function skeletonToTreeNodes(sections: SkeletonSection[]): StructureTreeNode[] {
  // Reset so stale entries from a previously-edited skeleton can't bleed into
  // the new draft (e.g. after `重新选择模板`).
  sidecarByKey.clear()
  return sections.map(convertSkeletonSection)
}

function convertSkeletonSection(section: SkeletonSection): StructureTreeNode {
  captureSidecar(section)
  return {
    key: section.id,
    title: section.title,
    level: section.level,
    isKeyFocus: section.isKeyFocus,
    weightPercent: section.weightPercent,
    templateSectionKey: section.templateSectionKey,
    children: section.children.map(convertSkeletonSection),
  }
}

export function treeNodesToSkeleton(nodes: StructureTreeNode[]): SkeletonSection[] {
  return nodes.map(convertTreeNode)
}

function convertTreeNode(node: StructureTreeNode): SkeletonSection {
  const sidecar = sidecarByKey.get(node.key)
  const section: SkeletonSection = {
    id: node.key,
    title: node.title,
    level: clampLevel(node.level),
    isKeyFocus: node.isKeyFocus ?? false,
    weightPercent: node.weightPercent,
    templateSectionKey: node.templateSectionKey,
    children: node.children.map(convertTreeNode),
  }
  if (sidecar?.guidanceText !== undefined) section.guidanceText = sidecar.guidanceText
  if (sidecar?.scoringCriterionId !== undefined)
    section.scoringCriterionId = sidecar.scoringCriterionId
  if (sidecar?.scoringCriterionName !== undefined)
    section.scoringCriterionName = sidecar.scoringCriterionName
  if (sidecar?.scoringSubItemId !== undefined) section.scoringSubItemId = sidecar.scoringSubItemId
  if (sidecar?.scoringSubItemName !== undefined)
    section.scoringSubItemName = sidecar.scoringSubItemName
  return section
}

function clampLevel(level: StructureTreeNode['level']): SkeletonSection['level'] {
  // SkeletonSection.level is 1..4; structure tree widens to 1..6 for Story 11.5.
  // Draft mode never exceeds 4 by construction — clamp defensively.
  return Math.max(1, Math.min(4, level)) as SkeletonSection['level']
}

/**
 * Count totals identical to the legacy `SkeletonEditor.countSections` helper.
 * Exposed here so the draft host can display the `N 章节 / N 重点章节` stat
 * without depending on private state inside the public component.
 */
export function countTreeNodes(nodes: StructureTreeNode[]): { total: number; keyFocus: number } {
  let total = 0
  let keyFocus = 0
  const walk = (tree: StructureTreeNode[]): void => {
    for (const node of tree) {
      total += 1
      if (node.isKeyFocus) keyFocus += 1
      walk(node.children)
    }
  }
  walk(nodes)
  return { total, keyFocus }
}

/**
 * Draft-mode key generator mirroring the legacy `SkeletonEditor.generateSectionId`
 * pattern so existing test fixtures that assert on `new-${timestamp}-${counter}`
 * continue to match after the migration.
 */
let draftKeyCounter = 0
export function generateDraftKey(now: () => number = () => Date.now()): string {
  draftKeyCounter += 1
  return `new-${now()}-${draftKeyCounter}`
}

/** Test-only reset so fixtures can force deterministic counters between runs. */
export function __resetDraftKeyCounter(): void {
  draftKeyCounter = 0
}
