import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { createLogger } from '@main/utils/logger'
import { throwIfAborted } from '@main/utils/abort'
import { generateSkillDiagram } from '@main/services/skill-diagram-generation-service'
import type {
  ExecuteAiDiagramAgentInput,
  ExecuteAiDiagramAgentOutput,
} from '@shared/ai-diagram-types'
import type { AgentHandler, AgentHandlerResult } from '../orchestrator'

const logger = createLogger('skill-diagram-agent')

function wrapResult(
  content: string,
  usage: { promptTokens: number; completionTokens: number },
  latencyMs: number
): AgentHandlerResult {
  return {
    kind: 'result',
    value: {
      content,
      usage,
      latencyMs,
    },
  }
}

export const skillDiagramAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress, aiProxy }
): Promise<AgentHandlerResult> => {
  throwIfAborted(signal, 'Skill diagram agent cancelled')

  if (!aiProxy) {
    throw new BidWiseError(ErrorCode.AGENT_EXECUTE, 'AI proxy 不可用，无法生成图表')
  }

  const ctx = context as unknown as ExecuteAiDiagramAgentInput
  const startedAt = Date.now()
  const usage = { promptTokens: 0, completionTokens: 0 }

  updateProgress(10, '准备增强版图表生成...')
  throwIfAborted(signal, 'Skill diagram agent cancelled')

  const result = await generateSkillDiagram({
    input: {
      diagramId: ctx.diagramId,
      title: ctx.title,
      description: ctx.prompt,
      style: ctx.style,
      diagramType: ctx.diagramType,
      chapterTitle: ctx.chapterTitle || ctx.title,
      chapterMarkdown: ctx.chapterMarkdown || ctx.prompt,
      assetFileName: ctx.assetFileName,
    },
    projectId: ctx.projectId,
    aiProxy,
    signal,
    usage,
  })

  if (result.kind !== 'success' || !result.assetFileName || !result.svgContent) {
    logger.warn('Enhanced skill diagram generation failed', {
      diagramId: ctx.diagramId,
      title: ctx.title,
      error: result.error,
      repairAttempts: result.repairAttempts,
    })
    throw new BidWiseError(ErrorCode.AGENT_EXECUTE, result.error || '增强版图表生成失败')
  }

  updateProgress(100, '图表生成完成')

  const output: ExecuteAiDiagramAgentOutput = {
    diagramId: ctx.diagramId,
    assetFileName: result.assetFileName,
    prompt: ctx.prompt,
    title: ctx.title,
    style: ctx.style,
    diagramType: ctx.diagramType,
    svgContent: result.svgContent,
    repairAttempts: result.repairAttempts,
  }

  return wrapResult(JSON.stringify(output), usage, Date.now() - startedAt)
}
