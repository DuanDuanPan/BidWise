import {
  generateChapterPrompt,
  GENERATE_CHAPTER_SYSTEM_PROMPT,
} from '@main/prompts/generate-chapter.prompt'
import type { GenerateChapterContext } from '@main/prompts/generate-chapter.prompt'
import {
  generateDiagramPrompt,
  GENERATE_DIAGRAM_SYSTEM_PROMPT,
} from '@main/prompts/generate-diagram.prompt'
import {
  validateTextDiagramCoherencePrompt,
  VALIDATE_TEXT_DIAGRAM_COHERENCE_SYSTEM_PROMPT,
} from '@main/prompts/validate-text-diagram-coherence.prompt'
import { askSystemPrompt, ASK_SYSTEM_SYSTEM_PROMPT } from '@main/prompts/ask-system.prompt'
import type { AskSystemContext } from '@main/prompts/ask-system.prompt'
import { annotationFeedbackPrompt } from '@main/prompts/annotation-feedback.prompt'
import type { AnnotationFeedbackContext } from '@main/prompts/annotation-feedback.prompt'
import { throwIfAborted } from '@main/utils/abort'
import { terminologyService } from '@main/services/terminology-service'
import { terminologyReplacementService } from '@main/services/terminology-replacement-service'
import { drawioAssetService } from '@main/services/drawio-asset-service'
import {
  buildDrawioMarkdown,
  buildMermaidMarkdown,
  extractJsonObject,
  parseDiagramPlaceholders,
  removeSkeletonPlaceholder,
  replaceSkeletonWithDiagram,
  validateDrawioDiagram,
  validateMermaidDiagram,
  type DiagramPlaceholder,
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
}): Promise<GeneratedDiagram | null> {
  const { aiProxy, signal, usage, projectId, chapterTitle, chapterMarkdown, placeholder } = params
  let repairFeedback: string | undefined
  let previousOutput: string | undefined

  for (let attempt = 0; attempt < MAX_DIAGRAM_ATTEMPTS; attempt++) {
    throwIfAborted(signal, 'Generate agent cancelled')

    const response = await aiProxy.call({
      caller: `generate-agent:diagram:${placeholder.type}`,
      signal,
      maxTokens: 4096,
      messages: [
        { role: 'system', content: GENERATE_DIAGRAM_SYSTEM_PROMPT },
        {
          role: 'user',
          content: generateDiagramPrompt({
            diagramType: placeholder.type,
            chapterTitle,
            chapterMarkdown,
            diagramTitle: placeholder.title,
            diagramDescription: placeholder.description || placeholder.title,
            repairFeedback,
            previousOutput,
          }),
        },
      ],
    })
    accumulateUsage(usage, response)

    const generatedSource =
      placeholder.type === 'mermaid'
        ? stripMermaidFences(response.content)
        : stripDrawioEnvelope(response.content)
    previousOutput = generatedSource

    const validation =
      placeholder.type === 'mermaid'
        ? await validateMermaidDiagram(generatedSource)
        : validateDrawioDiagram(generatedSource)

    if (validation.valid) {
      if (placeholder.type === 'drawio' && projectId) {
        await drawioAssetService.saveDrawioAsset({
          projectId,
          diagramId: placeholder.placeholderId,
          xml: generatedSource,
          fileName: placeholder.assetFileName,
        })
      }

      return {
        placeholder,
        markdown:
          placeholder.type === 'mermaid'
            ? buildMermaidMarkdown({
                diagramId: placeholder.placeholderId,
                assetFileName: placeholder.assetFileName,
                caption: placeholder.title,
                source: generatedSource,
              })
            : buildDrawioMarkdown({
                diagramId: placeholder.placeholderId,
                assetFileName: placeholder.assetFileName,
                caption: placeholder.title,
              }),
        summary: `${placeholder.title}（${placeholder.type}）: ${placeholder.description || placeholder.title}`,
      }
    }

    repairFeedback = validation.error ?? '图表校验失败，请按要求修正。'
  }

  return null
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

      if (diagram) {
        currentMarkdown = replaceSkeletonWithDiagram(
          currentMarkdown,
          placeholder.placeholderId,
          diagram.markdown
        )
        diagramSummaries.push(diagram.summary)
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
        return
      }

      currentMarkdown = removeSkeletonPlaceholder(currentMarkdown, placeholder.placeholderId)
      completedCount += 1
      const progress = 35 + Math.round((completedCount / parsed.placeholders.length) * 25)
      updateProgress(progress, 'generating-diagrams', createStreamPayload(currentMarkdown))
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
  { signal, updateProgress, aiProxy }
): Promise<AgentHandlerResult> => {
  throwIfAborted(signal, 'Generate agent cancelled')

  if (context.mode === 'ask-system') {
    return handleAskSystem(context, signal, updateProgress)
  }

  if (context.mode === 'annotation-feedback') {
    return handleAnnotationFeedback(context, signal, updateProgress)
  }

  return handleChapterGeneration(context, signal, updateProgress, aiProxy)
}
