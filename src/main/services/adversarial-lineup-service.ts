import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { isAbortError } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { StrategySeedRepository } from '@main/db/repositories/strategy-seed-repo'
import { AdversarialLineupRepository } from '@main/db/repositories/adversarial-lineup-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  AdversarialRole,
  AdversarialLineup,
  GenerateRolesInput,
  GenerateRolesTaskResult,
  UpdateLineupInput,
  ConfirmLineupInput,
  GeneratedAdversarialRoleDraft,
  AdversarialIntensity,
} from '@shared/adversarial-types'
import { DEFAULT_COMPLIANCE_ROLE, DEFAULT_FALLBACK_ROLES } from '@shared/adversarial-types'

const logger = createLogger('adversarial-lineup-service')

const POLL_INTERVAL_MS = 1_000
const GENERATION_TIMEOUT_MS = 5 * 60 * 1_000
const COMPLIANCE_NAME_PATTERNS = ['合规审查官', '合规审查角色', '合规审查']
const VALID_INTENSITIES: AdversarialIntensity[] = ['low', 'medium', 'high']
const MIN_TOTAL_ROLES = 3
const MAX_TOTAL_ROLES = 6
/** User edits: story requires at least 1 role (the protected compliance role) */
const MIN_ROLES_FOR_UPDATE = 1

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

function parseRolesResponse(content: string): GeneratedAdversarialRoleDraft[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.ADVERSARIAL_GENERATION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  if (Array.isArray(parsed)) {
    return parsed as GeneratedAdversarialRoleDraft[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of ['roles', 'adversarialRoles', 'adversarial_roles', 'results', 'items']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as GeneratedAdversarialRoleDraft[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.ADVERSARIAL_GENERATION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

/** Normalize LLM drafts into final AdversarialRole[] with guaranteed compliance role */
function normalizeDrafts(drafts: GeneratedAdversarialRoleDraft[]): AdversarialRole[] {
  // Filter out empty/invalid drafts
  const validDrafts = drafts.filter(
    (d) => d.name && d.name.trim().length > 0 && d.perspective && d.perspective.trim().length > 0
  )

  if (validDrafts.length === 0) {
    return buildDefaultRoles()
  }

  // Normalize intensity
  for (const draft of validDrafts) {
    if (!VALID_INTENSITIES.includes(draft.intensity)) {
      draft.intensity = 'medium'
    }
  }

  // Find compliance role
  let complianceIndex = -1

  // Strategy 1: Use isComplianceRole flag if exactly one is true
  const complianceFlags = validDrafts
    .map((d, i) => ({ index: i, flag: d.isComplianceRole === true }))
    .filter((x) => x.flag)

  if (complianceFlags.length === 1) {
    complianceIndex = complianceFlags[0].index
  } else {
    // Strategy 2: Match by name pattern
    for (let i = 0; i < validDrafts.length; i++) {
      if (COMPLIANCE_NAME_PATTERNS.some((p) => validDrafts[i].name.includes(p))) {
        complianceIndex = i
        break
      }
    }
  }

  // Build roles
  const roles: AdversarialRole[] = []
  let sortOrder = 0

  if (complianceIndex >= 0) {
    // Use matched compliance role
    const draft = validDrafts[complianceIndex]
    roles.push({
      id: uuidv4(),
      name: draft.name,
      perspective: draft.perspective,
      attackFocus: Array.isArray(draft.attackFocus) ? draft.attackFocus : [],
      intensity: draft.intensity,
      isProtected: true,
      description: draft.description ?? '',
      sortOrder: 0,
    })
    sortOrder = 1
  } else {
    // No compliance role found — inject default
    roles.push({
      id: uuidv4(),
      ...DEFAULT_COMPLIANCE_ROLE,
    })
    sortOrder = 1
  }

  // Add remaining roles
  for (let i = 0; i < validDrafts.length; i++) {
    if (i === complianceIndex) continue
    roles.push({
      id: uuidv4(),
      name: validDrafts[i].name,
      perspective: validDrafts[i].perspective,
      attackFocus: Array.isArray(validDrafts[i].attackFocus) ? validDrafts[i].attackFocus : [],
      intensity: validDrafts[i].intensity,
      isProtected: false,
      description: validDrafts[i].description ?? '',
      sortOrder: sortOrder++,
    })
  }

  // Enforce role count invariants: [MIN_TOTAL_ROLES, MAX_TOTAL_ROLES]
  if (roles.length > MAX_TOTAL_ROLES) {
    roles.length = MAX_TOTAL_ROLES
  }
  if (roles.length < MIN_TOTAL_ROLES) {
    const padCandidates = DEFAULT_FALLBACK_ROLES.filter(
      (fr) => !fr.isProtected && !roles.some((r) => r.name === fr.name)
    )
    for (const pad of padCandidates) {
      if (roles.length >= MIN_TOTAL_ROLES) break
      roles.push({ id: uuidv4(), ...pad, sortOrder: roles.length })
    }
  }

  return roles
}

function buildDefaultRoles(): AdversarialRole[] {
  return DEFAULT_FALLBACK_ROLES.map((role) => ({
    id: uuidv4(),
    ...role,
  }))
}

class AdversarialLineupService {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()
  private strategySeedRepo = new StrategySeedRepository()
  private lineupRepo = new AdversarialLineupRepository()

  async generate(input: GenerateRolesInput): Promise<GenerateRolesTaskResult> {
    const { projectId } = input

    // Pre-checks
    await this.projectRepo.findById(projectId) // throws NotFoundError if missing

    const requirements = await this.requirementRepo.findByProject(projectId)
    if (requirements.length === 0) {
      throw new ValidationError('请先完成需求抽取与评分标准提取后再生成对抗阵容')
    }

    const scoringModel = await this.scoringModelRepo.findByProject(projectId)
    if (!scoringModel) {
      throw new ValidationError('请先完成需求抽取与评分标准提取后再生成对抗阵容')
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

    const taskId = await taskQueue.enqueue({
      category: 'ai',
      input: { projectId },
    })

    const lineupRepo = this.lineupRepo
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在准备对抗角色生成...')

        // --- LLM call + parse (errors here trigger fallback) ---
        let roles: AdversarialRole[]
        let usedFallback = false

        try {
          ctx.updateProgress(10, '正在调用 AI 生成对抗角色阵容...')
          const agentResponse = await agentOrchestrator.execute({
            agentType: 'adversarial',
            context: {
              requirements: requirementsSummary,
              scoringCriteria,
              strategySeeds: seedsText,
              proposalType: project.proposalType ?? undefined,
              mandatoryItems: mandatoryText,
            },
          })

          const innerTaskId = agentResponse.taskId
          let agentResult: string | undefined
          const pollingStartedAt = Date.now()

          while (true) {
            if (Date.now() - pollingStartedAt >= GENERATION_TIMEOUT_MS) {
              throw new BidWiseError(
                ErrorCode.ADVERSARIAL_GENERATION_FAILED,
                'AI 对抗角色生成超时（超过 5 分钟），请重试'
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
                `AI 对抗角色生成失败: ${status.error?.message ?? '未知错误'}`
              )
            }

            if (status.status === 'cancelled') {
              throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI 对抗角色生成任务已取消')
            }

            const progressPct = Math.min(20 + status.progress * 0.6, 80)
            ctx.updateProgress(progressPct, '正在调用 AI 生成对抗角色阵容...')

            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          }

          if (!agentResult) {
            throw new BidWiseError(ErrorCode.ADVERSARIAL_GENERATION_FAILED, 'AI 返回结果为空')
          }

          ctx.updateProgress(85, 'AI 返回结果，正在解析和归一化...')
          const drafts = parseRolesResponse(agentResult)

          // Empty/invalid drafts = LLM returned nothing usable → treat as failure → fallback (AC4)
          const validDrafts = drafts.filter(
            (d) => d.name?.trim() && d.perspective?.trim()
          )
          if (validDrafts.length === 0) {
            throw new BidWiseError(
              ErrorCode.ADVERSARIAL_GENERATION_FAILED,
              'AI 返回的角色列表为空或全部无效'
            )
          }

          roles = normalizeDrafts(drafts)
        } catch (err) {
          // Re-throw abort/cancellation errors so task-queue handles them directly
          if (isAbortError(err)) throw err
          if (err instanceof BidWiseError && err.code === ErrorCode.TASK_CANCELLED) throw err

          // LLM / timeout / parse / empty-result failures → fallback (AC4)
          logger.warn(
            `Adversarial lineup LLM generation failed for project ${projectId}, falling back to defaults`,
            err
          )
          roles = buildDefaultRoles()
          usedFallback = true
        }

        // --- Persist (outside LLM try-catch — DB errors are real failures, not LLM issues) ---
        await lineupRepo.save({
          projectId,
          roles,
          status: 'generated',
          generationSource: usedFallback ? 'fallback' : 'llm',
          warningMessage: usedFallback ? 'AI 生成失败，已加载默认阵容，您可手动调整' : null,
        })

        if (usedFallback) {
          ctx.updateProgress(100, '已加载默认阵容')
          logger.info(`Fallback lineup saved for project ${projectId}`)
        } else {
          ctx.updateProgress(100, '对抗角色阵容生成完成')
          logger.info(
            `Adversarial lineup generation complete for project ${projectId}: ${roles.length} roles`
          )
        }
        return roles
      })
      .catch((err) => {
        logger.error(`Adversarial lineup task failed for project ${projectId}:`, err)
      })

    return { taskId }
  }

  async getLineup(projectId: string): Promise<AdversarialLineup | null> {
    return this.lineupRepo.findByProjectId(projectId)
  }

  async updateRoles(input: UpdateLineupInput): Promise<AdversarialLineup> {
    const lineup = await this.lineupRepo.findByProjectId(
      (await this.findLineupProjectId(input.lineupId)) ?? ''
    )

    if (!lineup) {
      throw new ValidationError('对抗阵容不存在')
    }

    if (lineup.status === 'confirmed') {
      throw new ValidationError('阵容已确认，不可继续编辑；请先重新生成')
    }

    // Validate protected roles not removed
    const existingProtectedIds = new Set(lineup.roles.filter((r) => r.isProtected).map((r) => r.id))
    const newProtectedIds = new Set(input.roles.filter((r) => r.isProtected).map((r) => r.id))
    for (const protectedId of existingProtectedIds) {
      if (!newProtectedIds.has(protectedId)) {
        throw new ValidationError('受保护角色不可删除')
      }
    }

    // Enforce role count bounds (story: at least 1 role — the protected compliance role)
    if (input.roles.length < MIN_ROLES_FOR_UPDATE) {
      throw new ValidationError(`阵容至少需要 ${MIN_ROLES_FOR_UPDATE} 个角色`)
    }
    if (input.roles.length > MAX_TOTAL_ROLES) {
      throw new ValidationError(`阵容最多允许 ${MAX_TOTAL_ROLES} 个角色`)
    }

    // Validate exactly one protected compliance role
    const protectedCount = input.roles.filter((r) => r.isProtected).length
    if (protectedCount !== 1) {
      throw new ValidationError('阵容必须包含且仅包含一个受保护的合规审查角色')
    }

    // Re-sort: protected role always gets 0, others get sequential 1..N
    let nextSort = 1
    const reindexed = input.roles.map((role) => ({
      ...role,
      sortOrder: role.isProtected ? 0 : nextSort++,
    }))

    return this.lineupRepo.update(input.lineupId, { roles: reindexed })
  }

  async confirmLineup(input: ConfirmLineupInput): Promise<AdversarialLineup> {
    return this.lineupRepo.update(input.lineupId, {
      status: 'confirmed',
      confirmedAt: new Date().toISOString(),
    })
  }

  private async findLineupProjectId(lineupId: string): Promise<string | null> {
    // We need to find the lineup to get the projectId
    // Since we only have lineupId, we query by id
    // The update method in repo already handles not-found
    const db = await import('@main/db/client')
    const row = await db
      .getDb()
      .selectFrom('adversarialLineups')
      .select('projectId')
      .where('id', '=', lineupId)
      .executeTakeFirst()
    return row?.projectId ?? null
  }
}

export const adversarialLineupService = new AdversarialLineupService()
