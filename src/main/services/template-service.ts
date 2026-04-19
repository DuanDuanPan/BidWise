import { join } from 'path'
import { app } from 'electron'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { documentService } from '@main/services/document-service'
import { scoringExtractor } from '@main/services/document-parser'
import type {
  TemplateSummary,
  ProposalTemplate,
  TemplateSection,
  GenerateSkeletonInput,
  GenerateSkeletonOutput,
  SkeletonSection,
  SectionWeightEntry,
  ProposalSectionIndexEntry,
} from '@shared/template-types'
import type { ScoringModel } from '@shared/analysis-types'
import { CHAPTER_IDENTITY_SCHEMA_LATEST } from '@shared/models/proposal'
import { isStableSectionId } from '@shared/chapter-identity'

const logger = createLogger('template-service')

interface TemplateFileData {
  id: string
  name: string
  description: string
  version: string
  sections: TemplateSection[]
}

interface WeightCandidate {
  label: string
  weightPercent: number
  criterionId: string
  criterionName: string
  subItemId?: string
  subItemName?: string
}

function getBuiltinTemplateDir(): string {
  return join(app.getAppPath(), 'resources', 'templates')
}

function resolveCompanyTemplateDir(): string | null {
  const candidates = [
    join(app.getAppPath(), 'company-data', 'templates', 'skeletons'),
    join(app.getPath('userData'), 'company-data', 'templates', 'skeletons'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return null
}

async function scanTemplateDir(
  dir: string,
  source: 'built-in' | 'company'
): Promise<Map<string, { summary: TemplateSummary; filePath: string }>> {
  const results = new Map<string, { summary: TemplateSummary; filePath: string }>()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return results
  }

  for (const file of files) {
    if (!file.endsWith('.template.json')) continue
    const filePath = join(dir, file)
    try {
      const raw = await readFile(filePath, 'utf-8')
      const data = JSON.parse(raw) as TemplateFileData
      const topLevelSections = data.sections.filter((s) => s.level === 1)
      results.set(data.id, {
        summary: {
          id: data.id,
          name: data.name,
          description: data.description,
          sectionCount: topLevelSections.length,
          source,
        },
        filePath,
      })
    } catch (err) {
      logger.warn(`模板文件解析失败: ${filePath}`, err)
    }
  }
  return results
}

async function loadTemplateFromFile(
  filePath: string,
  source: 'built-in' | 'company'
): Promise<ProposalTemplate> {
  const raw = await readFile(filePath, 'utf-8')
  const data = JSON.parse(raw) as TemplateFileData
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    version: data.version,
    sections: data.sections,
    source,
  }
}

function buildWeightCandidates(scoringModel: ScoringModel): WeightCandidate[] {
  const candidates: WeightCandidate[] = []
  for (const criterion of scoringModel.criteria) {
    // Criterion-level candidate
    candidates.push({
      label: criterion.category,
      weightPercent: Math.round(criterion.weight * 100),
      criterionId: criterion.id,
      criterionName: criterion.category,
    })
    // SubItem-level candidates
    for (const sub of criterion.subItems) {
      candidates.push({
        label: sub.name,
        weightPercent:
          scoringModel.totalScore > 0
            ? Math.round((sub.maxScore / scoringModel.totalScore) * 100)
            : 0,
        criterionId: criterion.id,
        criterionName: criterion.category,
        subItemId: sub.id,
        subItemName: sub.name,
      })
    }
  }
  return candidates
}

function extractBigrams(text: string): Set<string> {
  const tokens = new Set<string>()
  const cleaned = text.replace(/[\s\p{P}]/gu, '')
  for (let i = 0; i < cleaned.length - 1; i++) {
    tokens.add(cleaned.slice(i, i + 2))
  }
  return tokens
}

function matchWeight(sectionTitle: string, candidates: WeightCandidate[]): WeightCandidate | null {
  // Exact match
  for (const c of candidates) {
    if (c.label === sectionTitle) return c
  }
  // Contains match
  for (const c of candidates) {
    if (sectionTitle.includes(c.label) || c.label.includes(sectionTitle)) return c
  }
  // Token intersection using 2-grams to avoid false positives from common single characters
  const sectionTokens = extractBigrams(sectionTitle)
  if (sectionTokens.size === 0) return null
  for (const c of candidates) {
    const labelTokens = extractBigrams(c.label)
    if (labelTokens.size === 0) continue
    let overlap = 0
    for (const token of labelTokens) {
      if (sectionTokens.has(token)) overlap++
    }
    const minTokens = Math.min(sectionTokens.size, labelTokens.size)
    if (minTokens > 0 && overlap >= minTokens * 0.5 && overlap >= 2) {
      return c
    }
  }
  return null
}

function applyWeights(
  sections: TemplateSection[],
  scoringModel: ScoringModel | null
): SkeletonSection[] {
  const candidates = scoringModel ? buildWeightCandidates(scoringModel) : []

  function convertSection(section: TemplateSection): SkeletonSection {
    let weightPercent: number | undefined
    let isKeyFocus = false
    let scoringCriterionId: string | undefined
    let scoringCriterionName: string | undefined
    let scoringSubItemId: string | undefined
    let scoringSubItemName: string | undefined

    // Only match top-level sections (level 1) against scoring model
    if (section.level === 1 && candidates.length > 0) {
      const matched = matchWeight(section.title, candidates)
      if (matched) {
        weightPercent = matched.weightPercent
        isKeyFocus = weightPercent >= 15
        scoringCriterionId = matched.criterionId
        scoringCriterionName = matched.criterionName
        scoringSubItemId = matched.subItemId
        scoringSubItemName = matched.subItemName
      }
    }

    return {
      // Story 11.1: SkeletonSection.id is project-local UUID. Template
      // `s1.1`-style key is preserved separately for traceability.
      id: uuidv4(),
      templateSectionKey: section.id,
      title: section.title,
      level: section.level,
      guidanceText: section.guidanceText,
      weightPercent,
      isKeyFocus,
      scoringCriterionId,
      scoringCriterionName,
      scoringSubItemId,
      scoringSubItemName,
      children: section.children.map(convertSection),
    }
  }

  return sections.map(convertSection)
}

function sectionsToMarkdown(sections: SkeletonSection[]): string {
  const lines: string[] = []

  function renderSection(section: SkeletonSection): void {
    const hashes = '#'.repeat(section.level)
    lines.push(`${hashes} ${section.title}`)
    lines.push('')
    if (section.guidanceText) {
      lines.push(`> ${section.guidanceText}`)
      lines.push('')
    }
    for (const child of section.children) {
      renderSection(child)
    }
  }

  for (const section of sections) {
    renderSection(section)
  }

  return lines.join('\n')
}

function extractSectionWeights(sections: SkeletonSection[]): SectionWeightEntry[] {
  const weights: SectionWeightEntry[] = []

  function collect(section: SkeletonSection): void {
    if (section.weightPercent !== undefined) {
      // Story 11.1: sectionId here is the project-local UUID produced in
      // applyWeights(); templateSectionKey carries the template `s1.1` key.
      const entry: SectionWeightEntry = {
        sectionId: section.id,
        sectionTitle: section.title,
        weightPercent: section.weightPercent,
        isKeyFocus: section.isKeyFocus,
      }
      if (section.templateSectionKey !== undefined)
        entry.templateSectionKey = section.templateSectionKey
      if (section.scoringCriterionId !== undefined)
        entry.scoringCriterionId = section.scoringCriterionId
      if (section.scoringCriterionName !== undefined)
        entry.scoringCriterionName = section.scoringCriterionName
      if (section.scoringSubItemId !== undefined) entry.scoringSubItemId = section.scoringSubItemId
      if (section.scoringSubItemName !== undefined)
        entry.scoringSubItemName = section.scoringSubItemName
      weights.push(entry)
    }
    for (const child of section.children) {
      collect(child)
    }
  }

  for (const section of sections) {
    collect(section)
  }
  return weights
}

function extractSectionIndex(sections: SkeletonSection[]): ProposalSectionIndexEntry[] {
  const entries: ProposalSectionIndexEntry[] = []
  const titleOccurrences = new Map<string, number>()
  // Story 11.1 contract: `order` is sibling-local (0..N within each parent),
  // not a flat traversal index. Track per-parent counter so root + nested
  // siblings each restart at 0.
  const orderByParent = new Map<string | undefined, number>()

  function collect(section: SkeletonSection, parentSectionId?: string): void {
    // Defensive: if upstream handed us a non-UUID `id` we still must record it,
    // but log so migration/retro diagnostics surface the drift.
    if (!isStableSectionId(section.id)) {
      logger.warn(
        `extractSectionIndex: non-UUID sectionId detected (templateSectionKey=${section.templateSectionKey ?? 'none'}, title=${section.title})`
      )
    }
    const key = `${section.level}::${section.title}`
    const occ = titleOccurrences.get(key) ?? 0
    titleOccurrences.set(key, occ + 1)

    const siblingOrder = orderByParent.get(parentSectionId) ?? 0
    orderByParent.set(parentSectionId, siblingOrder + 1)

    entries.push({
      sectionId: section.id,
      templateSectionKey: section.templateSectionKey,
      title: section.title,
      level: section.level,
      parentSectionId,
      order: siblingOrder,
      occurrenceIndex: occ,
      headingLocator: {
        title: section.title,
        level: section.level,
        occurrenceIndex: occ,
      },
      weightPercent: section.weightPercent,
      isKeyFocus: section.isKeyFocus || undefined,
    })

    for (const child of section.children) {
      collect(child, section.id)
    }
  }

  for (const section of sections) {
    collect(section)
  }
  return entries
}

function countTopLevelSections(sections: SkeletonSection[]): number {
  return sections.filter((s) => s.level === 1).length
}

async function saveMetadata(
  projectId: string,
  sectionWeights: SectionWeightEntry[],
  sectionIndex: ProposalSectionIndexEntry[],
  templateId: string
): Promise<void> {
  await documentService.updateMetadata(projectId, (current) => ({
    ...current,
    sectionWeights,
    sectionIndex,
    templateId,
    // Story 11.1: newly materialized projects land on the latest schema and
    // skip the legacy → v2 migration path entirely.
    chapterIdentitySchemaVersion: CHAPTER_IDENTITY_SCHEMA_LATEST,
    lastSavedAt: new Date().toISOString(),
  }))
}

export const templateService = {
  async listTemplates(): Promise<TemplateSummary[]> {
    const builtinDir = getBuiltinTemplateDir()
    const companyDir = resolveCompanyTemplateDir()

    const builtinMap = await scanTemplateDir(builtinDir, 'built-in')
    const companyMap = companyDir ? await scanTemplateDir(companyDir, 'company') : new Map()

    // Company templates override built-in with same ID
    const merged = new Map(builtinMap)
    for (const [id, entry] of companyMap) {
      merged.set(id, entry)
    }

    return Array.from(merged.values()).map((e) => e.summary)
  },

  async getTemplate(templateId: string): Promise<ProposalTemplate> {
    // Check company templates first
    const companyDir = resolveCompanyTemplateDir()
    if (companyDir) {
      const companyMap = await scanTemplateDir(companyDir, 'company')
      const companyEntry = companyMap.get(templateId)
      if (companyEntry) {
        return loadTemplateFromFile(companyEntry.filePath, 'company')
      }
    }

    // Then check built-in
    const builtinDir = getBuiltinTemplateDir()
    const builtinMap = await scanTemplateDir(builtinDir, 'built-in')
    const builtinEntry = builtinMap.get(templateId)
    if (builtinEntry) {
      return loadTemplateFromFile(builtinEntry.filePath, 'built-in')
    }

    throw new BidWiseError(ErrorCode.TEMPLATE_NOT_FOUND, `模板不存在: ${templateId}`)
  },

  async generateSkeleton(input: GenerateSkeletonInput): Promise<GenerateSkeletonOutput> {
    const { projectId, templateId, overwriteExisting } = input

    // Load template
    const template = await templateService.getTemplate(templateId)

    // Check existing content — documentService.load() returns empty content
    // when proposal.md doesn't exist, so no special error handling needed.
    // DOCUMENT_NOT_FOUND only fires when project.rootPath is missing (a real error).
    const doc = await documentService.load(projectId)
    if (doc.content.trim() && !overwriteExisting) {
      throw new BidWiseError(
        ErrorCode.SKELETON_OVERWRITE_REQUIRED,
        '项目已有方案内容，需要确认覆盖'
      )
    }

    // Get scoring model (direct service call, not IPC)
    let scoringModel: ScoringModel | null = null
    try {
      scoringModel = await scoringExtractor.getScoringModel(projectId)
    } catch (err) {
      logger.warn(`评分模型加载失败，跳过权重匹配: ${projectId}`, err)
    }

    // Build skeleton with weights
    const skeleton = applyWeights(template.sections, scoringModel)
    const markdown = sectionsToMarkdown(skeleton)
    const sectionWeights = extractSectionWeights(skeleton)
    const sectionCount = countTopLevelSections(skeleton)

    // Persist proposal.md
    const { lastSavedAt } = await documentService.save(projectId, markdown)

    // Persist metadata with sectionWeights + sectionIndex + templateId
    const sectionIndex = extractSectionIndex(skeleton)
    await saveMetadata(projectId, sectionWeights, sectionIndex, templateId)

    logger.info(
      `骨架生成完成: project=${projectId}, template=${templateId}, sections=${sectionCount}`
    )

    return { skeleton, markdown, sectionWeights, sectionCount, lastSavedAt }
  },
}
