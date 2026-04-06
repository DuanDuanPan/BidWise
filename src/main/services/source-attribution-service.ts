import { join } from 'path'
import { app } from 'electron'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { documentService } from '@main/services/document-service'
import { projectService } from '@main/services/project-service'
import { taskQueue } from '@main/services/task-queue'
import { extractRenderableParagraphs, createContentDigest } from '@shared/chapter-markdown'
import type {
  AttributeSourcesInput,
  ValidateBaselineInput,
  GetSourceAttributionsInput,
  SourceTaskOutput,
  GetSourceAttributionsOutput,
  SourceAttribution,
  BaselineValidation,
} from '@shared/source-attribution-types'

const logger = createLogger('source-attribution-service')

function resolveCompanyBaselineDir(): string | null {
  const candidates = [
    join(app.getAppPath(), 'company-data', 'baselines'),
    join(app.getPath('userData'), 'company-data', 'baselines'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return null
}

async function findBaselineFile(proposalType: string): Promise<string | null> {
  const dir = resolveCompanyBaselineDir()
  if (!dir) return null

  const candidates = [`${proposalType}.md`, `${proposalType}.json`, 'default.md', 'default.json']

  for (const filename of candidates) {
    const filePath = join(dir, filename)
    if (existsSync(filePath)) return filePath
  }
  return null
}

function locatorKey(locator: { title: string; level: number; occurrenceIndex: number }): string {
  return `${locator.level}:${locator.title}:${locator.occurrenceIndex}`
}

export const sourceAttributionService = {
  async attributeSources(input: AttributeSourcesInput): Promise<SourceTaskOutput> {
    const paragraphs = extractRenderableParagraphs(input.content)

    if (paragraphs.length === 0) {
      logger.info(`No annotatable paragraphs for section, skipping attribution`)
      // Enqueue a task that completes immediately with empty result
      const taskId = await taskQueue.enqueue({
        category: 'semantic-search',
        input: { projectId: input.projectId, target: input.target, skipped: true },
      })
      await taskQueue.execute(taskId, async (ctx) => {
        ctx.updateProgress(100, 'completed')
        return { attributions: [] }
      })
      return { taskId }
    }

    const taskId = await taskQueue.enqueue({
      category: 'semantic-search',
      input: { projectId: input.projectId, target: input.target },
    })

    // Fire-and-forget outer task
    taskQueue
      .execute(taskId, async (ctx) => {
        ctx.updateProgress(10, 'parsing-paragraphs')

        // Launch inner agent
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'attribute-sources',
          context: {
            chapterTitle: input.target.title,
            paragraphs,
          },
          options: { maxRetries: 0 },
        })

        ctx.updateProgress(30, 'analyzing-sources')

        // Poll inner agent for completion
        let agentStatus = await agentOrchestrator.getAgentStatus(agentResponse.taskId)
        while (agentStatus.status === 'pending' || agentStatus.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 500))
          agentStatus = await agentOrchestrator.getAgentStatus(agentResponse.taskId)
        }

        if (agentStatus.status !== 'completed' || !agentStatus.result) {
          throw new BidWiseError(
            ErrorCode.AGENT_EXECUTE,
            `Attribution agent failed: ${agentStatus.error?.message ?? 'unknown'}`
          )
        }

        ctx.updateProgress(70, 'persisting-results')

        // Parse structured JSON from agent output
        const rawAttributions = parseAttributionJson(agentStatus.result.content)

        // Build full SourceAttribution records
        const validSourceTypes = new Set([
          'asset-library',
          'knowledge-base',
          'ai-inference',
          'no-source',
        ])
        const attributions: SourceAttribution[] = rawAttributions.map((raw) => {
          const para = paragraphs.find((p) => p.paragraphIndex === raw.paragraphIndex)
          const sourceType = validSourceTypes.has(raw.sourceType)
            ? (raw.sourceType as SourceAttribution['sourceType'])
            : 'no-source'
          return {
            id: `sa-${input.target.level}-${input.target.occurrenceIndex}-${raw.paragraphIndex}`,
            sectionLocator: input.target,
            paragraphIndex: raw.paragraphIndex,
            paragraphDigest: para?.digest ?? '',
            sourceType,
            sourceRef: raw.sourceRef,
            snippet: raw.snippet,
            confidence: raw.confidence ?? 0,
          }
        })

        // Persist via sidecar — replace section's attributions only
        const sectionKey = locatorKey(input.target)
        await documentService.updateMetadata(input.projectId, (meta) => ({
          ...meta,
          sourceAttributions: [
            ...meta.sourceAttributions.filter((a) => locatorKey(a.sectionLocator) !== sectionKey),
            ...attributions,
          ],
        }))

        ctx.updateProgress(100, 'completed')
        return { attributions }
      })
      .catch((err) => {
        logger.error(`Attribution outer task ${taskId} failed:`, err)
      })

    return { taskId }
  },

  async validateBaseline(input: ValidateBaselineInput): Promise<SourceTaskOutput> {
    const project = await projectService.get(input.projectId)
    const proposalType = project.proposalType || 'presale-technical'

    const baselinePath = await findBaselineFile(proposalType)

    const taskId = await taskQueue.enqueue({
      category: 'semantic-search',
      input: { projectId: input.projectId, target: input.target },
    })

    if (!baselinePath) {
      logger.info(`No baseline file found for proposalType=${proposalType}, skipping validation`)
      taskQueue
        .execute(taskId, async (ctx) => {
          ctx.updateProgress(100, 'skipped')
          return { baselineValidations: [], skipped: true, reason: 'no-baseline-file' }
        })
        .catch((err) => {
          logger.error(`Baseline skip task ${taskId} failed:`, err)
        })
      return { taskId }
    }

    const paragraphs = extractRenderableParagraphs(input.content)
    if (paragraphs.length === 0) {
      taskQueue
        .execute(taskId, async (ctx) => {
          ctx.updateProgress(100, 'completed')
          return { baselineValidations: [] }
        })
        .catch((err) => {
          logger.error(`Baseline empty task ${taskId} failed:`, err)
        })
      return { taskId }
    }

    // Fire-and-forget outer task
    taskQueue
      .execute(taskId, async (ctx) => {
        ctx.updateProgress(10, 'reading-baseline')

        const baselineContent = await readFile(baselinePath, 'utf-8')

        ctx.updateProgress(20, 'extracting-claims')

        // Launch inner agent
        const agentResponse = await agentOrchestrator.execute({
          agentType: 'validate-baseline',
          context: {
            chapterTitle: input.target.title,
            paragraphs,
            productBaseline: baselineContent,
          },
          options: { maxRetries: 0 },
        })

        ctx.updateProgress(40, 'comparing-baseline')

        // Poll inner agent for completion
        let agentStatus = await agentOrchestrator.getAgentStatus(agentResponse.taskId)
        while (agentStatus.status === 'pending' || agentStatus.status === 'running') {
          await new Promise((resolve) => setTimeout(resolve, 500))
          agentStatus = await agentOrchestrator.getAgentStatus(agentResponse.taskId)
        }

        if (agentStatus.status !== 'completed' || !agentStatus.result) {
          throw new BidWiseError(
            ErrorCode.AGENT_EXECUTE,
            `Baseline validation agent failed: ${agentStatus.error?.message ?? 'unknown'}`
          )
        }

        ctx.updateProgress(70, 'persisting-results')

        // Parse structured JSON from agent output
        const rawValidations = parseBaselineJson(agentStatus.result.content)

        // Build full BaselineValidation records
        const validations: BaselineValidation[] = rawValidations.map((raw) => ({
          id: `bv-${input.target.level}-${input.target.occurrenceIndex}-${raw.paragraphIndex}`,
          sectionLocator: input.target,
          paragraphIndex: raw.paragraphIndex,
          claim: raw.claim,
          claimDigest: createContentDigest(raw.claim),
          baselineRef: raw.baselineRef,
          matched: raw.matched,
          mismatchReason: raw.mismatchReason,
        }))

        // Persist via sidecar — replace section's validations only
        const sectionKey = locatorKey(input.target)
        await documentService.updateMetadata(input.projectId, (meta) => ({
          ...meta,
          baselineValidations: [
            ...meta.baselineValidations.filter((v) => locatorKey(v.sectionLocator) !== sectionKey),
            ...validations,
          ],
        }))

        ctx.updateProgress(100, 'completed')
        return { baselineValidations: validations }
      })
      .catch((err) => {
        logger.error(`Baseline outer task ${taskId} failed:`, err)
      })

    return { taskId }
  },

  async getAttributions(input: GetSourceAttributionsInput): Promise<GetSourceAttributionsOutput> {
    const meta = await documentService.getMetadata(input.projectId)
    const sectionKey = locatorKey(input.target)

    return {
      attributions: meta.sourceAttributions.filter(
        (a) => locatorKey(a.sectionLocator) === sectionKey
      ),
      baselineValidations: meta.baselineValidations.filter(
        (v) => locatorKey(v.sectionLocator) === sectionKey
      ),
    }
  },
}

// ─── JSON parsers for AI output ───

interface RawAttributionItem {
  paragraphIndex: number
  sourceType: string
  sourceRef?: string
  snippet?: string
  confidence?: number
}

interface RawBaselineItem {
  paragraphIndex: number
  claim: string
  baselineRef?: string
  matched: boolean
  mismatchReason?: string
}

function parseAttributionJson(content: string): RawAttributionItem[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    logger.warn('No JSON array found in attribution response')
    return []
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          'paragraphIndex' in item &&
          'sourceType' in item
      )
      .map((item) => ({
        paragraphIndex: Number(item.paragraphIndex),
        sourceType: String(item.sourceType),
        sourceRef: item.sourceRef != null ? String(item.sourceRef) : undefined,
        snippet: item.snippet != null ? String(item.snippet) : undefined,
        confidence: item.confidence != null ? Number(item.confidence) : undefined,
      }))
  } catch (err) {
    logger.warn('Failed to parse attribution JSON:', err)
    return []
  }
}

function parseBaselineJson(content: string): RawBaselineItem[] {
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    logger.warn('No JSON array found in baseline response')
    return []
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          'paragraphIndex' in item &&
          'claim' in item &&
          'matched' in item
      )
      .map((item) => ({
        paragraphIndex: Number(item.paragraphIndex),
        claim: String(item.claim),
        baselineRef: item.baselineRef != null ? String(item.baselineRef) : undefined,
        matched: Boolean(item.matched),
        mismatchReason: item.mismatchReason != null ? String(item.mismatchReason) : undefined,
      }))
  } catch (err) {
    logger.warn('Failed to parse baseline JSON:', err)
    return []
  }
}
