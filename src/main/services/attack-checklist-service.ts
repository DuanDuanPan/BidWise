import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { StrategySeedRepository } from '@main/db/repositories/strategy-seed-repo'
import { AttackChecklistRepository } from '@main/db/repositories/attack-checklist-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import { documentService } from '@main/services/document-service'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  AttackChecklist,
  AttackChecklistItem,
  AttackChecklistItemStatus,
  AttackChecklistItemSeverity,
  AttackChecklistLLMOutput,
} from '@shared/attack-checklist-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'

const logger = createLogger('attack-checklist-service')

const POLL_INTERVAL_MS = 1_000
const GENERATION_TIMEOUT_MS = 2 * 60 * 1_000

const SEVERITY_WEIGHT: Record<string, number> = { critical: 0, major: 1, minor: 2 }
const VALID_SEVERITIES: AttackChecklistItemSeverity[] = ['critical', 'major', 'minor']

const DEFAULT_FALLBACK_CHECKLIST: AttackChecklistLLMOutput = [
  {
    category: '合规性',
    attackAngle: '*项/必须响应项是否全部明确覆盖？评标时遗漏一条即可能废标',
    severity: 'critical',
    defenseSuggestion: '逐条检查*项覆盖矩阵，确保每条有对应方案章节',
  },
  {
    category: '技术方案',
    attackAngle: '技术架构选型是否有充分论证？竞对可能采用更先进的架构方案',
    severity: 'major',
    defenseSuggestion: '在架构设计章节增加选型对比分析和决策依据',
    targetSection: '系统架构设计',
  },
  {
    category: '实施计划',
    attackAngle: '实施工期是否过于乐观？历史项目平均超期比例较高',
    severity: 'major',
    defenseSuggestion: '提供详细里程碑计划并引用类似项目交付经验',
    targetSection: '项目实施计划',
  },
  {
    category: '成本',
    attackAngle: '报价依据是否充分？缺少明细分解的报价容易被质疑',
    severity: 'major',
    defenseSuggestion: '提供清晰的成本构成分解和计算依据',
  },
  {
    category: '团队',
    attackAngle: '项目团队配置是否合理？关键岗位资质证明是否充分',
    severity: 'minor',
    defenseSuggestion: '列出团队成员资质和类似项目经验',
  },
  {
    category: '运维',
    attackAngle: '运维方案复杂度是否超出客户实际能力？',
    severity: 'minor',
    defenseSuggestion: '提供运维培训计划和自动化运维工具说明',
  },
  {
    category: '差异化',
    attackAngle: '方案是否有足够的差异化亮点？避免与竞对方案同质化',
    severity: 'major',
    defenseSuggestion: '在方案中突出独特价值主张和竞争优势',
  },
]

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

function parseChecklistResponse(content: string): AttackChecklistLLMOutput {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.ADVERSARIAL_GENERATION_FAILED,
      `攻击清单 JSON 解析失败: ${(err as Error).message}`
    )
  }

  if (Array.isArray(parsed)) {
    return parsed as AttackChecklistLLMOutput
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of ['items', 'checklist', 'attacks', 'results']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as AttackChecklistLLMOutput
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.ADVERSARIAL_GENERATION_FAILED,
    '攻击清单 LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

function resolveSectionLocator(
  targetSection: string | undefined,
  sectionIndex: ProposalSectionIndexEntry[] | undefined
): { targetSection: string | null; targetSectionLocator: ChapterHeadingLocator | null } {
  if (!targetSection) {
    return { targetSection: null, targetSectionLocator: null }
  }

  if (!sectionIndex || sectionIndex.length === 0) {
    return { targetSection, targetSectionLocator: null }
  }

  // Try exact match first, then substring match
  const normalizedTarget = targetSection.trim().toLowerCase()
  let match = sectionIndex.find((s) => s.title.trim().toLowerCase() === normalizedTarget)

  if (!match) {
    match = sectionIndex.find(
      (s) =>
        s.title.trim().toLowerCase().includes(normalizedTarget) ||
        normalizedTarget.includes(s.title.trim().toLowerCase())
    )
  }

  if (match) {
    // Count occurrences of same title before this entry to determine occurrenceIndex
    const occurrenceIndex = sectionIndex
      .slice(0, sectionIndex.indexOf(match))
      .filter((s) => s.title === match!.title).length

    return {
      targetSection,
      targetSectionLocator: {
        title: match.title,
        level: match.level,
        occurrenceIndex,
      },
    }
  }

  return { targetSection, targetSectionLocator: null }
}

function normalizeItems(
  raw: AttackChecklistLLMOutput,
  checklistId: string,
  sectionIndex: ProposalSectionIndexEntry[] | undefined
): Omit<AttackChecklistItem, 'createdAt' | 'updatedAt'>[] {
  const validItems = raw.filter(
    (item) =>
      item.attackAngle &&
      item.attackAngle.trim().length > 0 &&
      item.category &&
      item.category.trim()
  )

  if (validItems.length === 0) {
    throw new BidWiseError(ErrorCode.ADVERSARIAL_GENERATION_FAILED, '攻击清单条目全部无效或为空')
  }

  // Normalize severity + resolve section locators
  const normalized = validItems.map((item) => {
    const severity = VALID_SEVERITIES.includes(item.severity as AttackChecklistItemSeverity)
      ? (item.severity as AttackChecklistItemSeverity)
      : 'major'

    const { targetSection, targetSectionLocator } = resolveSectionLocator(
      item.targetSection,
      sectionIndex
    )

    return {
      id: uuidv4(),
      checklistId,
      category: item.category.trim(),
      attackAngle: item.attackAngle.trim(),
      severity,
      defenseSuggestion: (item.defenseSuggestion || '').trim(),
      targetSection,
      targetSectionLocator,
      status: 'unaddressed' as const,
      severityWeight: SEVERITY_WEIGHT[severity] ?? 1,
    }
  })

  // Sort by severity weight (critical first), then by original order
  normalized.sort((a, b) => a.severityWeight - b.severityWeight)

  return normalized.map((item, index) => ({
    id: item.id,
    checklistId: item.checklistId,
    category: item.category,
    attackAngle: item.attackAngle,
    severity: item.severity,
    defenseSuggestion: item.defenseSuggestion,
    targetSection: item.targetSection,
    targetSectionLocator: item.targetSectionLocator,
    status: item.status,
    sortOrder: index,
  }))
}

class AttackChecklistService {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()
  private strategySeedRepo = new StrategySeedRepository()
  private checklistRepo = new AttackChecklistRepository()

  async generate(projectId: string): Promise<{ taskId: string }> {
    // Pre-checks
    await this.projectRepo.findById(projectId)

    const requirements = await this.requirementRepo.findByProject(projectId)
    if (requirements.length === 0) {
      throw new ValidationError('请先完成需求抽取后再生成攻击清单')
    }

    const scoringModel = await this.scoringModelRepo.findByProject(projectId)
    if (!scoringModel) {
      throw new ValidationError('请先完成评分标准提取后再生成攻击清单')
    }

    // Optional context
    const mandatoryItems = await this.mandatoryItemRepo.findByProject(projectId).catch(() => [])
    const allSeeds = await this.strategySeedRepo.findByProject(projectId).catch(() => [])
    const project = await this.projectRepo.findById(projectId)

    // Prefer confirmed/adjusted seeds, fallback to pending
    let seeds = allSeeds.filter((s) => s.status === 'confirmed' || s.status === 'adjusted')
    if (seeds.length === 0) {
      seeds = allSeeds.filter((s) => s.status === 'pending').slice(0, 5)
    }

    // Load section index for targetSection resolution
    let sectionIndex: ProposalSectionIndexEntry[] | undefined
    try {
      const meta = await documentService.getMetadata(projectId)
      sectionIndex = meta.sectionIndex
    } catch {
      logger.warn(
        `Failed to load sectionIndex for project ${projectId}, targetSection locators will be text-only`
      )
    }

    const requirementsSummary = requirements.map((r, i) => `${i + 1}. ${r.description}`).join('\n')

    const scoringCriteria = scoringModel.criteria
      .map((c) => `- ${c.category}（${c.maxScore}分，权重${c.weight}）`)
      .join('\n')

    const confirmedMandatory = mandatoryItems.filter((m) => m.status === 'confirmed')
    const mandatoryText =
      confirmedMandatory.length > 0
        ? confirmedMandatory.map((m) => `- ${m.content}`).join('\n')
        : undefined

    const seedsText =
      seeds.length > 0 ? seeds.map((s) => `- ${s.title}: ${s.suggestion}`).join('\n') : undefined

    // Prepare checklist record (upsert: keep parent, clear old items)
    const existingChecklist = await this.checklistRepo.findByProjectId(projectId)
    let checklistId: string

    if (existingChecklist) {
      checklistId = existingChecklist.id
      await this.checklistRepo.deleteItemsByChecklistId(checklistId)
      await this.checklistRepo.updateChecklistStatus(checklistId, 'generating')
    } else {
      const saved = await this.checklistRepo.saveChecklist({
        projectId,
        status: 'generating',
        generationSource: 'llm',
      })
      checklistId = saved.id
    }

    const taskId = await taskQueue.enqueue({
      category: 'ai',
      input: { projectId },
    })

    const checklistRepo = this.checklistRepo
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        throwIfAborted(ctx.signal, 'Attack checklist generation cancelled')
        ctx.updateProgress(5, '正在准备攻击清单生成...')

        let llmItems: AttackChecklistLLMOutput
        let usedFallback = false

        try {
          throwIfAborted(ctx.signal, 'Attack checklist generation cancelled')
          ctx.updateProgress(10, '正在调用 AI 生成攻击清单...')

          const agentResponse = await agentOrchestrator.execute({
            agentType: 'attack-checklist',
            context: {
              requirements: requirementsSummary,
              scoringCriteria,
              mandatoryItems: mandatoryText,
              strategySeed: seedsText,
              proposalType: project.proposalType ?? undefined,
              industry: project.industry ?? undefined,
            },
          })

          const innerTaskId = agentResponse.taskId
          let agentResult: string | undefined
          const pollingStartedAt = Date.now()

          while (true) {
            throwIfAborted(ctx.signal, 'Attack checklist generation cancelled')

            if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
              throw new BidWiseError(
                ErrorCode.ADVERSARIAL_GENERATION_FAILED,
                'AI 攻击清单生成超时，请重试'
              )
            }

            const status = await agentOrchestrator.getAgentStatus(innerTaskId)

            if (status.status === 'completed') {
              agentResult = status.result?.content
              break
            }

            if (status.status === 'failed') {
              throw new BidWiseError(
                ErrorCode.ADVERSARIAL_GENERATION_FAILED,
                `AI 攻击清单生成失败: ${status.error?.message ?? '未知错误'}`
              )
            }

            if (status.status === 'cancelled') {
              throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 攻击清单生成任务已取消')
            }

            const progressPct = Math.min(20 + status.progress * 0.6, 80)
            ctx.updateProgress(progressPct, '正在调用 AI 生成攻击清单...')

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          }

          throwIfAborted(ctx.signal, 'Attack checklist generation cancelled')
          if (!agentResult) {
            throw new BidWiseError(ErrorCode.ADVERSARIAL_GENERATION_FAILED, 'AI 返回结果为空')
          }

          ctx.updateProgress(85, 'AI 返回结果，正在解析攻击清单...')
          llmItems = parseChecklistResponse(agentResult)

          const validItems = llmItems.filter((i) => i.attackAngle?.trim() && i.category?.trim())
          if (validItems.length === 0) {
            throw new BidWiseError(
              ErrorCode.ADVERSARIAL_GENERATION_FAILED,
              'AI 返回的攻击清单条目全部无效'
            )
          }
        } catch (err) {
          if (isAbortError(err)) throw err
          if (err instanceof BidWiseError && err.code === ErrorCode.TASK_CANCELLED) throw err

          logger.warn(
            `Attack checklist LLM generation failed for project ${projectId}, falling back to defaults`,
            err
          )
          llmItems = DEFAULT_FALLBACK_CHECKLIST
          usedFallback = true
        }

        // Persist items
        throwIfAborted(ctx.signal, 'Attack checklist generation cancelled')
        ctx.updateProgress(90, '正在保存攻击清单...')

        const normalizedItems = normalizeItems(llmItems, checklistId, sectionIndex)

        await checklistRepo.saveItems(
          normalizedItems.map((item) => ({
            ...item,
            status: 'unaddressed',
          }))
        )

        // Update checklist status and generation source
        if (usedFallback) {
          await checklistRepo.saveChecklist({
            projectId,
            status: 'generated',
            generationSource: 'fallback',
            warningMessage: 'AI 生成失败，已使用通用攻击清单',
            generatedAt: new Date().toISOString(),
          })
          ctx.updateProgress(100, '已使用通用攻击清单')
          logger.info(`Fallback attack checklist saved for project ${projectId}`)
        } else {
          await checklistRepo.saveChecklist({
            projectId,
            status: 'generated',
            generationSource: 'llm',
            warningMessage: null,
            generatedAt: new Date().toISOString(),
          })
          ctx.updateProgress(100, '攻击清单生成完成')
          logger.info(
            `Attack checklist generation complete for project ${projectId}: ${normalizedItems.length} items`
          )
        }

        return normalizedItems
      })
      .catch((err) => {
        logger.error(`Attack checklist task failed for project ${projectId}:`, err)
        checklistRepo
          .updateChecklistStatus(checklistId, 'failed', '攻击清单生成失败')
          .catch((e) => logger.error('Failed to update checklist status to failed:', e))
      })

    return { taskId }
  }

  async getChecklist(projectId: string): Promise<AttackChecklist | null> {
    return this.checklistRepo.findByProjectId(projectId)
  }

  async updateItemStatus(
    itemId: string,
    status: AttackChecklistItemStatus
  ): Promise<AttackChecklistItem> {
    return this.checklistRepo.updateItemStatus(itemId, status)
  }
}

export const attackChecklistService = new AttackChecklistService()
