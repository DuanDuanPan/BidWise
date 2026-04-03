import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { RequirementCertaintyRepository } from '@main/db/repositories/requirement-certainty-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  ParsedTender,
  ExtractionResult,
  RequirementItem,
  ScoringModel,
  ScoringCriterion,
  ScoringSubItem,
  ExtractionTaskResult,
  MandatoryItemsSnapshot,
} from '@shared/analysis-types'

const logger = createLogger('scoring-extractor')

const POLL_INTERVAL_MS = 1_000
const EXTRACTION_TIMEOUT_MS = 10 * 60 * 1_000

/** Extract JSON from a string that may be wrapped in markdown code fences */
function extractJsonFromResponse(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Try to find raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return jsonMatch[0]
  return text.trim()
}

interface RawExtractionResponse {
  requirements?: Array<{
    sequenceNumber?: number
    description?: string
    sourcePages?: number[]
    category?: string
    priority?: string
  }>
  scoringModel?: {
    totalScore?: number
    criteria?: Array<{
      category?: string
      maxScore?: number
      subItems?: Array<{
        name?: string
        maxScore?: number
        description?: string
        sourcePages?: number[]
      }>
      reasoning?: string
    }>
  }
}

const VALID_CATEGORIES = new Set([
  'technical',
  'implementation',
  'service',
  'qualification',
  'commercial',
  'other',
])
const VALID_PRIORITIES = new Set(['high', 'medium', 'low'])

function parseExtractionResponse(content: string, projectId: string): ExtractionResult {
  const jsonStr = extractJsonFromResponse(content)
  let raw: RawExtractionResponse

  try {
    raw = JSON.parse(jsonStr) as RawExtractionResponse
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.EXTRACTION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  // Parse requirements with defaults
  const requirements: RequirementItem[] = (raw.requirements ?? []).map((r, idx) => ({
    id: uuidv4(),
    sequenceNumber: r.sequenceNumber ?? idx + 1,
    description: r.description ?? '',
    sourcePages: Array.isArray(r.sourcePages) ? r.sourcePages : [],
    category: VALID_CATEGORIES.has(r.category ?? '')
      ? (r.category as RequirementItem['category'])
      : 'other',
    priority: VALID_PRIORITIES.has(r.priority ?? '')
      ? (r.priority as RequirementItem['priority'])
      : 'medium',
    status: 'extracted' as const,
  }))

  // Parse scoring model with defaults
  const rawModel = raw.scoringModel ?? { totalScore: 100, criteria: [] }
  const criteria: ScoringCriterion[] = (rawModel.criteria ?? []).map((c) => ({
    id: uuidv4(),
    category: c.category ?? '未分类',
    maxScore: c.maxScore ?? 0,
    weight: 0, // computed below
    subItems: (c.subItems ?? []).map(
      (sub): ScoringSubItem => ({
        id: uuidv4(),
        name: sub.name ?? '',
        maxScore: sub.maxScore ?? 0,
        description: sub.description ?? '',
        sourcePages: Array.isArray(sub.sourcePages) ? sub.sourcePages : [],
      })
    ),
    reasoning: c.reasoning ?? '',
    status: 'extracted' as const,
  }))

  const totalScore = rawModel.totalScore ?? 100
  // Compute weights
  for (const c of criteria) {
    c.weight = totalScore > 0 ? c.maxScore / totalScore : 0
  }

  // Warn if scores don't add up
  const sumScores = criteria.reduce((acc, c) => acc + c.maxScore, 0)
  if (sumScores !== totalScore) {
    logger.warn(`评分项分值之和(${sumScores})与总分(${totalScore})不一致`)
  }

  const scoringModel: ScoringModel = {
    projectId,
    totalScore,
    criteria,
    extractedAt: new Date().toISOString(),
    confirmedAt: null,
    version: 1,
  }

  return { requirements, scoringModel }
}

export class ScoringExtractor {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()
  private certaintyRepo = new RequirementCertaintyRepository()

  async extract(input: { projectId: string }): Promise<ExtractionTaskResult> {
    const { projectId } = input

    // Validate project
    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(ErrorCode.EXTRACTION_FAILED, `项目未设置存储路径: ${projectId}`)
    }

    // Load parsed tender
    const tenderParsedPath = path.join(project.rootPath, 'tender', 'tender-parsed.json')
    let tender: ParsedTender
    try {
      const content = await fs.readFile(tenderParsedPath, 'utf-8')
      tender = JSON.parse(content) as ParsedTender
    } catch {
      throw new BidWiseError(
        ErrorCode.EXTRACTION_FAILED,
        `招标文件解析结果不存在或无法读取: ${tenderParsedPath}`
      )
    }

    // Enqueue outer task
    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, rootPath: project.rootPath },
    })

    // Fire-and-forget execution
    const requirementRepo = this.requirementRepo
    const scoringModelRepo = this.scoringModelRepo
    const mandatoryItemRepo = this.mandatoryItemRepo
    const certaintyRepo = this.certaintyRepo
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在构建提示词...')

        // Step 1: Call agent orchestrator
        ctx.updateProgress(10, '正在调用 AI 分析招标文件...')
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'extract',
          context: {
            sections: tender.sections,
            rawText: tender.rawText,
            totalPages: tender.totalPages,
            hasScannedContent: tender.hasScannedContent,
          },
        })

        // Step 2: Poll for agent completion
        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          if (Date.now() - pollingStartedAt >= EXTRACTION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.EXTRACTION_FAILED,
              'AI 抽取超时（超过 10 分钟），请重试'
            )
          }

          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.EXTRACTION_FAILED,
              `AI 抽取失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 抽取任务已取消')
          }

          // Report polling progress (20% → 80%)
          const progressPct = Math.min(20 + status.progress * 0.6, 80)
          ctx.updateProgress(progressPct, '正在调用 AI 分析招标文件...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        if (!agentResult) {
          throw new BidWiseError(ErrorCode.EXTRACTION_FAILED, 'AI 返回结果为空')
        }

        // Step 3: Parse LLM response
        ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
        const result = parseExtractionResponse(agentResult, projectId)

        // Step 4: Clean old data and persist
        // Clear fog-map data before re-extracting requirements (Story 2.9 regression guard)
        await certaintyRepo.deleteByProject(projectId)
        const fogMapPath = path.join(rootPath, 'tender', 'fog-map.json')
        await fs.rm(fogMapPath, { force: true }).catch(() => {})

        // Clear mandatory item links before deleting requirements to prevent dangling references
        await mandatoryItemRepo.clearLinkedRequirements(projectId)

        // Always rewrite the snapshot so older drifted files self-heal even when DB is empty.
        const mandatoryItems = await mandatoryItemRepo.findByProject(projectId)
        const mandatorySnapshot: MandatoryItemsSnapshot = {
          projectId,
          items: mandatoryItems,
          detectedAt: new Date().toISOString(),
        }
        const mandatorySnapshotPath = path.join(rootPath, 'tender', 'mandatory-items.json')
        await fs.writeFile(
          mandatorySnapshotPath,
          JSON.stringify(mandatorySnapshot, null, 2),
          'utf-8'
        )

        await requirementRepo.deleteByProject(projectId)
        await requirementRepo.create(projectId, result.requirements)
        await scoringModelRepo.upsert(result.scoringModel)

        // Step 5: Write scoring-model.json to project directory
        const scoringModelPath = path.join(rootPath, 'tender', 'scoring-model.json')
        await fs.writeFile(scoringModelPath, JSON.stringify(result.scoringModel, null, 2), 'utf-8')

        ctx.updateProgress(100, '抽取完成')
        logger.info(
          `Extraction complete for project ${projectId}: ${result.requirements.length} requirements, ${result.scoringModel.criteria.length} criteria`
        )
        return result
      })
      .catch((err) => {
        logger.error(`Extraction task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getRequirements(projectId: string): Promise<RequirementItem[] | null> {
    const items = await this.requirementRepo.findByProject(projectId)
    if (items.length > 0) {
      return items
    }

    const scoringModel = await this.scoringModelRepo.findByProject(projectId)
    return scoringModel ? [] : null
  }

  async getScoringModel(projectId: string): Promise<ScoringModel | null> {
    return this.scoringModelRepo.findByProject(projectId)
  }

  async updateRequirement(
    id: string,
    patch: Partial<Pick<RequirementItem, 'description' | 'category' | 'priority' | 'status'>>
  ): Promise<RequirementItem> {
    return this.requirementRepo.update(id, patch)
  }

  async updateScoringCriterion(
    projectId: string,
    criterionId: string,
    patch: Partial<Pick<ScoringCriterion, 'maxScore' | 'weight' | 'reasoning' | 'status'>>
  ): Promise<ScoringModel> {
    return this.scoringModelRepo.updateCriterion(projectId, criterionId, patch)
  }

  async confirmScoringModel(projectId: string): Promise<ScoringModel> {
    const model = await this.scoringModelRepo.confirm(projectId)

    // Double-write: update scoring-model.json
    const project = await this.projectRepo.findById(projectId)
    if (project.rootPath) {
      const scoringModelPath = path.join(project.rootPath, 'tender', 'scoring-model.json')
      await fs.writeFile(scoringModelPath, JSON.stringify(model, null, 2), 'utf-8')
    }

    return model
  }
}
