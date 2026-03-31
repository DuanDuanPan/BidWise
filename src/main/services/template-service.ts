import { join } from 'path'
import { app } from 'electron'
import { readFile, readdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
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
  PersistSkeletonInput,
  PersistSkeletonOutput,
  SkeletonSection,
  SectionWeightEntry,
} from '@shared/template-types'
import type { ScoringModel } from '@shared/analysis-types'
import { projectService } from '@main/services/project-service'

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
      id: section.id,
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
      weights.push({
        sectionId: section.id,
        sectionTitle: section.title,
        weightPercent: section.weightPercent,
        isKeyFocus: section.isKeyFocus,
        scoringCriterionId: section.scoringCriterionId,
        scoringCriterionName: section.scoringCriterionName,
        scoringSubItemId: section.scoringSubItemId,
        scoringSubItemName: section.scoringSubItemName,
      })
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

function countTopLevelSections(sections: SkeletonSection[]): number {
  return sections.filter((s) => s.level === 1).length
}

async function saveMetadata(
  projectId: string,
  sectionWeights: SectionWeightEntry[],
  templateId: string
): Promise<void> {
  const project = await projectService.get(projectId)
  if (!project.rootPath) return

  const metaPath = join(project.rootPath, 'proposal.meta.json')
  let existing: Record<string, unknown> = {}
  try {
    const raw = await readFile(metaPath, 'utf-8')
    existing = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // File may not exist yet
  }

  const meta = {
    ...existing,
    version: (existing.version as string) || '1.0',
    projectId,
    sectionWeights,
    templateId,
    lastSavedAt: new Date().toISOString(),
  }

  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
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

    // Check existing content
    try {
      const doc = await documentService.load(projectId)
      if (doc.content.trim() && !overwriteExisting) {
        throw new BidWiseError(
          ErrorCode.SKELETON_OVERWRITE_REQUIRED,
          '项目已有方案内容，需要确认覆盖'
        )
      }
    } catch (err) {
      if (err instanceof BidWiseError) {
        // DOCUMENT_NOT_FOUND is OK — means empty, proceed with generation
        if (err.code === ErrorCode.DOCUMENT_NOT_FOUND) {
          // fall through
        } else {
          throw err
        }
      } else {
        throw err
      }
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

    // Persist metadata with sectionWeights + templateId
    await saveMetadata(projectId, sectionWeights, templateId)

    logger.info(
      `骨架生成完成: project=${projectId}, template=${templateId}, sections=${sectionCount}`
    )

    return { skeleton, markdown, sectionWeights, sectionCount, lastSavedAt }
  },

  async persistSkeleton(input: PersistSkeletonInput): Promise<PersistSkeletonOutput> {
    const { projectId, templateId, skeleton } = input

    const markdown = sectionsToMarkdown(skeleton)
    const sectionWeights = extractSectionWeights(skeleton)
    const sectionCount = countTopLevelSections(skeleton)

    // Persist proposal.md
    const { lastSavedAt } = await documentService.save(projectId, markdown)

    // Persist metadata
    await saveMetadata(projectId, sectionWeights, templateId)

    return { markdown, sectionWeights, sectionCount, lastSavedAt }
  },
}
