import {
  generateChapterPrompt,
  generateSkeletonPrompt,
  generateSubChapterPrompt,
  GENERATE_CHAPTER_SYSTEM_PROMPT,
  SKELETON_GENERATION_SYSTEM_PROMPT,
  DEFAULT_DIMENSION_CHECKLIST,
} from '@main/prompts/generate-chapter.prompt'
import type {
  GenerateChapterContext,
  SkeletonPromptContext,
} from '@main/prompts/generate-chapter.prompt'
import { extractJsonObject as extractJsonObjectFromLlm } from '@main/utils/llm-json'
import type { SkeletonExpandPlan, SkeletonExpandSection } from '@shared/chapter-types'
import {
  generateDiagramRepairPrompt,
  generateDiagramPrompt,
  GENERATE_DIAGRAM_SYSTEM_PROMPT,
  REPAIR_DIAGRAM_SYSTEM_PROMPT,
} from '@main/prompts/generate-diagram.prompt'
import {
  validateTextDiagramCoherencePrompt,
  VALIDATE_TEXT_DIAGRAM_COHERENCE_SYSTEM_PROMPT,
} from '@main/prompts/validate-text-diagram-coherence.prompt'
import { askSystemPrompt, ASK_SYSTEM_SYSTEM_PROMPT } from '@main/prompts/ask-system.prompt'
import type { AskSystemContext } from '@main/prompts/ask-system.prompt'
import { annotationFeedbackPrompt } from '@main/prompts/annotation-feedback.prompt'
import type { AnnotationFeedbackContext } from '@main/prompts/annotation-feedback.prompt'
import { isAbortError, throwIfAborted } from '@main/utils/abort'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { terminologyService } from '@main/services/terminology-service'
import { terminologyReplacementService } from '@main/services/terminology-replacement-service'
import { drawioAssetService } from '@main/services/drawio-asset-service'
import {
  buildDiagramFailureMarkdown,
  buildDrawioMarkdown,
  buildMermaidMarkdown,
  extractJsonObject,
  normalizeMermaidSource,
  parseDiagramPlaceholders,
  replaceSkeletonWithDiagram,
  validateDrawioDiagram,
  validateMermaidDiagram,
  type DiagramType,
  type DiagramPlaceholder,
  type DiagramValidationResult,
} from '@main/services/diagram-validation-service'
import type { AgentHandler, AgentHandlerResult, AiRequestParams } from '../orchestrator'
import { createLogger } from '@main/utils/logger'
import type { AiProxyResponse, TokenUsage } from '@shared/ai-types'
import type { ChapterStreamProgressPayload } from '@shared/chapter-types'

const logger = createLogger('generate-agent')
const MAX_DIAGRAM_ATTEMPTS = 3
const MAX_DIAGRAM_CONCURRENCY = 2

type ProgressReporter = (progress: number, message?: string, payload?: unknown) => void

interface GeneratedDiagram {
  placeholder: DiagramPlaceholder
  markdown: string
  summary: string
}

type DiagramGenerationOutcome =
  | ({
      kind: 'success'
    } & GeneratedDiagram)
  | {
      kind: 'failure'
      placeholder: DiagramPlaceholder
      markdown: string
      error: string
    }

function wrapParams(value: AiRequestParams): AgentHandlerResult {
  return { kind: 'params', value }
}

function wrapResult(content: string, usage: TokenUsage, latencyMs: number): AgentHandlerResult {
  return {
    kind: 'result',
    value: {
      content,
      usage,
      latencyMs,
    },
  }
}

function createEmptyUsage(): TokenUsage {
  return {
    promptTokens: 0,
    completionTokens: 0,
  }
}

function accumulateUsage(target: TokenUsage, response: AiProxyResponse): void {
  target.promptTokens += response.usage.promptTokens
  target.completionTokens += response.usage.completionTokens
}

function createStreamPayload(
  markdown: string,
  patch?: ChapterStreamProgressPayload['patch']
): ChapterStreamProgressPayload {
  return {
    kind: 'chapter-stream',
    markdown,
    patch,
  }
}

function stripMermaidFences(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```mermaid\s*([\s\S]*?)```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function stripDrawioEnvelope(content: string): string {
  const trimmed = content.trim()
  const xmlStart = trimmed.indexOf('<mxGraphModel')
  const xmlEnd = trimmed.lastIndexOf('</mxGraphModel>')
  if (xmlStart !== -1 && xmlEnd !== -1) {
    return trimmed.slice(xmlStart, xmlEnd + '</mxGraphModel>'.length)
  }
  return trimmed
    .replace(/^```xml\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function stripSkeletonMarkers(markdown: string): string {
  return markdown
    .replace(/^>\s*\[图表生成中\].*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeDiagramSource(type: DiagramType, content: string): string {
  return type === 'mermaid'
    ? normalizeMermaidSource(stripMermaidFences(content))
    : stripDrawioEnvelope(content)
}

async function validateDiagramSource(
  type: DiagramType,
  source: string
): Promise<DiagramValidationResult> {
  return type === 'mermaid' ? validateMermaidDiagram(source) : validateDrawioDiagram(source)
}

async function requestDiagramSource(params: {
  aiProxy: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
  signal: AbortSignal
  caller: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
  usage: TokenUsage
  type: DiagramType
}): Promise<string> {
  const response = await params.aiProxy.call({
    caller: params.caller,
    signal: params.signal,
    maxTokens: 4096,
    messages: params.messages,
  })
  accumulateUsage(params.usage, response)
  return normalizeDiagramSource(params.type, response.content)
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  const queue = [...items.entries()]
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) return
      const [index, item] = next
      await worker(item, index)
    }
  })

  await Promise.all(runners)
}

async function generateDiagramWithRepair(params: {
  aiProxy: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
  signal: AbortSignal
  usage: TokenUsage
  projectId: string | undefined
  chapterTitle: string
  chapterMarkdown: string
  placeholder: DiagramPlaceholder
}): Promise<DiagramGenerationOutcome> {
  const { aiProxy, signal, usage, projectId, chapterTitle, chapterMarkdown, placeholder } = params
  const diagramDescription = placeholder.description || placeholder.title

  let currentSource = await requestDiagramSource({
    aiProxy,
    signal,
    caller: `generate-agent:diagram:${placeholder.type}`,
    usage,
    type: placeholder.type,
    messages: [
      { role: 'system', content: GENERATE_DIAGRAM_SYSTEM_PROMPT },
      {
        role: 'user',
        content: generateDiagramPrompt({
          diagramType: placeholder.type,
          chapterTitle,
          chapterMarkdown,
          diagramTitle: placeholder.title,
          diagramDescription,
        }),
      },
    ],
  })

  let lastError = '图表校验失败，请按要求修正。'

  for (let attempt = 0; attempt < MAX_DIAGRAM_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal, 'Generate agent cancelled')

    const validation = await validateDiagramSource(placeholder.type, currentSource)

    if (validation.valid) {
      if (placeholder.type === 'drawio' && projectId) {
        await drawioAssetService.saveDrawioAsset({
          projectId,
          diagramId: placeholder.placeholderId,
          xml: currentSource,
          fileName: placeholder.assetFileName,
        })
      }

      return {
        kind: 'success',
        placeholder,
        markdown:
          placeholder.type === 'mermaid'
            ? buildMermaidMarkdown({
                diagramId: placeholder.placeholderId,
                assetFileName: placeholder.assetFileName,
                caption: placeholder.title,
                source: currentSource,
              })
            : buildDrawioMarkdown({
                diagramId: placeholder.placeholderId,
                assetFileName: placeholder.assetFileName,
                caption: placeholder.title,
              }),
        summary: `${placeholder.title}（${placeholder.type}）: ${diagramDescription}`,
      }
    }

    lastError = validation.error ?? '图表校验失败，请按要求修正。'
    logger.warn('Diagram validation failed', {
      placeholderId: placeholder.placeholderId,
      diagramType: placeholder.type,
      attempt: attempt + 1,
      error: lastError,
      failureKind: validation.failureKind,
    })

    if (validation.failureKind === 'infrastructure' || attempt === MAX_DIAGRAM_ATTEMPTS - 1) {
      break
    }

    currentSource = await requestDiagramSource({
      aiProxy,
      signal,
      caller: `generate-agent:diagram-repair:${placeholder.type}`,
      usage,
      type: placeholder.type,
      messages: [
        { role: 'system', content: REPAIR_DIAGRAM_SYSTEM_PROMPT },
        {
          role: 'user',
          content: generateDiagramRepairPrompt({
            diagramType: placeholder.type,
            chapterTitle,
            chapterMarkdown,
            diagramTitle: placeholder.title,
            diagramDescription,
            invalidOutput: currentSource,
            validationError: lastError,
          }),
        },
      ],
    })
  }

  return {
    kind: 'failure',
    placeholder,
    markdown: buildDiagramFailureMarkdown({
      type: placeholder.type,
      caption: placeholder.title,
      error: lastError,
    }),
    error: lastError,
  }
}

async function handleSkeletonGenerate(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter,
  aiProxy?: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
): Promise<AgentHandlerResult> {
  updateProgress(0, 'analyzing')

  const parentTitle = context.chapterTitle as string
  const parentLevel = (context.chapterLevel as number) ?? 2

  const promptContext: SkeletonPromptContext = {
    chapterTitle: parentTitle,
    chapterLevel: parentLevel,
    requirements: context.requirements as string,
    scoringWeights: context.scoringWeights as string | undefined,
    documentOutline: context.documentOutline as string | undefined,
    dimensionChecklist: DEFAULT_DIMENSION_CHECKLIST,
  }

  const prompt = generateSkeletonPrompt(promptContext)
  throwIfAborted(signal, 'Skeleton-generate agent cancelled')

  if (!aiProxy) {
    return wrapResult(
      JSON.stringify({ fallback: true, reason: 'AI proxy 不可用' }),
      createEmptyUsage(),
      0
    )
  }

  const startedAt = Date.now()
  updateProgress(50, 'skeleton-generating')

  const response = await aiProxy.call({
    caller: 'generate-agent:skeleton',
    signal,
    maxTokens: 2048,
    messages: [
      { role: 'system', content: SKELETON_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  })

  throwIfAborted(signal, 'Skeleton-generate agent cancelled')

  const parsed = extractJsonObjectFromLlm<{ sections: unknown[] }>(response.content)
  if (!parsed || !Array.isArray(parsed.sections)) {
    logger.warn('Skeleton JSON parse failed, triggering fallback')
    return wrapResult(
      JSON.stringify({ fallback: true, reason: 'LLM 返回的骨架结构无效' }),
      response.usage,
      Date.now() - startedAt
    )
  }

  // Validate and filter sections
  const validSections: SkeletonExpandSection[] = []
  for (const raw of parsed.sections) {
    if (!raw || typeof raw !== 'object') continue
    const s = raw as Record<string, unknown>
    if (typeof s.title !== 'string' || !s.title) continue
    if (typeof s.level !== 'number' || s.level < parentLevel + 1 || s.level > 4) continue
    if (!Array.isArray(s.dimensions)) continue
    validSections.push({
      title: s.title,
      level: s.level,
      dimensions: s.dimensions.filter((d: unknown) => typeof d === 'string') as string[],
      guidanceHint: typeof s.guidanceHint === 'string' ? s.guidanceHint : undefined,
    })
  }

  if (validSections.length === 0) {
    logger.warn('No valid skeleton sections after filtering, triggering fallback')
    return wrapResult(
      JSON.stringify({ fallback: true, reason: 'LLM 返回的骨架结构无效' }),
      response.usage,
      Date.now() - startedAt
    )
  }

  const plan: SkeletonExpandPlan = {
    parentTitle,
    parentLevel,
    sections: validSections,
    dimensionChecklist: DEFAULT_DIMENSION_CHECKLIST.split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.replace(/^- /, '').split(':')[0].trim()),
    confirmedAt: '',
  }

  updateProgress(100, 'skeleton-ready')

  return wrapResult(
    JSON.stringify({ fallback: false, plan }),
    response.usage,
    Date.now() - startedAt
  )
}

async function handleSkeletonBatch(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter,
  aiProxy?: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>,
  setCheckpoint?: (data: unknown) => Promise<void>,
  checkpoint?: unknown
): Promise<AgentHandlerResult> {
  if (!aiProxy) {
    throw new BidWiseError(ErrorCode.AGENT_EXECUTE, 'AI proxy required for skeleton-batch')
  }

  const confirmedSkeleton = context.confirmedSkeleton as SkeletonExpandPlan
  if (!confirmedSkeleton || !Array.isArray(confirmedSkeleton.sections)) {
    throw new BidWiseError(ErrorCode.NOT_FOUND, 'Missing confirmed skeleton in context')
  }

  const activeEntries = await terminologyService.getActiveEntries()
  const terminologyContext = terminologyReplacementService.buildPromptContext(activeEntries)

  const startedAt = Date.now()
  const totalUsage = createEmptyUsage()
  const totalSections = confirmedSkeleton.sections.length

  // Restore from checkpoint if available
  // sectionResults tracks outcome per index: 'completed' markdown or 'failed' info
  let sectionResults: Array<
    | { kind: 'completed'; markdown: string }
    | { kind: 'failed'; title: string; error: string }
    | null
  > = Array.from({ length: totalSections }, () => null)
  let startIndex = 0

  if (checkpoint && typeof checkpoint === 'object') {
    const cp = checkpoint as {
      sectionResults?: typeof sectionResults
      nextIndex?: number
    }
    if (Array.isArray(cp.sectionResults) && cp.sectionResults.length === totalSections) {
      sectionResults = cp.sectionResults
    }
    if (typeof cp.nextIndex === 'number') {
      startIndex = cp.nextIndex
    }
  }

  const countCompleted = (): number => sectionResults.filter((r) => r?.kind === 'completed').length
  const getFailedSections = (): Array<{ title: string; error: string }> =>
    sectionResults
      .filter((r): r is { kind: 'failed'; title: string; error: string } => r?.kind === 'failed')
      .map(({ title, error }) => ({ title, error }))
  const getCompletedTitles = (): string[] =>
    sectionResults
      .map((r, idx) =>
        r?.kind === 'completed' ? (confirmedSkeleton.sections[idx]?.title ?? '') : null
      )
      .filter((t): t is string => t !== null)

  updateProgress(5, 'batch-generating', {
    kind: 'skeleton-batch',
    completedCount: countCompleted(),
    totalCount: totalSections,
    completedSections: getCompletedTitles(),
    failedSections: getFailedSections(),
  })

  for (let i = startIndex; i < totalSections; i++) {
    throwIfAborted(signal, 'Skeleton-batch agent cancelled')

    const section = confirmedSkeleton.sections[i]
    const progressPct = 5 + Math.round(((i + 1) / totalSections) * 80)

    // Build context for this sub-chapter with previous sections summary
    const recentCompleted = sectionResults
      .slice(0, i)
      .map((r, idx) =>
        r?.kind === 'completed'
          ? { title: confirmedSkeleton.sections[idx]?.title ?? `子章节${idx + 1}`, md: r.markdown }
          : null
      )
      .filter((x): x is { title: string; md: string } => x !== null)
      .slice(-3)

    const previousSectionsSummary =
      recentCompleted.length > 0
        ? recentCompleted
            .map(({ title: sTitle, md }) => {
              const truncated = md.length > 500 ? md.slice(0, 500) + '…' : md
              return `**${sTitle}**: ${truncated}`
            })
            .join('\n\n')
        : undefined

    try {
      const subChapterPrompt = generateSubChapterPrompt({
        chapterTitle: section.title,
        chapterLevel: section.level,
        requirements: context.requirements as string,
        guidanceText: section.guidanceHint,
        scoringWeights: context.scoringWeights as string | undefined,
        writingStyle: context.writingStyle as string | undefined,
        documentOutline: context.documentOutline as string | undefined,
        adjacentChaptersBefore: context.adjacentChaptersBefore as string | undefined,
        adjacentChaptersAfter: context.adjacentChaptersAfter as string | undefined,
        strategySeed: context.strategySeed as string | undefined,
        terminologyContext: terminologyContext || undefined,
        dimensionFocus: section.dimensions.join(', '),
        previousSectionsSummary,
      })

      const response = await aiProxy.call({
        caller: `generate-agent:batch:${i}`,
        signal,
        maxTokens: 4096,
        messages: [
          { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
          { role: 'user', content: subChapterPrompt },
        ],
      })
      accumulateUsage(totalUsage, response)

      sectionResults[i] = { kind: 'completed', markdown: response.content.trim() }

      if (setCheckpoint) {
        await setCheckpoint({ sectionResults, nextIndex: i + 1 })
      }

      updateProgress(progressPct, 'batch-generating', {
        kind: 'skeleton-batch',
        completedCount: countCompleted(),
        totalCount: totalSections,
        completedSections: getCompletedTitles(),
        failedSections: getFailedSections(),
      })
    } catch (err) {
      if (signal.aborted || isAbortError(err)) throw err
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`Sub-chapter ${i} (${section.title}) failed:`, err)
      sectionResults[i] = { kind: 'failed', title: section.title, error: errorMsg }

      if (setCheckpoint) {
        await setCheckpoint({ sectionResults, nextIndex: i + 1 })
      }
    }
  }

  // Phase 3: Assembly — index-based to handle duplicate titles correctly
  updateProgress(90, 'batch-composing')

  const assembledParts: string[] = []
  for (let i = 0; i < totalSections; i++) {
    const section = confirmedSkeleton.sections[i]
    const result = sectionResults[i]
    const heading = `${'#'.repeat(section.level)} ${section.title}`

    if (result?.kind === 'completed') {
      assembledParts.push(`${heading}\n\n${result.markdown}`)
    } else if (result?.kind === 'failed') {
      assembledParts.push(`${heading}\n\n> [生成失败] ${result.title}: ${result.error}`)
    }
  }

  const assembledMarkdown = assembledParts.join('\n\n')

  // Report final metadata via progress payload
  updateProgress(95, 'batch-composing', {
    kind: 'skeleton-batch',
    completedCount: countCompleted(),
    totalCount: totalSections,
    completedSections: getCompletedTitles(),
    failedSections: getFailedSections(),
  })

  return wrapResult(assembledMarkdown, totalUsage, Date.now() - startedAt)
}

async function handleAskSystem(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter
): Promise<AgentHandlerResult> {
  updateProgress(0, 'analyzing')

  const promptContext: AskSystemContext = {
    chapterTitle: context.chapterTitle as string,
    chapterLevel: (context.chapterLevel as number) ?? 2,
    sectionContent: context.sectionContent as string,
    userQuestion: context.userQuestion as string,
  }

  const prompt = askSystemPrompt(promptContext)
  throwIfAborted(signal, 'Ask-system agent cancelled')

  updateProgress(50, 'generating-text')

  return wrapParams({
    messages: [
      { role: 'system', content: ASK_SYSTEM_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 2048,
  })
}

async function handleAnnotationFeedback(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter
): Promise<AgentHandlerResult> {
  updateProgress(0, 'analyzing')

  const promptContext: AnnotationFeedbackContext = {
    originalAnnotationContent: context.originalAnnotationContent as string,
    originalAnnotationType: context.originalAnnotationType as
      | 'ai-suggestion'
      | 'adversarial'
      | 'score-warning',
    userFeedback: context.userFeedback as string,
    sectionContent: (context.sectionContent as string) ?? '',
  }

  const prompt = annotationFeedbackPrompt(promptContext)
  throwIfAborted(signal, 'Annotation-feedback agent cancelled')

  updateProgress(50, 'generating-text')

  return wrapParams({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
  })
}

async function handleChapterGeneration(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter,
  aiProxy?: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
): Promise<AgentHandlerResult> {
  updateProgress(0, 'analyzing')

  const activeEntries = await terminologyService.getActiveEntries()
  const terminologyContext = terminologyReplacementService.buildPromptContext(activeEntries)

  const promptContext: GenerateChapterContext = {
    chapterTitle: context.chapterTitle as string,
    chapterLevel: (context.chapterLevel as number) ?? 2,
    requirements: context.requirements as string,
    guidanceText: context.guidanceText as string | undefined,
    scoringWeights: context.scoringWeights as string | undefined,
    mandatoryItems: context.mandatoryItems as string | undefined,
    writingStyle: context.writingStyle as string | undefined,
    documentOutline: context.documentOutline as string | undefined,
    adjacentChaptersBefore: context.adjacentChaptersBefore as string | undefined,
    adjacentChaptersAfter: context.adjacentChaptersAfter as string | undefined,
    strategySeed: context.strategySeed as string | undefined,
    additionalContext: context.additionalContext as string | undefined,
    terminologyContext: terminologyContext || undefined,
  }

  const prompt = generateChapterPrompt(promptContext)
  throwIfAborted(signal, 'Generate agent cancelled')

  const enableDiagrams = context.enableDiagrams === true

  if (!aiProxy || !enableDiagrams) {
    updateProgress(10, 'generating-text')
    return wrapParams({
      messages: [
        { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 8192,
    })
  }

  const startedAt = Date.now()
  const totalUsage = createEmptyUsage()

  updateProgress(10, 'generating-text')
  const textResponse = await aiProxy.call({
    caller: 'generate-agent:text',
    signal,
    maxTokens: 8192,
    messages: [
      { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  })
  accumulateUsage(totalUsage, textResponse)
  throwIfAborted(signal, 'Generate agent cancelled')

  updateProgress(20, 'validating-text')
  const parsed = parseDiagramPlaceholders(textResponse.content.trim())
  let currentMarkdown = parsed.markdownWithSkeletons.trim()

  updateProgress(20, 'validating-text', createStreamPayload(currentMarkdown))

  if (parsed.placeholders.length > 0) {
    const diagramSummaries: string[] = []
    let completedCount = 0

    await runWithConcurrency(parsed.placeholders, MAX_DIAGRAM_CONCURRENCY, async (placeholder) => {
      throwIfAborted(signal, 'Generate agent cancelled')
      updateProgress(35, 'generating-diagrams')

      const diagram = await generateDiagramWithRepair({
        aiProxy,
        signal,
        usage: totalUsage,
        projectId: context.projectId as string | undefined,
        chapterTitle: context.chapterTitle as string,
        chapterMarkdown: stripSkeletonMarkers(currentMarkdown),
        placeholder,
      })

      throwIfAborted(signal, 'Generate agent cancelled')
      updateProgress(60, 'validating-diagrams')

      currentMarkdown = replaceSkeletonWithDiagram(
        currentMarkdown,
        placeholder.placeholderId,
        diagram.markdown
      )

      if (diagram.kind === 'success') {
        diagramSummaries.push(diagram.summary)
      } else {
        logger.warn('Diagram generation exhausted retries; keeping failure marker', {
          placeholderId: placeholder.placeholderId,
          diagramType: placeholder.type,
          error: diagram.error,
        })
      }

      completedCount += 1
      const progress = 35 + Math.round((completedCount / parsed.placeholders.length) * 25)
      updateProgress(
        progress,
        'generating-diagrams',
        createStreamPayload(currentMarkdown, {
          placeholderId: placeholder.placeholderId,
          markdown: diagram.markdown,
        })
      )
    })

    updateProgress(80, 'composing', createStreamPayload(currentMarkdown))
    updateProgress(90, 'validating-coherence')

    const coherenceResponse = await aiProxy.call({
      caller: 'generate-agent:coherence',
      signal,
      maxTokens: 2048,
      messages: [
        { role: 'system', content: VALIDATE_TEXT_DIAGRAM_COHERENCE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: validateTextDiagramCoherencePrompt({
            chapterTitle: context.chapterTitle as string,
            chapterMarkdown: currentMarkdown,
            diagramSummaries,
          }),
        },
      ],
    })
    accumulateUsage(totalUsage, coherenceResponse)
    const coherence = extractJsonObject<{ pass: boolean; issues: unknown[] }>(
      coherenceResponse.content
    )
    if (coherence && !coherence.pass) {
      logger.warn('Coherence validation flagged issues', { issues: coherence.issues })
    }
  } else {
    updateProgress(80, 'composing', createStreamPayload(currentMarkdown))
    updateProgress(90, 'validating-coherence')
  }

  return wrapResult(currentMarkdown, totalUsage, Date.now() - startedAt)
}

export const generateAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress, aiProxy, setCheckpoint, checkpoint }
): Promise<AgentHandlerResult> => {
  throwIfAborted(signal, 'Generate agent cancelled')

  if (context.mode === 'ask-system') {
    return handleAskSystem(context, signal, updateProgress)
  }

  if (context.mode === 'annotation-feedback') {
    return handleAnnotationFeedback(context, signal, updateProgress)
  }

  if (context.mode === 'skeleton-generate') {
    return handleSkeletonGenerate(context, signal, updateProgress, aiProxy)
  }

  if (context.mode === 'skeleton-batch') {
    return handleSkeletonBatch(context, signal, updateProgress, aiProxy, setCheckpoint, checkpoint)
  }

  return handleChapterGeneration(context, signal, updateProgress, aiProxy)
}
