import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { ErrorCode } from '@shared/constants'
import { AdversarialReviewRepository } from '@main/db/repositories/adversarial-review-repo'
import { AdversarialLineupRepository } from '@main/db/repositories/adversarial-lineup-repo'
import { ScoringModelRepository } from '@main/db/repositories/scoring-model-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { documentService } from '@main/services/document-service'
import { aiProxy } from '@main/services/ai-proxy'
import { taskQueue } from '@main/services/task-queue'
import { buildAdversarialReviewPrompt } from '@main/prompts/adversarial-review.prompt'
import {
  buildContradictionDetectionPrompt,
  type ContradictionPair,
  type FindingSummary,
} from '@main/prompts/contradiction-detection.prompt'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  AdversarialReviewSession,
  AdversarialFinding,
  RoleReviewResult,
  HandleFindingAction,
  FindingSeverity,
  AdversarialRole,
} from '@shared/adversarial-types'
import type { ProposalSectionIndexEntry } from '@shared/template-types'
import type { ChapterHeadingLocator } from '@shared/chapter-types'

const logger = createLogger('adversarial-review-service')

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
}
const VALID_SEVERITIES: FindingSeverity[] = ['critical', 'major', 'minor']

/** Extract JSON from a string that may be wrapped in markdown code fences */
function extractJsonFromResponse(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  return text.trim()
}

interface RawFinding {
  severity?: string
  sectionRef?: string | null
  content?: string
  suggestion?: string | null
  reasoning?: string | null
}

function parseFindings(content: string): RawFinding[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    logger.warn('Failed to parse findings JSON, returning empty array')
    return []
  }

  if (Array.isArray(parsed)) return parsed as RawFinding[]

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    for (const key of ['findings', 'results', 'items', 'attacks']) {
      if (Array.isArray(obj[key])) return obj[key] as RawFinding[]
    }
  }

  return []
}

function parseContradictions(content: string): ContradictionPair[] {
  const jsonStr = extractJsonFromResponse(content)
  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) return parsed as ContradictionPair[]
  } catch {
    logger.warn('Failed to parse contradictions JSON, returning empty array')
  }
  return []
}

function resolveSectionLocator(
  sectionRef: string | null,
  sectionIndex?: ProposalSectionIndexEntry[]
): ChapterHeadingLocator | null {
  if (!sectionRef || !sectionIndex || sectionIndex.length === 0) return null

  // Try exact title match
  const entry = sectionIndex.find(
    (s) => s.title === sectionRef || s.title.includes(sectionRef) || sectionRef.includes(s.title)
  )

  if (entry) return entry.headingLocator

  return null
}

class AdversarialReviewService {
  private reviewRepo = new AdversarialReviewRepository()
  private lineupRepo = new AdversarialLineupRepository()
  private scoringModelRepo = new ScoringModelRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()

  async startExecution(projectId: string): Promise<{ taskId: string }> {
    // Validate preconditions
    const lineup = await this.lineupRepo.findByProjectId(projectId)
    if (!lineup || lineup.status !== 'confirmed') {
      throw new ValidationError('请先确认对抗阵容后再启动评审')
    }

    // Validate proposal exists
    let proposal: { content: string }
    try {
      proposal = await documentService.load(projectId)
    } catch {
      throw new ValidationError('方案内容为空，请先编写方案')
    }

    if (!proposal.content || proposal.content.trim().length === 0) {
      throw new ValidationError('方案内容为空，请先编写方案')
    }

    // Enqueue the outer task
    const taskId = await taskQueue.enqueue({
      category: 'ai',
      input: { projectId },
    })

    const reviewRepo = this.reviewRepo
    const lineupRepo = this.lineupRepo
    const scoringModelRepo = this.scoringModelRepo
    const mandatoryItemRepo = this.mandatoryItemRepo

    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        throwIfAborted(ctx.signal, 'Adversarial review task cancelled')
        ctx.updateProgress(5, '准备评审上下文…')

        // Load context
        const doc = await documentService.load(projectId)
        const metadata = await documentService.getMetadata(projectId)
        const sectionIndex = metadata.sectionIndex

        const currentLineup = await lineupRepo.findByProjectId(projectId)
        if (!currentLineup || currentLineup.status !== 'confirmed') {
          throw new ValidationError('阵容状态已变更，请重新确认阵容')
        }

        // Load scoring criteria and mandatory items
        const scoringModel = await scoringModelRepo.findByProject(projectId).catch(() => null)
        const mandatoryItems = await mandatoryItemRepo.findByProject(projectId).catch(() => [])
        const confirmedMandatory = mandatoryItems.filter((m) => m.status === 'confirmed')

        const scoringCriteria = scoringModel
          ? scoringModel.criteria
              .map((c) => `- ${c.category}（${c.maxScore}分，权重${c.weight}）`)
              .join('\n')
          : undefined

        const mandatoryText =
          confirmedMandatory.length > 0
            ? confirmedMandatory.map((m) => `- ${m.content}`).join('\n')
            : undefined

        const roles = currentLineup.roles
        const sessionId = uuidv4()

        // Initialize roleResults
        const roleResults: RoleReviewResult[] = roles.map((r) => ({
          roleId: r.id,
          roleName: r.name,
          status: 'pending' as const,
          findingCount: 0,
        }))

        // Upsert session as running
        await reviewRepo.saveSession({
          id: sessionId,
          projectId,
          lineupId: currentLineup.id,
          status: 'running',
          roleResults,
          startedAt: new Date().toISOString(),
        })

        throwIfAborted(ctx.signal, 'Adversarial review task cancelled')
        ctx.updateProgress(10, `开始对 ${roles.length} 个角色并行评审…`)

        // Build AI requests for all roles
        const rolePromises = roles.map(async (role, index) => {
          // Mark role as running
          roleResults[index].status = 'running'
          await reviewRepo.updateSessionStatus(sessionId, 'running', roleResults)

          const startTime = Date.now()
          try {
            const { prompt, temperature, maxTokens } = buildAdversarialReviewPrompt({
              roleName: role.name,
              rolePerspective: role.perspective,
              attackFocus: role.attackFocus,
              intensity: role.intensity,
              roleDescription: role.description,
              proposalContent: doc.content,
              scoringCriteria,
              mandatoryItems: mandatoryText,
            })

            const response = await aiProxy.call({
              messages: [
                {
                  role: 'system',
                  content:
                    '你是一位资深投标评审专家，正在以指定角色对投标方案进行对抗性攻击审查。请严格按照 JSON 数组格式输出审查发现，不要添加任何额外文字。',
                },
                { role: 'user', content: prompt },
              ],
              maxTokens,
              temperature,
              caller: `adversarial-review-${role.id}`,
              signal: ctx.signal,
            })

            const latencyMs = Date.now() - startTime
            const rawFindings = parseFindings(response.content)

            roleResults[index].status = 'success'
            roleResults[index].findingCount = rawFindings.length
            roleResults[index].latencyMs = latencyMs

            return { role, rawFindings, success: true as const }
          } catch (err) {
            if (isAbortError(err)) throw err

            const latencyMs = Date.now() - startTime
            roleResults[index].status = 'failed'
            roleResults[index].error = err instanceof Error ? err.message : '未知错误'
            roleResults[index].latencyMs = latencyMs

            logger.warn(`Role ${role.name} review failed:`, err)
            return { role, rawFindings: [] as RawFinding[], success: false as const }
          }
        })

        // Execute all roles in parallel
        const results = await Promise.allSettled(rolePromises)

        // Update progress per role completion
        for (let i = 0; i < results.length; i++) {
          const pct = 10 + Math.round(((i + 1) / roles.length) * 70)
          ctx.updateProgress(pct, `角色 ${i + 1}/${roles.length} 完成…`)
        }

        // Collect successful results
        const successResults: Array<{
          role: AdversarialRole
          rawFindings: RawFinding[]
        }> = []

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            successResults.push(result.value)
          }
        }

        const allFailed = successResults.length === 0

        // Handle all-failed case
        if (allFailed) {
          await reviewRepo.updateSessionStatus(
            sessionId,
            'failed',
            roleResults,
            new Date().toISOString()
          )
          throw new BidWiseError(
            ErrorCode.ADVERSARIAL_GENERATION_FAILED,
            '所有角色评审均失败，请检查 AI 配置后重试'
          )
        }

        throwIfAborted(ctx.signal, 'Adversarial review task cancelled')
        ctx.updateProgress(85, '整理评审结果…')

        // Normalize and build findings
        let sortOrder = 0
        const allFindings: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[] = []

        // First pass: collect findings per role, preserving original order
        const roleFindings: Array<{
          role: AdversarialRole
          findings: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[]
        }> = []

        for (const { role, rawFindings } of successResults) {
          const normalized: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[] = []

          for (const raw of rawFindings) {
            if (!raw.content || raw.content.trim().length === 0) continue

            const severity: FindingSeverity = VALID_SEVERITIES.includes(
              raw.severity as FindingSeverity
            )
              ? (raw.severity as FindingSeverity)
              : 'major'

            const sectionRef = raw.sectionRef ?? null
            const sectionLocator = resolveSectionLocator(sectionRef, sectionIndex)

            normalized.push({
              id: uuidv4(),
              sessionId,
              roleId: role.id,
              roleName: role.name,
              severity,
              sectionRef,
              sectionLocator,
              content: raw.content.trim(),
              suggestion: raw.suggestion?.trim() || null,
              reasoning: raw.reasoning?.trim() || null,
              status: 'pending',
              rebuttalReason: null,
              contradictionGroupId: null,
              sortOrder: 0, // will be assigned after sorting
            })
          }

          roleFindings.push({ role, findings: normalized })
        }

        // Sort: severity weight → role.sortOrder → original order
        const sortableFindings: Array<{
          finding: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>
          severityWeight: number
          roleSortOrder: number
          originalIndex: number
        }> = []

        for (const { role, findings } of roleFindings) {
          for (let i = 0; i < findings.length; i++) {
            sortableFindings.push({
              finding: findings[i],
              severityWeight: SEVERITY_WEIGHT[findings[i].severity],
              roleSortOrder: role.sortOrder,
              originalIndex: i,
            })
          }
        }

        sortableFindings.sort((a, b) => {
          if (a.severityWeight !== b.severityWeight) return a.severityWeight - b.severityWeight
          if (a.roleSortOrder !== b.roleSortOrder) return a.roleSortOrder - b.roleSortOrder
          return a.originalIndex - b.originalIndex
        })

        for (const item of sortableFindings) {
          item.finding.sortOrder = sortOrder++
          allFindings.push(item.finding)
        }

        // Contradiction detection
        ctx.updateProgress(90, '矛盾检测中…')

        const uniqueRoleIds = new Set(allFindings.map((f) => f.roleId))
        if (uniqueRoleIds.size >= 2 && allFindings.length >= 2) {
          try {
            throwIfAborted(ctx.signal, 'Adversarial review task cancelled')

            const summaries: FindingSummary[] = allFindings.map((f) => ({
              id: f.id,
              roleId: f.roleId,
              roleName: f.roleName,
              content: f.content,
              sectionRef: f.sectionRef,
            }))

            const { prompt, temperature, maxTokens } = buildContradictionDetectionPrompt({
              findings: summaries,
            })

            const response = await aiProxy.call({
              messages: [
                {
                  role: 'system',
                  content:
                    '你是一位分析师，负责识别不同评审角色之间的矛盾观点。请严格按照 JSON 数组格式输出，不要添加任何额外文字。',
                },
                { role: 'user', content: prompt },
              ],
              maxTokens,
              temperature,
              caller: 'contradiction-detection',
              signal: ctx.signal,
            })

            const pairs = parseContradictions(response.content)
            const findingMap = new Map(allFindings.map((f) => [f.id, f]))
            let groupCounter = 0

            for (const pair of pairs) {
              const a = findingMap.get(pair.findingIdA)
              const b = findingMap.get(pair.findingIdB)
              if (a && b) {
                const groupId = `contradiction-${++groupCounter}`
                a.contradictionGroupId = groupId
                b.contradictionGroupId = groupId
              }
            }
          } catch (err) {
            if (isAbortError(err)) throw err
            // Contradiction detection failure is non-fatal
            logger.warn('Contradiction detection failed, skipping:', err)
          }
        }

        throwIfAborted(ctx.signal, 'Adversarial review task cancelled')

        // Delete old findings and persist new ones
        const existingSession = await reviewRepo.findSessionByProjectId(projectId)
        if (existingSession) {
          await reviewRepo.deleteFindingsBySessionId(existingSession.id)
        }

        // Determine final status
        const failedRoles = roleResults.filter((r) => r.status === 'failed')
        const finalStatus = failedRoles.length > 0 ? 'partial' : 'completed'

        await reviewRepo.updateSessionStatus(
          sessionId,
          finalStatus,
          roleResults,
          new Date().toISOString()
        )

        if (allFindings.length > 0) {
          await reviewRepo.saveFindings(allFindings)
        }

        ctx.updateProgress(100, '评审完成')
        logger.info(
          `Adversarial review complete for project ${projectId}: ${allFindings.length} findings, status=${finalStatus}`
        )

        return { findingsCount: allFindings.length, status: finalStatus }
      })
      .catch((err) => {
        logger.error(`Adversarial review task failed for project ${projectId}:`, err)
      })

    return { taskId }
  }

  async getReview(projectId: string): Promise<AdversarialReviewSession | null> {
    return this.reviewRepo.findSessionByProjectId(projectId)
  }

  async handleFinding(
    findingId: string,
    action: HandleFindingAction,
    rebuttalReason?: string
  ): Promise<AdversarialFinding> {
    if (action === 'rejected') {
      const trimmed = rebuttalReason?.trim()
      if (!trimmed) {
        throw new ValidationError('反驳理由不能为空')
      }
      return this.reviewRepo.updateFinding(findingId, {
        status: 'rejected',
        rebuttalReason: trimmed,
      })
    }

    // For accepted and needs-decision, clear any existing rebuttalReason
    return this.reviewRepo.updateFinding(findingId, {
      status: action,
      rebuttalReason: null,
    })
  }

  async retryRole(projectId: string, roleId: string): Promise<{ taskId: string }> {
    const session = await this.reviewRepo.findSessionByProjectId(projectId)
    if (!session) {
      throw new ValidationError('评审会话不存在')
    }

    const roleResult = session.roleResults.find((r) => r.roleId === roleId)
    if (!roleResult || roleResult.status !== 'failed') {
      throw new ValidationError('该角色未处于失败状态，无法重试')
    }

    const lineup = await this.lineupRepo.findByProjectId(projectId)
    if (!lineup) {
      throw new ValidationError('对抗阵容不存在')
    }

    const role = lineup.roles.find((r) => r.id === roleId)
    if (!role) {
      throw new ValidationError('角色不存在于阵容中')
    }

    const taskId = await taskQueue.enqueue({
      category: 'ai',
      input: { projectId, roleId },
    })

    const reviewRepo = this.reviewRepo
    const scoringModelRepo = this.scoringModelRepo
    const mandatoryItemRepo = this.mandatoryItemRepo

    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        throwIfAborted(ctx.signal, 'Adversarial retry task cancelled')
        ctx.updateProgress(10, `正在重试角色「${role.name}」…`)

        // Load context
        const doc = await documentService.load(projectId)
        const metadata = await documentService.getMetadata(projectId)
        const sectionIndex = metadata.sectionIndex

        const scoringModel = await scoringModelRepo.findByProject(projectId).catch(() => null)
        const mandatoryItems = await mandatoryItemRepo.findByProject(projectId).catch(() => [])
        const confirmedMandatory = mandatoryItems.filter((m) => m.status === 'confirmed')

        const scoringCriteria = scoringModel
          ? scoringModel.criteria
              .map((c) => `- ${c.category}（${c.maxScore}分，权重${c.weight}）`)
              .join('\n')
          : undefined

        const mandatoryText =
          confirmedMandatory.length > 0
            ? confirmedMandatory.map((m) => `- ${m.content}`).join('\n')
            : undefined

        // Mark role as running
        const currentSession = await reviewRepo.findSessionByProjectId(projectId)
        if (!currentSession) throw new ValidationError('评审会话已删除')

        const updatedRoleResults = currentSession.roleResults.map((r) =>
          r.roleId === roleId ? { ...r, status: 'running' as const, error: undefined } : r
        )
        await reviewRepo.updateSessionStatus(
          currentSession.id,
          currentSession.status,
          updatedRoleResults
        )

        ctx.updateProgress(30, `角色「${role.name}」攻击中…`)

        const { prompt, temperature, maxTokens } = buildAdversarialReviewPrompt({
          roleName: role.name,
          rolePerspective: role.perspective,
          attackFocus: role.attackFocus,
          intensity: role.intensity,
          roleDescription: role.description,
          proposalContent: doc.content,
          scoringCriteria,
          mandatoryItems: mandatoryText,
        })

        const startTime = Date.now()
        try {
          const response = await aiProxy.call({
            messages: [
              {
                role: 'system',
                content:
                  '你是一位资深投标评审专家，正在以指定角色对投标方案进行对抗性攻击审查。请严格按照 JSON 数组格式输出审查发现，不要添加任何额外文字。',
              },
              { role: 'user', content: prompt },
            ],
            maxTokens,
            temperature,
            caller: `adversarial-review-retry-${roleId}`,
            signal: ctx.signal,
          })

          const latencyMs = Date.now() - startTime
          const rawFindings = parseFindings(response.content)

          ctx.updateProgress(70, '整理重试结果…')

          // Build new findings for this role
          const newFindings: Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[] = []
          for (const raw of rawFindings) {
            if (!raw.content || raw.content.trim().length === 0) continue

            const severity: FindingSeverity = VALID_SEVERITIES.includes(
              raw.severity as FindingSeverity
            )
              ? (raw.severity as FindingSeverity)
              : 'major'

            newFindings.push({
              id: uuidv4(),
              sessionId: currentSession.id,
              roleId: role.id,
              roleName: role.name,
              severity,
              sectionRef: raw.sectionRef ?? null,
              sectionLocator: resolveSectionLocator(raw.sectionRef ?? null, sectionIndex),
              content: raw.content.trim(),
              suggestion: raw.suggestion?.trim() || null,
              reasoning: raw.reasoning?.trim() || null,
              status: 'pending',
              rebuttalReason: null,
              contradictionGroupId: null,
              sortOrder: 0,
            })
          }

          // Merge: keep existing findings from other roles, add new ones
          const existingFindings = currentSession.findings.filter((f) => f.roleId !== roleId)
          const merged = [...existingFindings, ...newFindings]

          // Re-sort all findings
          const sortable = merged.map((f, i) => {
            const r = lineup.roles.find((lr) => lr.id === f.roleId)
            return {
              finding: f,
              severityWeight: SEVERITY_WEIGHT[f.severity],
              roleSortOrder: r?.sortOrder ?? 999,
              originalIndex: i,
            }
          })

          sortable.sort((a, b) => {
            if (a.severityWeight !== b.severityWeight) return a.severityWeight - b.severityWeight
            if (a.roleSortOrder !== b.roleSortOrder) return a.roleSortOrder - b.roleSortOrder
            return a.originalIndex - b.originalIndex
          })

          let newSortOrder = 0
          for (const item of sortable) {
            item.finding.sortOrder = newSortOrder++
          }

          // Update role result
          const finalRoleResults = currentSession.roleResults.map((r) =>
            r.roleId === roleId
              ? {
                  ...r,
                  status: 'success' as const,
                  findingCount: newFindings.length,
                  latencyMs,
                  error: undefined,
                }
              : r
          )

          const hasFailedRoles = finalRoleResults.some((r) => r.status === 'failed')
          const finalStatus = hasFailedRoles ? 'partial' : 'completed'

          // Re-run contradiction detection if we have enough data
          ctx.updateProgress(85, '矛盾检测中…')
          const allMerged = sortable.map((s) => s.finding)
          const uniqueRoleIds = new Set(allMerged.map((f) => f.roleId))

          if (uniqueRoleIds.size >= 2 && allMerged.length >= 2) {
            try {
              // Reset contradiction groups
              for (const f of allMerged) {
                f.contradictionGroupId = null
              }

              const summaries: FindingSummary[] = allMerged.map((f) => ({
                id: f.id,
                roleId: f.roleId,
                roleName: f.roleName,
                content: f.content,
                sectionRef: f.sectionRef,
              }))

              const cdPrompt = buildContradictionDetectionPrompt({ findings: summaries })
              const cdResponse = await aiProxy.call({
                messages: [
                  {
                    role: 'system',
                    content:
                      '你是一位分析师，负责识别不同评审角色之间的矛盾观点。请严格按照 JSON 数组格式输出，不要添加任何额外文字。',
                  },
                  { role: 'user', content: cdPrompt.prompt },
                ],
                maxTokens: cdPrompt.maxTokens,
                temperature: cdPrompt.temperature,
                caller: 'contradiction-detection-retry',
                signal: ctx.signal,
              })

              const pairs = parseContradictions(cdResponse.content)
              const findingMap = new Map(allMerged.map((f) => [f.id, f]))
              let groupCounter = 0
              for (const pair of pairs) {
                const a = findingMap.get(pair.findingIdA)
                const b = findingMap.get(pair.findingIdB)
                if (a && b) {
                  const groupId = `contradiction-${++groupCounter}`
                  a.contradictionGroupId = groupId
                  b.contradictionGroupId = groupId
                }
              }
            } catch (err) {
              if (isAbortError(err)) throw err
              logger.warn('Contradiction detection failed during retry, skipping:', err)
            }
          }

          // Persist: delete all findings, re-insert
          await reviewRepo.deleteFindingsBySessionId(currentSession.id)
          await reviewRepo.updateSessionStatus(
            currentSession.id,
            finalStatus,
            finalRoleResults,
            new Date().toISOString()
          )

          if (allMerged.length > 0) {
            await reviewRepo.saveFindings(
              allMerged.map((f) => ({
                ...f,
                // Strip createdAt/updatedAt if present from existing findings
                ...('createdAt' in f ? {} : {}),
              })) as Omit<AdversarialFinding, 'createdAt' | 'updatedAt'>[]
            )
          }

          ctx.updateProgress(100, `角色「${role.name}」重试完成`)
          logger.info(
            `Role retry complete for ${role.name}: ${newFindings.length} findings, session status=${finalStatus}`
          )
        } catch (err) {
          if (isAbortError(err)) throw err

          // Retry failed — keep existing findings, mark role as failed again
          const failedRoleResults = currentSession.roleResults.map((r) =>
            r.roleId === roleId
              ? {
                  ...r,
                  status: 'failed' as const,
                  error: err instanceof Error ? err.message : '重试失败',
                  latencyMs: Date.now() - startTime,
                }
              : r
          )
          await reviewRepo.updateSessionStatus(
            currentSession.id,
            currentSession.status,
            failedRoleResults
          )

          throw new BidWiseError(
            ErrorCode.ADVERSARIAL_GENERATION_FAILED,
            `角色「${role.name}」重试失败: ${err instanceof Error ? err.message : '未知错误'}`
          )
        }
      })
      .catch((err) => {
        logger.error(`Adversarial retry task failed for role ${roleId}:`, err)
      })

    return { taskId }
  }
}

export const adversarialReviewService = new AdversarialReviewService()
