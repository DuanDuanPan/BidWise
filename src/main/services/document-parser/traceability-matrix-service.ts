import { createHash } from 'node:crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { throwIfAborted } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { TraceabilityLinkRepository } from '@main/db/repositories/traceability-link-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import { extractMarkdownHeadings } from '@shared/chapter-markdown'
import type {
  TraceabilityLink,
  TraceabilityMatrix,
  TraceabilityMatrixRow,
  TraceabilityMatrixColumn,
  TraceabilityMatrixCell,
  TraceabilityStats,
  CoverageStatus,
  GenerateMatrixResult,
  ImportAddendumResult,
  RequirementItem,
  RequirementCategory,
} from '@shared/analysis-types'
import type { ProposalMetadata } from '@shared/models/proposal'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const logger = createLogger('traceability-matrix-service')

const POLL_INTERVAL_MS = 1_000
const GENERATION_TIMEOUT_MS = 5 * 60 * 1_000
const SNAPSHOT_FILE = 'traceability-matrix.json'

interface TraceabilitySnapshot {
  projectId: string
  links: TraceabilityLink[]
  stats: TraceabilityStats
  generatedAt: string
  updatedAt: string
  recentlyImpactedSectionIds: string[]
  recentlyAddedRequirementIds: string[]
}

interface RawMapping {
  requirementId?: string
  sectionMappings?: Array<{
    sectionId?: string
    coverageStatus?: string
    confidence?: number
    reason?: string
  }>
}

/** Extract JSON from a string that may be wrapped in markdown code fences or contain prose */
function extractJsonFromResponse(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  return text.trim()
}

function parseMappingResponse(content: string): RawMapping[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.MATRIX_GENERATION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  if (Array.isArray(parsed)) {
    return parsed as RawMapping[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of ['mappings', 'traceability', 'results', 'items', 'links']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawMapping[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.MATRIX_GENERATION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

function buildAutoLinks(
  projectId: string,
  requirements: RequirementItem[],
  sections: ProposalSectionIndexEntry[],
  mappings: RawMapping[],
  generatedAt: string
): TraceabilityLink[] {
  const validRequirementIds = new Set(requirements.map((requirement) => requirement.id))
  const validSectionIds = new Set(sections.map((section) => section.sectionId))
  const sectionTitleMap = new Map(sections.map((section) => [section.sectionId, section.title]))
  const autoLinks: TraceabilityLink[] = []

  for (const mapping of mappings) {
    if (!mapping.requirementId || !validRequirementIds.has(mapping.requirementId)) continue
    if (!Array.isArray(mapping.sectionMappings)) continue

    for (const sectionMapping of mapping.sectionMappings) {
      if (!sectionMapping.sectionId || !validSectionIds.has(sectionMapping.sectionId)) continue
      const coverageStatus = sectionMapping.coverageStatus as CoverageStatus
      if (!['covered', 'partial', 'uncovered'].includes(coverageStatus)) continue

      autoLinks.push({
        id: uuidv4(),
        projectId,
        requirementId: mapping.requirementId,
        sectionId: sectionMapping.sectionId,
        sectionTitle: sectionTitleMap.get(sectionMapping.sectionId) ?? '',
        coverageStatus,
        confidence:
          typeof sectionMapping.confidence === 'number'
            ? Math.min(Math.max(sectionMapping.confidence, 0), 1)
            : 0.5,
        matchReason: sectionMapping.reason ?? null,
        source: 'auto',
        createdAt: generatedAt,
        updatedAt: generatedAt,
      })
    }
  }

  return autoLinks
}

function buildFallbackSectionId(section: {
  title: string
  level: number
  occurrenceIndex: number
}): string {
  const digest = createHash('sha1')
    .update(`${section.level}:${section.title}:${section.occurrenceIndex}`)
    .digest('hex')
  return `heading-${section.level}-${digest}`
}

export class TraceabilityMatrixService {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private linkRepo = new TraceabilityLinkRepository()

  async generate(input: { projectId: string }): Promise<GenerateMatrixResult> {
    const { projectId } = input

    const project = await this.projectRepo.findById(projectId)
    if (!project || !project.rootPath) {
      throw new BidWiseError(ErrorCode.MATRIX_GENERATION_FAILED, `项目未设置存储路径: ${projectId}`)
    }

    // Load requirements
    const requirements = await this.requirementRepo.findByProject(projectId)
    if (requirements.length === 0) {
      throw new BidWiseError(ErrorCode.MATRIX_GENERATION_FAILED, '需求清单为空，请先完成需求抽取')
    }

    // Load section index from proposal.meta.json or fallback to proposal.md headings
    const sections = await this.loadSectionIndex(project.rootPath, projectId)
    if (sections.length === 0) {
      throw new BidWiseError(ErrorCode.MATRIX_GENERATION_FAILED, '方案章节为空，请先生成方案骨架')
    }

    // Load existing manual links as protected set
    const allLinks = await this.linkRepo.findByProject(projectId)
    const manualLinks = allLinks.filter((l) => l.source === 'manual')

    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, fileName: 'traceability-matrix' },
      maxRetries: 0,
    })

    const linkRepo = this.linkRepo
    const rootPath = project.rootPath

    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在构建追溯映射提示词...')

        ctx.updateProgress(10, '正在调用 AI 分析需求-章节映射...')
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'traceability',
          context: {
            requirements: requirements.map((r) => ({
              id: r.id,
              sequenceNumber: r.sequenceNumber,
              description: r.description,
              category: r.category,
            })),
            sections: sections.map((s) => ({
              sectionId: s.sectionId,
              title: s.title,
              level: s.level,
            })),
            existingManualLinks:
              manualLinks.length > 0
                ? manualLinks.map((l) => ({
                    requirementId: l.requirementId,
                    sectionId: l.sectionId,
                    coverageStatus: l.coverageStatus,
                  }))
                : undefined,
          },
        })

        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          throwIfAborted(ctx.signal, 'AI 追溯矩阵生成任务已取消')

          if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.MATRIX_GENERATION_FAILED,
              'AI 追溯矩阵生成超时（超过 5 分钟），请重试'
            )
          }

          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.MATRIX_GENERATION_FAILED,
              `AI 追溯矩阵生成失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 追溯矩阵生成任务已取消')
          }

          const progressPct = Math.min(20 + status.progress * 0.6, 80)
          ctx.updateProgress(progressPct, '正在调用 AI 分析需求-章节映射...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        if (!agentResult) {
          throw new BidWiseError(ErrorCode.MATRIX_GENERATION_FAILED, 'AI 返回结果为空')
        }

        ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
        const rawMappings = parseMappingResponse(agentResult)
        const now = new Date().toISOString()
        const autoLinks = buildAutoLinks(projectId, requirements, sections, rawMappings, now)

        await linkRepo.replaceAutoByProject(projectId, autoLinks)

        // Write snapshot
        const allLinksAfter = await linkRepo.findByProject(projectId)
        const stats = computeStats(requirements, allLinksAfter)
        const snapshot: TraceabilitySnapshot = {
          projectId,
          links: allLinksAfter,
          stats,
          generatedAt: now,
          updatedAt: now,
          recentlyImpactedSectionIds: [],
          recentlyAddedRequirementIds: [],
        }
        const snapshotPath = path.join(rootPath, SNAPSHOT_FILE)
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

        ctx.updateProgress(100, '追溯矩阵生成完成')
        logger.info(
          `Traceability matrix generation complete for project ${projectId}: ${autoLinks.length} auto links`
        )
        return autoLinks
      })
      .catch((err) => {
        logger.error(`Traceability matrix generation task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getMatrix(projectId: string): Promise<TraceabilityMatrix | null> {
    const requirements = await this.requirementRepo.findByProject(projectId)
    const links = await this.linkRepo.findByProject(projectId)

    // Check if matrix has ever been generated
    if (links.length === 0) {
      const project = await this.projectRepo.findById(projectId)
      if (project.rootPath) {
        const snapshotPath = path.join(project.rootPath, SNAPSHOT_FILE)
        try {
          await fs.access(snapshotPath)
          // Snapshot exists but 0 links — generation ran but found no mappings
        } catch {
          return null // Never generated
        }
      } else {
        return null
      }
    }

    if (requirements.length === 0) {
      return null
    }

    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) return null

    const sections = await this.loadSectionIndex(project.rootPath, projectId)
    if (sections.length === 0) return null

    // Load snapshot for impact highlights
    let snapshot: TraceabilitySnapshot | null = null
    try {
      const snapshotPath = path.join(project.rootPath, SNAPSHOT_FILE)
      const snapshotRaw = await fs.readFile(snapshotPath, 'utf-8')
      snapshot = JSON.parse(snapshotRaw) as TraceabilitySnapshot
    } catch {
      // No snapshot
    }

    const impactedSectionIds = new Set(snapshot?.recentlyImpactedSectionIds ?? [])
    const addedRequirementIds = new Set(snapshot?.recentlyAddedRequirementIds ?? [])

    // Build link lookup
    const linkMap = new Map<string, TraceabilityLink>()
    for (const link of links) {
      linkMap.set(`${link.requirementId}::${link.sectionId}`, link)
    }

    // Build columns from sections
    const columns: TraceabilityMatrixColumn[] = sections.map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      level: s.level,
      parentSectionId: s.parentSectionId,
      order: s.order,
      occurrenceIndex: s.occurrenceIndex,
      weightPercent: s.weightPercent,
      headingLocator: s.headingLocator ?? null,
    }))

    // Build rows sorted by sequenceNumber
    const sortedRequirements = [...requirements].sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    const rows: TraceabilityMatrixRow[] = sortedRequirements.map((req) => {
      const cells: TraceabilityMatrixCell[] = columns.map((col) => {
        const key = `${req.id}::${col.sectionId}`
        const link = linkMap.get(key)
        const isImpacted = impactedSectionIds.has(col.sectionId) || addedRequirementIds.has(req.id)

        if (link) {
          return {
            requirementId: req.id,
            requirementDescription: req.description,
            requirementSequence: req.sequenceNumber,
            sectionId: col.sectionId,
            sectionTitle: col.title,
            cellState: link.coverageStatus,
            coverageStatus: link.coverageStatus,
            confidence: link.confidence,
            source: link.source,
            matchReason: link.matchReason ?? null,
            linkId: link.id,
            isImpacted,
          }
        }

        return {
          requirementId: req.id,
          requirementDescription: req.description,
          requirementSequence: req.sequenceNumber,
          sectionId: col.sectionId,
          sectionTitle: col.title,
          cellState: 'none',
          coverageStatus: null,
          confidence: 0,
          source: null,
          matchReason: null,
          linkId: null,
          isImpacted,
        }
      })

      return {
        requirementId: req.id,
        sequenceNumber: req.sequenceNumber,
        description: req.description,
        category: req.category,
        cells,
      }
    })

    const stats = computeStats(requirements, links)

    return {
      projectId,
      rows,
      columns,
      stats,
      generatedAt: snapshot?.generatedAt ?? new Date().toISOString(),
      updatedAt: snapshot?.updatedAt ?? new Date().toISOString(),
      recentlyImpactedSectionIds: snapshot?.recentlyImpactedSectionIds ?? [],
      recentlyAddedRequirementIds: snapshot?.recentlyAddedRequirementIds ?? [],
    }
  }

  async getStats(projectId: string): Promise<TraceabilityStats | null> {
    const requirements = await this.requirementRepo.findByProject(projectId)
    if (requirements.length === 0) return null

    const links = await this.linkRepo.findByProject(projectId)
    if (links.length === 0) {
      // Check if generation was ever run
      const project = await this.projectRepo.findById(projectId)
      if (project.rootPath) {
        const snapshotPath = path.join(project.rootPath, SNAPSHOT_FILE)
        try {
          await fs.access(snapshotPath)
          // Generation ran but found no mappings — all uncovered
          return {
            totalRequirements: requirements.length,
            coveredCount: 0,
            partialCount: 0,
            uncoveredCount: requirements.length,
            coverageRate: 0,
          }
        } catch {
          return null // Never generated
        }
      }
      return null
    }

    return computeStats(requirements, links)
  }

  async createLink(input: {
    projectId: string
    requirementId: string
    sectionId: string
    coverageStatus: CoverageStatus
  }): Promise<TraceabilityLink> {
    const project = await this.projectRepo.findById(input.projectId)

    // Resolve section title from index
    let sectionTitle = ''
    if (project.rootPath) {
      const sections = await this.loadSectionIndex(project.rootPath, input.projectId)
      const section = sections.find((s) => s.sectionId === input.sectionId)
      sectionTitle = section?.title ?? ''
    }

    const link = await this.linkRepo.create({
      id: uuidv4(),
      projectId: input.projectId,
      requirementId: input.requirementId,
      sectionId: input.sectionId,
      sectionTitle,
      coverageStatus: input.coverageStatus,
      confidence: 1.0,
      matchReason: null,
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    await this.syncSnapshot(input.projectId)
    return link
  }

  async updateLink(
    id: string,
    patch: Partial<Pick<TraceabilityLink, 'coverageStatus' | 'matchReason'>>
  ): Promise<TraceabilityLink> {
    // Any user edit on an auto link converts it to manual
    const updatedLink = await this.linkRepo.update(id, {
      ...patch,
      source: 'manual',
    })

    // Sync snapshot for the project
    await this.syncSnapshot(updatedLink.projectId)
    return updatedLink
  }

  async deleteLink(id: string): Promise<TraceabilityLink | null> {
    const link = await this.linkRepo.findById(id)
    if (!link) {
      throw new BidWiseError(ErrorCode.VALIDATION, `追溯链接不存在: ${id}`)
    }

    if (link.source === 'auto') {
      // Auto links cannot be deleted — convert to manual + uncovered per AC #5
      const updated = await this.linkRepo.update(id, {
        coverageStatus: 'uncovered',
        source: 'manual',
      })
      await this.syncSnapshot(updated.projectId)
      return updated
    }

    await this.linkRepo.delete(id)
    return null
  }

  async importAddendum(input: {
    projectId: string
    content?: string
    filePath?: string
    fileName?: string
  }): Promise<ImportAddendumResult> {
    const { projectId } = input

    if (!input.content && !input.filePath) {
      throw new BidWiseError(ErrorCode.VALIDATION, '必须提供补遗文本内容或文件路径')
    }

    const project = await this.projectRepo.findById(projectId)
    if (!project || !project.rootPath) {
      throw new BidWiseError(ErrorCode.ADDENDUM_PARSE_FAILED, `项目未设置存储路径: ${projectId}`)
    }

    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, fileName: input.fileName ?? 'addendum-import' },
      maxRetries: 0,
    })

    const requirementRepo = this.requirementRepo
    const linkRepo = this.linkRepo
    const rootPath = project.rootPath
    const loadSectionIndex = this.loadSectionIndex.bind(this)

    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在读取补遗内容...')

        // Resolve content
        let addendumContent = input.content ?? ''
        if (!addendumContent && input.filePath) {
          // For .txt files, read directly
          if (input.fileName?.endsWith('.txt') || input.filePath.endsWith('.txt')) {
            addendumContent = await fs.readFile(input.filePath, 'utf-8')
          } else {
            // For .pdf/.docx/.doc, use existing parsers
            const ext = path.extname(input.filePath).toLowerCase()
            if (ext === '.pdf') {
              const { extractPdfText } = await import('./pdf-extractor')
              const result = await extractPdfText(input.filePath)
              addendumContent = result.text
            } else if (ext === '.docx' || ext === '.doc') {
              const { extractWordText, convertDocToDocx } = await import('./word-extractor')
              let docxPath = input.filePath
              if (ext === '.doc') {
                const converted = await convertDocToDocx(input.filePath)
                docxPath = converted
              }
              const result = await extractWordText(docxPath)
              addendumContent = result.text
            } else {
              throw new BidWiseError(ErrorCode.UNSUPPORTED_FORMAT, `不支持的补遗文件格式: ${ext}`)
            }
          }
        }

        if (!addendumContent.trim()) {
          throw new BidWiseError(ErrorCode.ADDENDUM_PARSE_FAILED, '补遗内容为空')
        }

        ctx.updateProgress(15, '正在调用 AI 提取补遗需求...')

        // Load existing requirements for reference (include deleted to map by sequenceNumber)
        const existingReqs = await requirementRepo.findByProject(projectId, {
          includeDeleted: true,
        })

        // Use extract agent addendum mode
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'extract',
          context: {
            mode: 'addendum-requirements',
            addendumContent,
            existingRequirements: existingReqs.map((r) => ({
              id: r.id,
              sequenceNumber: r.sequenceNumber,
              description: r.description,
            })),
          },
        })

        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          throwIfAborted(ctx.signal, 'AI 补遗解析任务已取消')

          if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.ADDENDUM_PARSE_FAILED,
              'AI 补遗解析超时（超过 5 分钟），请重试'
            )
          }

          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.ADDENDUM_PARSE_FAILED,
              `AI 补遗解析失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 补遗解析任务已取消')
          }

          const progressPct = Math.min(20 + status.progress * 0.3, 50)
          ctx.updateProgress(progressPct, '正在调用 AI 提取补遗需求...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        if (!agentResult) {
          throw new BidWiseError(ErrorCode.ADDENDUM_PARSE_FAILED, 'AI 返回结果为空')
        }

        ctx.updateProgress(55, '正在解析补遗需求...')

        const jsonStr = extractJsonFromResponse(agentResult)
        let parsedItems: Array<{
          description?: string
          category?: string
          priority?: string
          status?: string
          originalSequenceNumber?: number | null
          sourcePages?: number[]
        }>
        try {
          const parsed = JSON.parse(jsonStr)
          parsedItems = Array.isArray(parsed) ? parsed : []
        } catch {
          throw new BidWiseError(ErrorCode.ADDENDUM_PARSE_FAILED, 'AI 补遗解析结果 JSON 格式错误')
        }

        // Save snapshot before changes for diff
        const linksBefore = await linkRepo.findByProject(projectId)
        const sectionIdsBefore = new Set(linksBefore.map((l) => l.sectionId))

        // Build lookup from sequenceNumber to existing requirement
        const seqToReq = new Map(existingReqs.map((r) => [r.sequenceNumber, r]))
        const requirementPatches = new Map<
          string,
          Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
        >()

        // Handle modified and deleted requirements
        for (const item of parsedItems) {
          if (!item.originalSequenceNumber) continue
          const existing = seqToReq.get(item.originalSequenceNumber)
          if (!existing) continue

          if (item.status === 'deleted') {
            const patch = { status: 'deleted' as const }
            requirementPatches.set(existing.id, patch)
            await requirementRepo.update(existing.id, patch)
          } else if (item.status === 'modified' && item.description) {
            const patch = {
              description: item.description.trim(),
              ...(item.category ? { category: item.category as RequirementCategory } : {}),
              ...(item.priority ? { priority: item.priority as 'high' | 'medium' | 'low' } : {}),
              status: 'modified' as const,
            }
            requirementPatches.set(existing.id, patch)
            await requirementRepo.update(existing.id, patch)
          }
        }

        // Insert truly new requirements (no originalSequenceNumber, not deleted)
        const maxSeq = existingReqs.reduce((max, r) => Math.max(max, r.sequenceNumber), 0)
        let seqOffset = 0
        const newRequirements: RequirementItem[] = parsedItems
          .filter(
            (item) => item.description && !item.originalSequenceNumber && item.status !== 'deleted'
          )
          .map((item) => ({
            id: uuidv4(),
            sequenceNumber: maxSeq + ++seqOffset,
            description: (item.description ?? '').trim(),
            sourcePages: item.sourcePages ?? [],
            category: (item.category ?? 'other') as RequirementCategory,
            priority: (item.priority ?? 'medium') as 'high' | 'medium' | 'low',
            status: 'extracted' as const,
          }))

        const activeRequirementsAfterUpdates = existingReqs
          .map((requirement): RequirementItem | null => {
            const patch = requirementPatches.get(requirement.id)
            const nextStatus = (patch?.status ?? requirement.status) as RequirementItem['status']
            if (nextStatus === 'deleted') {
              return null
            }

            return {
              ...requirement,
              description: patch?.description ?? requirement.description,
              category: (patch?.category ?? requirement.category) as RequirementCategory,
              priority: (patch?.priority ?? requirement.priority) as 'high' | 'medium' | 'low',
              status: nextStatus,
            }
          })
          .filter((requirement): requirement is RequirementItem => requirement !== null)

        // Re-generate full auto mapping (preserving manual links)
        const allReqsAfter = [...activeRequirementsAfterUpdates, ...newRequirements].sort(
          (left, right) => left.sequenceNumber - right.sequenceNumber
        )
        let remappingFailureMessage: string | null = null
        const sections = await loadSectionIndex(rootPath, projectId)
        let remappedAutoLinks: TraceabilityLink[] | null = null

        if (sections.length > 0 && allReqsAfter.length > 0) {
          ctx.updateProgress(70, '正在重新生成追溯映射...')
          const manualLinks = (await linkRepo.findByProject(projectId)).filter(
            (l) => l.source === 'manual'
          )

          const regenResponse = await agentOrchestrator.execute({
            agentType: 'traceability',
            context: {
              requirements: allReqsAfter.map((r) => ({
                id: r.id,
                sequenceNumber: r.sequenceNumber,
                description: r.description,
                category: r.category,
              })),
              sections: sections.map((s) => ({
                sectionId: s.sectionId,
                title: s.title,
                level: s.level,
              })),
              existingManualLinks:
                manualLinks.length > 0
                  ? manualLinks.map((l) => ({
                      requirementId: l.requirementId,
                      sectionId: l.sectionId,
                      coverageStatus: l.coverageStatus,
                    }))
                  : undefined,
            },
          })

          const regenTaskId = regenResponse.taskId
          let regenResult: string | undefined
          const regenStartedAt = Date.now()

          while (true) {
            throwIfAborted(ctx.signal, '追溯映射更新已取消')

            if (Date.now() - regenStartedAt >= GENERATION_TIMEOUT_MS) {
              logger.warn('Addendum re-mapping timed out, skipping auto-link update')
              remappingFailureMessage = '追溯映射更新超时，请手动重新生成矩阵'
              break
            }

            const regenStatus = await agentOrchestrator.getAgentStatus(regenTaskId)

            if (regenStatus.status === 'completed') {
              regenResult = regenStatus.result?.content
              break
            }

            if (regenStatus.status === 'failed' || regenStatus.status === 'cancelled') {
              logger.warn(
                `Addendum re-mapping ${regenStatus.status}: ${regenStatus.error?.message}`
              )
              remappingFailureMessage =
                regenStatus.status === 'cancelled'
                  ? '追溯映射更新已取消，请手动重新生成矩阵'
                  : `追溯映射更新失败: ${regenStatus.error?.message ?? '未知错误'}，请手动重新生成矩阵`
              break
            }

            const progressPct = Math.min(75 + regenStatus.progress * 0.15, 90)
            ctx.updateProgress(progressPct, '正在重新生成追溯映射...')

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          }

          if (regenResult) {
            const regenMappings = parseMappingResponse(regenResult)
            const now = new Date().toISOString()
            remappedAutoLinks = buildAutoLinks(
              projectId,
              allReqsAfter,
              sections,
              regenMappings,
              now
            )
          } else if (!remappingFailureMessage) {
            remappingFailureMessage = '追溯映射更新未返回结果，请手动重新生成矩阵'
          }
        }

        if (remappingFailureMessage) {
          ctx.updateProgress(100, remappingFailureMessage)
          throw new BidWiseError(ErrorCode.MATRIX_GENERATION_FAILED, remappingFailureMessage)
        }

        ctx.updateProgress(85, '正在持久化补遗变更...')

        if (newRequirements.length > 0) {
          await requirementRepo.create(projectId, newRequirements)
        }

        if (remappedAutoLinks) {
          await linkRepo.replaceAutoByProject(projectId, remappedAutoLinks)
        }

        // Compute impact diff
        ctx.updateProgress(95, '正在计算受影响章节...')
        const linksAfter = await linkRepo.findByProject(projectId)
        const sectionIdsAfter = new Set(linksAfter.map((l) => l.sectionId))

        // Impacted sections = new sections that appeared or sections with changed links
        const recentlyImpactedSectionIds: string[] = []
        for (const sid of sectionIdsAfter) {
          if (!sectionIdsBefore.has(sid)) {
            recentlyImpactedSectionIds.push(sid)
          }
        }
        // Also check for sections where coverage status changed
        const beforeLinkMap = new Map(
          linksBefore.map((l) => [`${l.requirementId}::${l.sectionId}`, l.coverageStatus])
        )
        for (const link of linksAfter) {
          const key = `${link.requirementId}::${link.sectionId}`
          const prevStatus = beforeLinkMap.get(key)
          if (
            prevStatus !== link.coverageStatus &&
            !recentlyImpactedSectionIds.includes(link.sectionId)
          ) {
            recentlyImpactedSectionIds.push(link.sectionId)
          }
        }

        const recentlyAddedRequirementIds = newRequirements.map((r) => r.id)

        // Write snapshot
        const allReqs = await requirementRepo.findByProject(projectId)
        const stats = computeStats(allReqs, linksAfter)
        const now = new Date().toISOString()
        const snapshot: TraceabilitySnapshot = {
          projectId,
          links: linksAfter,
          stats,
          generatedAt: now,
          updatedAt: now,
          recentlyImpactedSectionIds,
          recentlyAddedRequirementIds,
        }
        const snapshotPath = path.join(rootPath, SNAPSHOT_FILE)
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

        ctx.updateProgress(100, `补遗导入完成，新增 ${newRequirements.length} 条需求`)
        logger.info(
          `Addendum import complete for project ${projectId}: ${newRequirements.length} new requirements, ${recentlyImpactedSectionIds.length} impacted sections, remappingFailed=${Boolean(remappingFailureMessage)}`
        )
        return {
          newRequirements: newRequirements.length,
          impactedSections: recentlyImpactedSectionIds.length,
          remappingFailed: false,
        }
      })
      .catch((err) => {
        logger.error(`Addendum import task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  private async loadSectionIndex(
    rootPath: string,
    _projectId: string
  ): Promise<ProposalSectionIndexEntry[]> {
    // Priority 1: proposal.meta.json sectionIndex
    const metaPath = path.join(rootPath, 'proposal.meta.json')
    try {
      const metaRaw = await fs.readFile(metaPath, 'utf-8')
      const meta = JSON.parse(metaRaw) as ProposalMetadata
      if (meta.sectionIndex && meta.sectionIndex.length > 0) {
        return meta.sectionIndex
      }
    } catch {
      // No metadata or parse error
    }

    // Priority 2: Extract from proposal.md headings
    // IDs use level + normalized title + occurrenceIndex for stability across edits
    const proposalPath = path.join(rootPath, 'proposal.md')
    try {
      const markdown = await fs.readFile(proposalPath, 'utf-8')
      const headings = extractMarkdownHeadings(markdown)

      return headings.map((h, i) => ({
        sectionId: buildFallbackSectionId(h),
        title: h.title,
        level: h.level,
        order: i,
        occurrenceIndex: h.occurrenceIndex,
        headingLocator: {
          title: h.title,
          level: h.level,
          occurrenceIndex: h.occurrenceIndex,
        },
      }))
    } catch {
      // No proposal.md
    }

    return []
  }

  /**
   * Story 11.4: public hook that lets external services (e.g. chapter-structure
   * soft delete / Undo, which swap SQLite link rows in place) rebuild the
   * `traceability-matrix.json` sidecar so `links`, `stats`, and `updatedAt`
   * stay aligned with the live SQLite set. Mirrors the private path used by
   * create/update/delete link handlers. Errors are swallowed internally — the
   * sidecar is a derived artifact and best-effort by design.
   */
  async rebuildSnapshot(projectId: string): Promise<void> {
    await this.syncSnapshot(projectId)
  }

  private async syncSnapshot(projectId: string): Promise<void> {
    try {
      const project = await this.projectRepo.findById(projectId)
      if (!project.rootPath) return

      const requirements = await this.requirementRepo.findByProject(projectId)
      const links = await this.linkRepo.findByProject(projectId)
      const stats = computeStats(requirements, links)

      const snapshotPath = path.join(project.rootPath, SNAPSHOT_FILE)

      // Preserve existing impact data
      let prevSnapshot: Partial<TraceabilitySnapshot> = {}
      try {
        const existing = await fs.readFile(snapshotPath, 'utf-8')
        prevSnapshot = JSON.parse(existing) as TraceabilitySnapshot
      } catch {
        // No existing snapshot
      }

      const now = new Date().toISOString()
      const snapshot: TraceabilitySnapshot = {
        projectId,
        links,
        stats,
        generatedAt: prevSnapshot.generatedAt ?? now,
        updatedAt: now,
        recentlyImpactedSectionIds: prevSnapshot.recentlyImpactedSectionIds ?? [],
        recentlyAddedRequirementIds: prevSnapshot.recentlyAddedRequirementIds ?? [],
      }
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`Failed to sync traceability snapshot for project ${projectId}`, err)
    }
  }
}

/** Compute stats at requirement granularity */
function computeStats(
  requirements: RequirementItem[],
  links: TraceabilityLink[]
): TraceabilityStats {
  const total = requirements.length
  if (total === 0) {
    return {
      totalRequirements: 0,
      coveredCount: 0,
      partialCount: 0,
      uncoveredCount: 0,
      coverageRate: 0,
    }
  }

  // Group links by requirement
  const linksByReq = new Map<string, TraceabilityLink[]>()
  for (const link of links) {
    const existing = linksByReq.get(link.requirementId) ?? []
    existing.push(link)
    linksByReq.set(link.requirementId, existing)
  }

  let coveredCount = 0
  let partialCount = 0
  let uncoveredCount = 0

  for (const req of requirements) {
    const reqLinks = linksByReq.get(req.id) ?? []

    if (reqLinks.length === 0) {
      // No links at all → uncovered
      uncoveredCount++
      continue
    }

    const hasExplicitUncovered = reqLinks.some((l) => l.coverageStatus === 'uncovered')
    const hasPartial = reqLinks.some((l) => l.coverageStatus === 'partial')
    const hasCovered = reqLinks.some((l) => l.coverageStatus === 'covered')

    if (hasExplicitUncovered && (hasCovered || hasPartial)) {
      partialCount++
    } else if (hasExplicitUncovered) {
      uncoveredCount++
    } else if (hasPartial) {
      partialCount++
    } else if (hasCovered) {
      coveredCount++
    } else {
      uncoveredCount++
    }
  }

  return {
    totalRequirements: total,
    coveredCount,
    partialCount,
    uncoveredCount,
    coverageRate: total > 0 ? coveredCount / total : 0,
  }
}
