import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { throwIfAborted } from '@main/utils/abort'
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
  RequirementCertainty,
  CertaintyLevel,
  FogMapItem,
  FogMapSummary,
  FogMapSnapshot,
  GenerateFogMapResult,
  ParsedTender,
  TenderSection,
} from '@shared/analysis-types'

const logger = createLogger('fog-map-classifier')

const POLL_INTERVAL_MS = 1_000
const GENERATION_TIMEOUT_MS = 5 * 60 * 1_000

const VALID_CERTAINTY_LEVELS = new Set<string>(['clear', 'ambiguous', 'risky'])

interface RawClassification {
  requirementId?: string
  certaintyLevel?: string
  reason?: string
  suggestion?: string
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

function parseClassificationResponse(content: string): RawClassification[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.FOG_MAP_GENERATION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  if (Array.isArray(parsed)) {
    return parsed as RawClassification[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of [
      'classifications',
      'items',
      'results',
      'certainties',
      'requirements',
    ]) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawClassification[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.FOG_MAP_GENERATION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

export class FogMapClassifier {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()
  private certaintyRepo = new RequirementCertaintyRepository()

  async generate(input: { projectId: string }): Promise<GenerateFogMapResult> {
    const { projectId } = input

    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(
        ErrorCode.FOG_MAP_GENERATION_FAILED,
        `项目未设置存储路径: ${projectId}`
      )
    }

    const requirements = await this.requirementRepo.findByProject(projectId)
    if (requirements.length === 0) {
      throw new BidWiseError(
        ErrorCode.FOG_MAP_NO_REQUIREMENTS,
        '请先完成需求结构化抽取后再生成迷雾地图'
      )
    }

    const scoringModel = await this.scoringModelRepo.findByProject(projectId).catch(() => null)
    const mandatoryItems = await this.mandatoryItemRepo.findByProject(projectId).catch(() => [])

    let tenderSections: TenderSection[] | null = null
    try {
      const tenderParsedPath = path.join(project.rootPath, 'tender', 'tender-parsed.json')
      const tenderContent = await fs.readFile(tenderParsedPath, 'utf-8')
      const parsed = JSON.parse(tenderContent) as ParsedTender
      tenderSections = parsed.sections ?? null
    } catch {
      // Tender sections not available — graceful degradation
    }

    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, rootPath: project.rootPath },
    })

    const certaintyRepo = this.certaintyRepo
    const requirementRepo = this.requirementRepo
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
        ctx.updateProgress(5, '正在构建确定性分级提示词...')

        throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
        ctx.updateProgress(10, '正在调用 AI 分析需求确定性...')
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'fog-map',
          context: {
            requirements,
            scoringModel,
            mandatoryItems,
            tenderSections,
          },
          options: { timeoutMs: 180000 },
        })

        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          throwIfAborted(ctx.signal, 'Fog map generation task cancelled')

          if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.FOG_MAP_GENERATION_FAILED,
              'AI 确定性分级超时（超过 5 分钟），请重试'
            )
          }

          throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.FOG_MAP_GENERATION_FAILED,
              `AI 确定性分级失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 确定性分级任务已取消')
          }

          const progressPct = Math.min(20 + status.progress * 0.6, 80)
          ctx.updateProgress(progressPct, '正在调用 AI 分析需求确定性...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
        if (!agentResult) {
          throw new BidWiseError(ErrorCode.FOG_MAP_GENERATION_FAILED, 'AI 返回结果为空')
        }

        ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
        const rawClassifications = parseClassificationResponse(agentResult)

        // Build a set of valid requirement IDs for validation
        const validRequirementIds = new Set(requirements.map((r) => r.id))

        // Map LLM results by requirementId
        const classificationMap = new Map<string, RawClassification>()
        for (const raw of rawClassifications) {
          if (raw.requirementId && validRequirementIds.has(raw.requirementId)) {
            classificationMap.set(raw.requirementId, raw)
          }
        }

        // Build certainties — auto-fill missing requirements as ambiguous
        const now = new Date().toISOString()
        const certainties: Omit<RequirementCertainty, 'confirmed' | 'confirmedAt'>[] =
          requirements.map((req) => {
            const raw = classificationMap.get(req.id)
            if (raw) {
              const level = VALID_CERTAINTY_LEVELS.has(raw.certaintyLevel ?? '')
                ? (raw.certaintyLevel as CertaintyLevel)
                : 'ambiguous'
              return {
                id: uuidv4(),
                requirementId: req.id,
                certaintyLevel: level,
                reason: (raw.reason ?? '').trim() || 'AI 未提供分级原因',
                suggestion: (raw.suggestion ?? '').trim() || (level === 'clear' ? '无需补充确认' : '建议向客户进一步确认该需求的具体要求'),
                createdAt: now,
                updatedAt: now,
              }
            }
            // Fallback for requirements missed by LLM
            return {
              id: uuidv4(),
              requirementId: req.id,
              certaintyLevel: 'ambiguous' as CertaintyLevel,
              reason: 'AI 未对该需求进行分级，默认标记为模糊',
              suggestion: '建议向客户进一步确认该需求的具体要求和验收标准',
              createdAt: now,
              updatedAt: now,
            }
          })

        // Persist to DB (transaction: delete old + insert new)
        throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
        await certaintyRepo.replaceByProject(projectId, certainties)

        // Write snapshot
        throwIfAborted(ctx.signal, 'Fog map generation task cancelled')
        const reqs = await requirementRepo.findByProject(projectId)
        await syncSnapshot(projectId, rootPath, certaintyRepo, reqs)

        ctx.updateProgress(100, '迷雾地图生成完成')
        logger.info(
          `Fog map generation complete for project ${projectId}: ${certainties.length} items classified`
        )
        return certainties
      })
      .catch((err) => {
        logger.error(`Fog map generation task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getFogMap(projectId: string): Promise<FogMapItem[] | null> {
    const certainties = await this.certaintyRepo.findByProject(projectId)
    if (certainties.length === 0) {
      // Check if generation was ever run by looking for snapshot
      const project = await this.projectRepo.findById(projectId)
      if (project.rootPath) {
        const snapshotPath = path.join(project.rootPath, 'tender', 'fog-map.json')
        try {
          await fs.access(snapshotPath)
          return [] // Generation ran but 0 items (shouldn't happen normally)
        } catch {
          // Snapshot doesn't exist — never generated
        }
      }
      return null
    }

    // JOIN with requirements
    const requirements = await this.requirementRepo.findByProject(projectId)
    const reqMap = new Map(requirements.map((r) => [r.id, r]))

    return certainties
      .map((cert) => {
        const req = reqMap.get(cert.requirementId)
        if (!req) return null
        return {
          ...cert,
          requirement: {
            id: req.id,
            sequenceNumber: req.sequenceNumber,
            description: req.description,
            sourcePages: req.sourcePages,
            category: req.category,
            priority: req.priority,
          },
        }
      })
      .filter((item): item is FogMapItem => item !== null)
  }

  async getSummary(projectId: string): Promise<FogMapSummary | null> {
    const certainties = await this.certaintyRepo.findByProject(projectId)
    if (certainties.length === 0) {
      // Check if ever generated
      const project = await this.projectRepo.findById(projectId)
      if (project.rootPath) {
        const snapshotPath = path.join(project.rootPath, 'tender', 'fog-map.json')
        try {
          await fs.access(snapshotPath)
          return {
            total: 0,
            clear: 0,
            ambiguous: 0,
            risky: 0,
            confirmed: 0,
            fogClearingPercentage: 100,
          }
        } catch {
          // Never generated
        }
      }
      return null
    }

    const total = certainties.length
    const clear = certainties.filter((c) => c.certaintyLevel === 'clear').length
    const ambiguous = certainties.filter((c) => c.certaintyLevel === 'ambiguous').length
    const risky = certainties.filter((c) => c.certaintyLevel === 'risky').length
    // Only count confirmed among non-clear items to avoid double-counting in fogClearingPercentage
    const confirmed = certainties.filter((c) => c.confirmed && c.certaintyLevel !== 'clear').length
    const fogClearingPercentage =
      total > 0 ? Math.round(((clear + confirmed) / total) * 100) : 0

    return { total, clear, ambiguous, risky, confirmed, fogClearingPercentage }
  }

  async confirmCertainty(id: string): Promise<RequirementCertainty> {
    const updated = await this.certaintyRepo.confirmItem(id)

    // Sync snapshot
    const projectId = await this.certaintyRepo.findProjectId(id)
    if (projectId) {
      const project = await this.projectRepo.findById(projectId)
      if (project.rootPath) {
        const requirements = await this.requirementRepo.findByProject(projectId)
        await syncSnapshot(projectId, project.rootPath, this.certaintyRepo, requirements)
      }
    }

    return updated
  }

  async batchConfirm(projectId: string): Promise<void> {
    await this.certaintyRepo.batchConfirm(projectId)

    // Sync snapshot
    const project = await this.projectRepo.findById(projectId)
    if (project.rootPath) {
      const requirements = await this.requirementRepo.findByProject(projectId)
      await syncSnapshot(projectId, project.rootPath, this.certaintyRepo, requirements)
    }
  }
}

async function syncSnapshot(
  projectId: string,
  rootPath: string,
  certaintyRepo: RequirementCertaintyRepository,
  requirements: Array<{
    id: string
    sequenceNumber: number
    description: string
    sourcePages: number[]
    category: string
    priority: string
  }>
): Promise<void> {
  try {
    const certainties = await certaintyRepo.findByProject(projectId)
    const reqMap = new Map(requirements.map((r) => [r.id, r]))

    const items = certainties
      .map((cert) => {
        const req = reqMap.get(cert.requirementId)
        if (!req) return null
        return {
          id: cert.id,
          requirementId: cert.requirementId,
          requirementSequenceNumber: req.sequenceNumber,
          requirementDescription: req.description,
          requirementCategory: req.category,
          sourcePages: req.sourcePages,
          priority: req.priority,
          certaintyLevel: cert.certaintyLevel,
          reason: cert.reason,
          suggestion: cert.suggestion,
          confirmed: cert.confirmed,
          confirmedAt: cert.confirmedAt,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const total = certainties.length
    const clear = certainties.filter((c) => c.certaintyLevel === 'clear').length
    const ambiguous = certainties.filter((c) => c.certaintyLevel === 'ambiguous').length
    const risky = certainties.filter((c) => c.certaintyLevel === 'risky').length
    // Only count confirmed among non-clear items to avoid double-counting in fogClearingPercentage
    const confirmed = certainties.filter((c) => c.confirmed && c.certaintyLevel !== 'clear').length
    const fogClearingPercentage =
      total > 0 ? Math.round(((clear + confirmed) / total) * 100) : 0

    const now = new Date().toISOString()
    const snapshot: FogMapSnapshot = {
      projectId,
      items,
      summary: { total, clear, ambiguous, risky, confirmed, fogClearingPercentage },
      generatedAt: now,
      updatedAt: now,
    }

    const snapshotPath = path.join(rootPath, 'tender', 'fog-map.json')
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
  } catch (err) {
    logger.warn(`Failed to sync fog map snapshot for project ${projectId}`, err)
  }
}
