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
import { StrategySeedRepository } from '@main/db/repositories/strategy-seed-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  StrategySeed,
  StrategySeedStatus,
  StrategySeedSummary,
  StrategySeedSnapshot,
  GenerateSeedsResult,
} from '@shared/analysis-types'

const logger = createLogger('strategy-seed-generator')

const POLL_INTERVAL_MS = 1_000
const GENERATION_TIMEOUT_MS = 5 * 60 * 1_000

interface RawSeed {
  title?: string
  reasoning?: string
  suggestion?: string
  sourceExcerpt?: string
  confidence?: number
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

function parseSeedResponse(content: string): RawSeed[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.SEED_GENERATION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  if (Array.isArray(parsed)) {
    return parsed as RawSeed[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of ['seeds', 'strategySeeds', 'strategy_seeds', 'results', 'items']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawSeed[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.SEED_GENERATION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

export class StrategySeedGenerator {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()
  private seedRepo = new StrategySeedRepository()

  async generate(input: {
    projectId: string
    sourceMaterial: string
  }): Promise<GenerateSeedsResult> {
    const { projectId, sourceMaterial } = input

    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(ErrorCode.SEED_GENERATION_FAILED, `项目未设置存储路径: ${projectId}`)
    }

    // Load context for cross-reference (gracefully degrade if missing)
    const existingRequirements = await this.requirementRepo.findByProject(projectId).catch(() => [])
    const scoringModel = await this.scoringModelRepo.findByProject(projectId).catch(() => null)
    const mandatoryItems = await this.mandatoryItemRepo.findByProject(projectId).catch(() => [])

    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, rootPath: project.rootPath },
    })

    const seedRepo = this.seedRepo
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在构建策略种子生成提示词...')

        ctx.updateProgress(10, '正在调用 AI 分析沟通素材...')
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'seed',
          context: {
            sourceMaterial,
            existingRequirements: existingRequirements.map((r) => ({
              description: r.description,
              sourcePages: r.sourcePages,
            })),
            scoringModel: scoringModel
              ? {
                  criteria: scoringModel.criteria.map((c) => ({
                    category: c.category,
                    maxScore: c.maxScore,
                    weight: c.weight,
                  })),
                }
              : undefined,
            mandatoryItems: mandatoryItems.map((m) => ({ content: m.content })),
          },
        })

        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.SEED_GENERATION_FAILED,
              'AI 策略种子生成超时（超过 5 分钟），请重试'
            )
          }

          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.SEED_GENERATION_FAILED,
              `AI 策��种子生成失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 策略种子生成任务已取消')
          }

          const progressPct = Math.min(20 + status.progress * 0.6, 80)
          ctx.updateProgress(progressPct, '正在调用 AI 分析沟通素材...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        if (!agentResult) {
          throw new BidWiseError(ErrorCode.SEED_GENERATION_FAILED, 'AI 返回结果为空')
        }

        ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
        const rawSeeds = parseSeedResponse(agentResult)

        const now = new Date().toISOString()
        const seeds: StrategySeed[] = rawSeeds
          .map((raw) => ({
            id: uuidv4(),
            title: (raw.title ?? '').trim(),
            reasoning: (raw.reasoning ?? '').trim(),
            suggestion: (raw.suggestion ?? '').trim(),
            sourceExcerpt: (raw.sourceExcerpt ?? '').trim(),
            confidence:
              typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.5,
            status: 'pending' as StrategySeedStatus,
            createdAt: now,
            updatedAt: now,
          }))
          .filter(
            (seed) =>
              seed.title.length > 0 && seed.reasoning.length > 0 && seed.suggestion.length > 0
          )

        // Deduplicate by title
        const seenTitles = new Set<string>()
        const uniqueSeeds = seeds.filter((seed) => {
          if (seenTitles.has(seed.title)) return false
          seenTitles.add(seed.title)
          return true
        })

        await seedRepo.replaceByProject(projectId, uniqueSeeds)

        const snapshot: StrategySeedSnapshot = {
          projectId,
          sourceMaterial,
          seeds: uniqueSeeds,
          generatedAt: now,
          updatedAt: now,
        }
        const snapshotPath = path.join(rootPath, 'seed.json')
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

        ctx.updateProgress(100, '策略种子生成完成')
        logger.info(
          `Strategy seed generation complete for project ${projectId}: ${uniqueSeeds.length} seeds found`
        )
        return uniqueSeeds
      })
      .catch((err) => {
        logger.error(`Strategy seed generation task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getSeeds(projectId: string): Promise<StrategySeed[] | null> {
    const seeds = await this.seedRepo.findByProject(projectId)
    if (seeds.length > 0) {
      return seeds
    }

    // Check if generation was ever run by looking for snapshot
    const project = await this.projectRepo.findById(projectId)
    if (project.rootPath) {
      const snapshotPath = path.join(project.rootPath, 'seed.json')
      try {
        await fs.access(snapshotPath)
        return [] // Generation ran but found 0 seeds
      } catch {
        // Snapshot doesn't exist — never run
      }
    }

    return null // Never executed
  }

  async getSummary(projectId: string): Promise<StrategySeedSummary | null> {
    const seeds = await this.getSeeds(projectId)
    if (seeds === null) return null

    return {
      total: seeds.length,
      confirmed: seeds.filter((s) => s.status === 'confirmed').length,
      adjusted: seeds.filter((s) => s.status === 'adjusted').length,
      pending: seeds.filter((s) => s.status === 'pending').length,
    }
  }

  async updateSeed(
    id: string,
    patch: Partial<Pick<StrategySeed, 'title' | 'reasoning' | 'suggestion' | 'status'>>
  ): Promise<StrategySeed> {
    // Auto-set status to 'adjusted' if content fields changed and status not explicitly set
    const contentChanged =
      patch.title !== undefined || patch.reasoning !== undefined || patch.suggestion !== undefined
    if (contentChanged && patch.status === undefined) {
      patch = { ...patch, status: 'adjusted' }
    }

    // Check title duplication if title is being changed
    if (patch.title) {
      const projectId = await this.seedRepo.findProjectId(id)
      if (projectId) {
        const exists = await this.seedRepo.titleExists(projectId, patch.title, id)
        if (exists) {
          throw new BidWiseError(ErrorCode.DUPLICATE, `该策略种子标题已存在: ${patch.title}`)
        }
      }
    }

    const updated = await this.seedRepo.update(id, patch)
    await this.syncSnapshotForSeed(id)
    return updated
  }

  async deleteSeed(id: string): Promise<void> {
    const projectId = await this.seedRepo.findProjectId(id)
    await this.seedRepo.delete(id)
    if (projectId) {
      await this.syncSnapshotForProject(projectId)
    }
  }

  async addSeed(input: {
    projectId: string
    title: string
    reasoning: string
    suggestion: string
  }): Promise<StrategySeed> {
    const now = new Date().toISOString()
    const trimmedTitle = input.title.trim()

    const exists = await this.seedRepo.titleExists(input.projectId, trimmedTitle)
    if (exists) {
      throw new BidWiseError(ErrorCode.DUPLICATE, `该策略种子标题已存在: ${trimmedTitle}`)
    }

    const seed: StrategySeed = {
      id: uuidv4(),
      title: trimmedTitle,
      reasoning: input.reasoning.trim(),
      suggestion: input.suggestion.trim(),
      sourceExcerpt: '',
      confidence: 1.0,
      status: 'confirmed',
      createdAt: now,
      updatedAt: now,
    }

    await this.seedRepo.replaceByProject(input.projectId, [
      ...(await this.seedRepo.findByProject(input.projectId)),
      seed,
    ])

    await this.syncSnapshotForProject(input.projectId)
    return seed
  }

  private async syncSnapshotForSeed(seedId: string): Promise<void> {
    const projectId = await this.seedRepo.findProjectId(seedId)
    if (projectId) {
      await this.syncSnapshotForProject(projectId)
    }
  }

  private async syncSnapshotForProject(projectId: string): Promise<void> {
    try {
      const project = await this.projectRepo.findById(projectId)
      if (!project.rootPath) return

      const seeds = await this.seedRepo.findByProject(projectId)
      const snapshotPath = path.join(project.rootPath, 'seed.json')

      // Try to read existing snapshot to preserve sourceMaterial
      let sourceMaterial = ''
      try {
        const existing = JSON.parse(
          await fs.readFile(snapshotPath, 'utf-8')
        ) as StrategySeedSnapshot
        sourceMaterial = existing.sourceMaterial ?? ''
      } catch {
        // No existing snapshot
      }

      const now = new Date().toISOString()
      const snapshot: StrategySeedSnapshot = {
        projectId,
        sourceMaterial,
        seeds,
        generatedAt: now,
        updatedAt: now,
      }
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`Failed to sync strategy seed snapshot for project ${projectId}`, err)
    }
  }
}
