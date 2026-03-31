import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { getDb } from '@main/db/client'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { RequirementRepository } from '@main/db/repositories/requirement-repo'
import { MandatoryItemRepository } from '@main/db/repositories/mandatory-item-repo'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { taskQueue } from '@main/services/task-queue'
import type { TaskExecutorContext } from '@main/services/task-queue'
import type {
  ParsedTender,
  MandatoryItem,
  MandatoryItemStatus,
  MandatoryItemSummary,
  MandatoryItemsSnapshot,
  DetectMandatoryResult,
} from '@shared/analysis-types'

const logger = createLogger('mandatory-item-detector')

const POLL_INTERVAL_MS = 1_000
const DETECTION_TIMEOUT_MS = 5 * 60 * 1_000

interface RawMandatoryItem {
  content?: string
  sourceText?: string
  sourcePages?: number[]
  confidence?: number
}

/** Extract JSON from a string that may be wrapped in markdown code fences or contain prose */
function extractJsonFromResponse(text: string): string {
  // Try code fence first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (fenceMatch) return fenceMatch[1].trim()
  // Try raw JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) return arrayMatch[0]
  // Try raw JSON object (fallback)
  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]
  return text.trim()
}

function parseMandatoryResponse(content: string): RawMandatoryItem[] {
  const jsonStr = extractJsonFromResponse(content)
  let parsed: unknown

  try {
    parsed = JSON.parse(jsonStr)
  } catch (err) {
    throw new BidWiseError(
      ErrorCode.MANDATORY_DETECTION_FAILED,
      `LLM 返回的 JSON 解析失败: ${(err as Error).message}`
    )
  }

  // Support both array and object-with-array formats
  if (Array.isArray(parsed)) {
    return parsed as RawMandatoryItem[]
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    // Check for common wrapper keys
    for (const key of ['items', 'mandatoryItems', 'mandatory_items', 'results']) {
      if (Array.isArray(obj[key])) {
        return obj[key] as RawMandatoryItem[]
      }
    }
  }

  throw new BidWiseError(
    ErrorCode.MANDATORY_DETECTION_FAILED,
    'LLM 返回的结果格式不正确，预期 JSON 数组'
  )
}

/** CJK character range test */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/

/** Tokenize text into a set of tokens — uses character bigrams for CJK, whitespace words otherwise */
function tokenize(text: string): Set<string> {
  const cleaned = text.replace(/[，。、；：""''（）【】《》？！,.:;!?()[\]{}"']/g, ' ')
  const tokens = new Set<string>()

  // Split by whitespace to get chunks
  const chunks = cleaned.split(/\s+/).filter((c) => c.length > 0)
  for (const chunk of chunks) {
    if (CJK_RE.test(chunk)) {
      // Generate character bigrams for CJK text
      for (let i = 0; i < chunk.length - 1; i++) {
        tokens.add(chunk.slice(i, i + 2))
      }
      // Also add individual CJK chars for short terms
      if (chunk.length <= 2) {
        for (const ch of chunk) {
          if (CJK_RE.test(ch)) tokens.add(ch)
        }
      }
    } else if (chunk.length >= 2) {
      tokens.add(chunk.toLowerCase())
    }
  }
  return tokens
}

/** Auto-link mandatory items to requirements via token overlap (CJK-aware) */
function autoLinkToRequirements(
  items: MandatoryItem[],
  requirements: Array<{ id: string; description: string }>
): void {
  // Pre-tokenize requirements
  const reqTokens = requirements.map((req) => ({
    id: req.id,
    tokens: tokenize(req.description),
  }))

  for (const item of items) {
    if (item.linkedRequirementId) continue

    const itemTokens = tokenize(item.content)
    if (itemTokens.size === 0) continue

    let bestMatch: { id: string; score: number } | null = null

    for (const req of reqTokens) {
      if (req.tokens.size === 0) continue

      let overlap = 0
      for (const token of itemTokens) {
        if (req.tokens.has(token)) overlap++
      }

      const score = overlap / Math.max(itemTokens.size, req.tokens.size)
      if (score > 0.2 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: req.id, score }
      }
    }

    if (bestMatch) {
      item.linkedRequirementId = bestMatch.id
    }
  }
}

export class MandatoryItemDetector {
  private projectRepo = new ProjectRepository()
  private requirementRepo = new RequirementRepository()
  private mandatoryItemRepo = new MandatoryItemRepository()

  async detect(input: { projectId: string }): Promise<DetectMandatoryResult> {
    const { projectId } = input

    // Validate project
    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `项目未设置存储路径: ${projectId}`
      )
    }

    // Load parsed tender
    const tenderParsedPath = path.join(project.rootPath, 'tender', 'tender-parsed.json')
    let tender: ParsedTender
    try {
      const content = await fs.readFile(tenderParsedPath, 'utf-8')
      tender = JSON.parse(content) as ParsedTender
    } catch {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `招标文件解析结果不存在或无法读取: ${tenderParsedPath}`
      )
    }

    // Load existing requirements for cross-reference
    const existingRequirements = await this.requirementRepo.findByProject(projectId)

    // Enqueue outer task
    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, rootPath: project.rootPath },
    })

    // Fire-and-forget execution
    const mandatoryItemRepo = this.mandatoryItemRepo
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        ctx.updateProgress(5, '正在构建*项检测提示词...')

        // Step 1: Call agent orchestrator with mandatory-items mode
        ctx.updateProgress(10, '正在调用 AI 识别必响应项...')
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'extract',
          context: {
            mode: 'mandatory-items',
            sections: tender.sections,
            rawText: tender.rawText,
            totalPages: tender.totalPages,
            hasScannedContent: tender.hasScannedContent,
            existingRequirements,
          },
        })

        // Step 2: Poll for agent completion
        const innerTaskId = agentResponse.taskId
        let agentResult: string | undefined
        const pollingStartedAt = Date.now()

        while (true) {
          if (Date.now() - pollingStartedAt >= DETECTION_TIMEOUT_MS) {
            throw new BidWiseError(
              ErrorCode.MANDATORY_DETECTION_FAILED,
              'AI *项检测超时（超过 5 分钟），请重试'
            )
          }

          const status = await agentOrchestrator.getAgentStatus(innerTaskId)

          if (status.status === 'completed') {
            agentResult = status.result?.content
            break
          }

          if (status.status === 'failed') {
            throw new BidWiseError(
              ErrorCode.MANDATORY_DETECTION_FAILED,
              `AI *项检测失败: ${status.error?.message ?? '未知错误'}`
            )
          }

          if (status.status === 'cancelled') {
            throw new BidWiseError(ErrorCode.TASK_CANCELLED, 'AI *项检测任务已取消')
          }

          // Report polling progress (20% → 80%)
          const progressPct = Math.min(20 + status.progress * 0.6, 80)
          ctx.updateProgress(progressPct, '正在调用 AI 识别必响应项...')

          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        }

        if (!agentResult) {
          throw new BidWiseError(ErrorCode.MANDATORY_DETECTION_FAILED, 'AI 返回结果为空')
        }

        // Step 3: Parse LLM response
        ctx.updateProgress(85, 'AI 返回结果，正在解析和持久化...')
        const rawItems = parseMandatoryResponse(agentResult)

        const now = new Date().toISOString()
        const items: MandatoryItem[] = rawItems
          .map((raw) => ({
            id: uuidv4(),
            content: (raw.content ?? '').trim(),
            sourceText: (raw.sourceText ?? '').trim(),
            sourcePages: Array.isArray(raw.sourcePages) ? raw.sourcePages : [],
            confidence:
              typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.5,
            status: 'detected' as MandatoryItemStatus,
            linkedRequirementId: null,
            detectedAt: now,
            updatedAt: now,
          }))
          .filter((item) => item.content.length > 0)

        // Deduplicate by content (keep first occurrence) before persisting
        const seenContent = new Set<string>()
        const uniqueItems = items.filter((item) => {
          if (seenContent.has(item.content)) return false
          seenContent.add(item.content)
          return true
        })

        // Auto-link to requirements
        autoLinkToRequirements(uniqueItems, existingRequirements)

        // Step 4: Atomically replace old data (transaction: delete + insert)
        await mandatoryItemRepo.replaceByProject(projectId, uniqueItems)

        // Step 5: Write snapshot (uses same deduplicated list to stay in sync with DB)
        const snapshot: MandatoryItemsSnapshot = {
          projectId,
          items: uniqueItems,
          detectedAt: now,
        }
        const snapshotPath = path.join(rootPath, 'tender', 'mandatory-items.json')
        await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')

        ctx.updateProgress(100, '*项检测完成')
        logger.info(
          `Mandatory item detection complete for project ${projectId}: ${uniqueItems.length} items found`
        )
        return uniqueItems
      })
      .catch((err) => {
        logger.error(`Mandatory detection task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getItems(projectId: string): Promise<MandatoryItem[] | null> {
    const items = await this.mandatoryItemRepo.findByProject(projectId)
    if (items.length > 0) {
      return items
    }

    // Check if detection was ever run by looking for snapshot
    const project = await this.projectRepo.findById(projectId)
    if (project.rootPath) {
      const snapshotPath = path.join(project.rootPath, 'tender', 'mandatory-items.json')
      try {
        await fs.access(snapshotPath)
        return [] // Detection ran but found 0 items
      } catch {
        // Snapshot doesn't exist — never run
      }
    }

    return null // Never executed
  }

  async getSummary(projectId: string): Promise<MandatoryItemSummary | null> {
    const items = await this.getItems(projectId)
    if (items === null) return null

    return {
      total: items.length,
      confirmed: items.filter((i) => i.status === 'confirmed').length,
      dismissed: items.filter((i) => i.status === 'dismissed').length,
      pending: items.filter((i) => i.status === 'detected').length,
    }
  }

  async updateItem(
    id: string,
    patch: Partial<Pick<MandatoryItem, 'status' | 'linkedRequirementId'>>
  ): Promise<MandatoryItem> {
    // Validate linkedRequirementId belongs to the same project
    if (patch.linkedRequirementId) {
      const projectId = await this.mandatoryItemRepo.findProjectId(id)
      if (!projectId) {
        throw new BidWiseError(ErrorCode.MANDATORY_DETECTION_FAILED, `必响应项不存在: ${id}`)
      }
      const req = await getDb()
        .selectFrom('requirements')
        .select('projectId')
        .where('id', '=', patch.linkedRequirementId)
        .executeTakeFirst()
      if (!req || req.projectId !== projectId) {
        throw new BidWiseError(
          ErrorCode.MANDATORY_DETECTION_FAILED,
          `关联的需求不存在或不属于同一项目: ${patch.linkedRequirementId}`
        )
      }
    }

    const updated = await this.mandatoryItemRepo.update(id, patch)

    // Sync snapshot — find projectId from the updated item's project
    await this.syncSnapshot(updated)

    return updated
  }

  async addItem(input: {
    projectId: string
    content: string
    sourceText?: string
    sourcePages?: number[]
  }): Promise<MandatoryItem> {
    const now = new Date().toISOString()
    const pages = input.sourcePages ? [...new Set(input.sourcePages)].sort((a, b) => a - b) : []

    const trimmedContent = input.content.trim()

    // Pre-check for duplicate content
    const exists = await this.mandatoryItemRepo.contentExists(input.projectId, trimmedContent)
    if (exists) {
      throw new BidWiseError(
        ErrorCode.MANDATORY_DETECTION_FAILED,
        `该必响应项已存在，请勿重复添加: ${trimmedContent.slice(0, 50)}`
      )
    }

    const item: MandatoryItem = {
      id: uuidv4(),
      content: trimmedContent,
      sourceText: (input.sourceText ?? '').trim(),
      sourcePages: pages,
      confidence: 1.0,
      status: 'confirmed',
      linkedRequirementId: null,
      detectedAt: now,
      updatedAt: now,
    }

    await this.mandatoryItemRepo.create(input.projectId, [item])

    // Sync snapshot
    await this.syncSnapshotForProject(input.projectId)

    return item
  }

  private async syncSnapshot(item: MandatoryItem): Promise<void> {
    // Find the project for this item by querying DB
    const row = await getDb()
      .selectFrom('mandatoryItems')
      .select('projectId')
      .where('id', '=', item.id)
      .executeTakeFirst()

    if (row) {
      await this.syncSnapshotForProject(row.projectId)
    }
  }

  private async syncSnapshotForProject(projectId: string): Promise<void> {
    try {
      const project = await this.projectRepo.findById(projectId)
      if (!project.rootPath) return

      const items = await this.mandatoryItemRepo.findByProject(projectId)
      const snapshot: MandatoryItemsSnapshot = {
        projectId,
        items,
        detectedAt: new Date().toISOString(),
      }
      const snapshotPath = path.join(project.rootPath, 'tender', 'mandatory-items.json')
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8')
    } catch (err) {
      logger.warn(`Failed to sync mandatory items snapshot for project ${projectId}`, err)
    }
  }
}
