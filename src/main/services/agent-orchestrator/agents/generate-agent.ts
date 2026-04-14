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
import {
  resolveDiagramPlaceholder,
  type ResolvedDiagramPlaceholder,
} from '@main/services/diagram-intent-service'
import type { AgentHandler, AgentHandlerResult, AiRequestParams } from '../orchestrator'
import { createLogger } from '@main/utils/logger'
import type { AiChatMessage, AiProxyResponse, TokenUsage } from '@shared/ai-types'
import type { ChapterStreamProgressPayload } from '@shared/chapter-types'

const logger = createLogger('generate-agent')
const MAX_DIAGRAM_ATTEMPTS = 10
const MAX_DIAGRAM_CONCURRENCY = 2
const MAX_CONTINUATIONS = 3
const CONTINUATION_PROMPT =
  '请从上文断点处继续撰写。要求：1) 不要重复已有内容和标题；2) 保持当前 markdown 标题层级；3) 不要插入新的图表占位符；4) 如果核心要点已阐述完毕，请自然收尾而非强行扩展。'

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

async function callWithContinuation(params: {
  aiProxy: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
  signal: AbortSignal
  caller: string
  messages: AiChatMessage[]
  maxTokens: number
  usage: TokenUsage
}): Promise<{ content: string; continuationCount: number }> {
  const { aiProxy, signal, caller, maxTokens, usage } = params
  // 浅拷贝 messages 数组：后续 push 不会影响调用方的原始数组
  const messages = [...params.messages]
  const parts: string[] = []

  for (let attempt = 0; attempt < MAX_CONTINUATIONS + 1; attempt++) {
    throwIfAborted(signal, 'Generate agent cancelled')
    const response = await aiProxy.call({
      caller: attempt === 0 ? caller : `${caller}:cont-${attempt}`,
      signal,
      maxTokens,
      messages,
    })
    accumulateUsage(usage, response)
    parts.push(response.content.trim())

    if (response.finishReason !== 'length') break

    // 续写：追加 assistant + user 消息对，然后循环继续
    logger.info(
      `Truncation detected (${caller}), continuing attempt ${attempt + 1}/${MAX_CONTINUATIONS}, promptTokens this call: ${response.usage.promptTokens}`
    )
    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: CONTINUATION_PROMPT })
  }

  return { content: parts.join('\n\n'), continuationCount: parts.length - 1 }
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

// ─── Inline mermaid guard ───────────────────────────────────────────
// LLM sometimes ignores the %%DIAGRAM%% placeholder instruction and emits
// raw ```mermaid fenced blocks.  The helpers below detect these and either
// convert them to placeholders (chapter path) or validate-and-strip them
// (batch path) so broken diagrams never reach the editor.

const INLINE_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g
const MANAGED_COMMENT_RE = /<!-- mermaid:[^>]+ -->\s*$/

function extractInlineMermaidTitle(source: string): string {
  const lines = source.split('\n')
  const titleLine = lines.find((l) => /^\s*title\s+/.test(l))
  if (titleLine)
    return titleLine
      .replace(/^\s*title\s+/, '')
      .trim()
      .slice(0, 60)

  const decl = lines.find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() ?? ''
  if (/^flowchart/i.test(decl)) return '流程图'
  if (/^sequenceDiagram/i.test(decl)) return '时序图'
  if (/^classDiagram/i.test(decl)) return '类图'
  if (/^stateDiagram/i.test(decl)) return '状态图'
  if (/^architecture-beta/i.test(decl)) return '架构拓扑图'
  if (/^C4Context/i.test(decl)) return '系统上下文图'
  if (/^C4Container/i.test(decl)) return '容器架构图'
  if (/^C4Component/i.test(decl)) return '组件架构图'
  if (/^C4Deployment/i.test(decl)) return '部署架构图'
  if (/^gantt/i.test(decl)) return '甘特图'
  return '系统图表'
}

/**
 * Convert inline \`\`\`mermaid fenced blocks to %%DIAGRAM%% placeholders
 * so they enter the diagram validation + repair pipeline.
 * Blocks preceded by a \`<!-- mermaid:… -->\` comment are already managed.
 */
function convertInlineMermaidToPlaceholders(text: string): { text: string; count: number } {
  let count = 0
  const converted = text.replace(INLINE_FENCE_RE, (fullMatch, source: string, offset: number) => {
    const before = text.slice(Math.max(0, offset - 300), offset)
    if (MANAGED_COMMENT_RE.test(before)) return fullMatch

    const trimmed = source.trim()
    if (!trimmed) return fullMatch

    const title = extractInlineMermaidTitle(trimmed).replace(/:/g, '-')
    const encoded = Buffer.from(trimmed.slice(0, 800), 'utf-8').toString('base64')
    count += 1
    return `%%DIAGRAM:mermaid:${title}:${encoded}%%`
  })
  return { text: converted, count }
}

/**
 * Validate inline \`\`\`mermaid blocks in batch-path output.
 * Valid blocks are kept; invalid blocks are replaced with a failure marker.
 */
async function stripInvalidInlineMermaid(text: string): Promise<string> {
  const matches: Array<{ full: string; source: string; index: number }> = []
  const re = new RegExp(INLINE_FENCE_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 300), m.index)
    if (!MANAGED_COMMENT_RE.test(before)) {
      matches.push({ full: m[0], source: m[1], index: m.index })
    }
  }
  if (matches.length === 0) return text

  let result = text
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]
    const trimmed = match.source.trim()
    if (!trimmed) continue
    const validation = await validateDiagramSource('mermaid', trimmed)
    if (!validation.valid) {
      logger.warn('Stripping invalid inline mermaid in batch section', {
        error: validation.error?.slice(0, 200),
      })
      const title = extractInlineMermaidTitle(trimmed)
      const replacement = `> [图表语法错误] ${title}——请重新生成此图表`
      result =
        result.slice(0, match.index) + replacement + result.slice(match.index + match.full.length)
    }
  }
  return result
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
  placeholder: ResolvedDiagramPlaceholder
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
          diagramSemantic: placeholder.semantic,
          preferredMermaidType: placeholder.mermaidDiagramKind,
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
            diagramSemantic: placeholder.semantic,
            preferredMermaidType: placeholder.mermaidDiagramKind,
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

      const subContent = await callWithContinuation({
        aiProxy,
        signal,
        caller: `generate-agent:batch:${i}`,
        messages: [
          { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
          { role: 'user', content: subChapterPrompt },
        ],
        maxTokens: 8192,
        usage: totalUsage,
      })

      sectionResults[i] = { kind: 'completed', markdown: subContent.content }

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

  logger.info(
    `Skeleton-batch assembled: "${confirmedSkeleton.parentTitle}", sections=${totalSections}, completed=${countCompleted()}, failed=${getFailedSections().length}, finalLen=${assembledMarkdown.length}`
  )

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

async function handleSkeletonBatchSingle(
  context: Record<string, unknown>,
  signal: AbortSignal,
  updateProgress: ProgressReporter,
  aiProxy?: NonNullable<Parameters<AgentHandler>[1]['aiProxy']>
): Promise<AgentHandlerResult> {
  if (!aiProxy) {
    throw new BidWiseError(ErrorCode.AGENT_EXECUTE, 'AI proxy required for skeleton-batch-single')
  }

  const section = context.section as {
    title: string
    level: number
    dimensions: string[]
    guidanceHint?: string
  }
  const previousSections = (context.previousSections ?? []) as Array<{
    title: string
    markdown: string
  }>

  const activeEntries = await terminologyService.getActiveEntries()
  const terminologyContext = terminologyReplacementService.buildPromptContext(activeEntries)

  const startedAt = Date.now()
  const totalUsage = createEmptyUsage()

  updateProgress(10, 'generating-text')

  // Build previousSectionsSummary: immediately preceding section gets full content,
  // earlier sections get title + truncated summary
  const previousSectionsSummary =
    previousSections.length > 0
      ? previousSections
          .map(({ title: sTitle, markdown: md }) => `**${sTitle}**: ${md}`)
          .join('\n\n')
      : undefined

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
    dimensionFocus: (section.dimensions ?? []).join(', '),
    previousSectionsSummary,
  })

  const subContent = await callWithContinuation({
    aiProxy,
    signal,
    caller: `generate-agent:batch-single:${context.sectionIndex}`,
    messages: [
      { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
      { role: 'user', content: subChapterPrompt },
    ],
    maxTokens: 8192,
    usage: totalUsage,
  })

  // Guard: validate inline mermaid blocks; strip invalid ones
  const guardedContent = await stripInvalidInlineMermaid(subContent.content)

  updateProgress(90, 'composing')

  logger.info(
    `Skeleton-batch-single completed: section="${section.title}", index=${context.sectionIndex}, contentLen=${guardedContent.length}, continuations=${subContent.continuationCount}`
  )

  return wrapResult(guardedContent, totalUsage, Date.now() - startedAt)
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

  // 路径 A：无 aiProxy — 向后兼容回退到 wrapParams
  if (!aiProxy) {
    updateProgress(10, 'generating-text')
    return wrapParams({
      messages: [
        { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 16384,
    })
  }

  const startedAt = Date.now()
  const totalUsage = createEmptyUsage()

  updateProgress(10, 'generating-text')

  const textResult = await callWithContinuation({
    aiProxy,
    signal,
    caller: 'generate-agent:text',
    messages: [
      { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 16384,
    usage: totalUsage,
  })
  throwIfAborted(signal, 'Generate agent cancelled')

  const textContent = textResult.content

  logger.info(
    `Chapter text generated: "${context.chapterTitle}", textLen=${textContent.length}, continuations=${textResult.continuationCount}, enableDiagrams=${enableDiagrams}`
  )

  // 路径 B：有 aiProxy 无图表 — 直接返回
  if (!enableDiagrams) {
    logger.info(
      `Chapter generation complete (no diagrams): "${context.chapterTitle}", totalLen=${textContent.length}`
    )
    return wrapResult(textContent, totalUsage, Date.now() - startedAt)
  }

  // 路径 C：有 aiProxy 有图表 — 继续图表生成流程
  if (textResult.continuationCount > 0 && /%%DIAGRAM:/.test(textContent)) {
    logger.warn('Continuation text contains diagram placeholders despite prompt constraint')
  }

  // Guard: LLM may ignore %%DIAGRAM%% instruction and emit raw ```mermaid blocks.
  // Convert them to placeholders so they enter the validation + repair pipeline.
  const inlineMermaidGuard = convertInlineMermaidToPlaceholders(textContent)
  if (inlineMermaidGuard.count > 0) {
    logger.warn(
      `Converted ${inlineMermaidGuard.count} inline mermaid block(s) to diagram placeholders`,
      { chapterTitle: context.chapterTitle }
    )
  }

  updateProgress(20, 'validating-text')
  const parsed = parseDiagramPlaceholders(inlineMermaidGuard.text)
  let currentMarkdown = parsed.markdownWithSkeletons.trim()

  logger.info(
    `Diagram placeholders parsed: "${context.chapterTitle}", count=${parsed.placeholders.length}, skeletonLen=${currentMarkdown.length}`
  )

  updateProgress(20, 'validating-text', createStreamPayload(currentMarkdown))

  if (parsed.placeholders.length > 0) {
    const resolvedPlaceholders = parsed.placeholders.map((placeholder) =>
      resolveDiagramPlaceholder(placeholder, {
        chapterTitle: context.chapterTitle as string,
        chapterMarkdown: textContent,
      })
    )
    const diagramSummaries: string[] = []
    let completedCount = 0

    await runWithConcurrency(resolvedPlaceholders, MAX_DIAGRAM_CONCURRENCY, async (placeholder) => {
      throwIfAborted(signal, 'Generate agent cancelled')
      updateProgress(35, 'generating-diagrams')

      if (placeholder.requestedType !== placeholder.type) {
        logger.info('Diagram engine rerouted by semantic classifier', {
          placeholderId: placeholder.placeholderId,
          title: placeholder.title,
          requestedType: placeholder.requestedType,
          resolvedType: placeholder.type,
          semantic: placeholder.semantic,
          confidence: placeholder.routingConfidence,
          reasons: placeholder.routingReasons,
        })
      }

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
      const progress = 35 + Math.round((completedCount / resolvedPlaceholders.length) * 25)
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

  logger.info(
    `Chapter generation complete: "${context.chapterTitle}", finalLen=${currentMarkdown.length}, elapsed=${Date.now() - startedAt}ms`
  )
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

  if (context.mode === 'skeleton-batch-single') {
    return handleSkeletonBatchSingle(context, signal, updateProgress, aiProxy)
  }

  if (context.mode === 'skeleton-batch') {
    return handleSkeletonBatch(context, signal, updateProgress, aiProxy, setCheckpoint, checkpoint)
  }

  return handleChapterGeneration(context, signal, updateProgress, aiProxy)
}
