import { extractRequirementsPrompt } from '@main/prompts/extract-requirements.prompt'
import { detectMandatoryPrompt } from '@main/prompts/detect-mandatory.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'
import type { TenderSection, RequirementItem } from '@shared/analysis-types'

type ExtractMode = 'requirements-scoring' | 'mandatory-items'

export const extractAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Extract agent cancelled')

  const mode = (context.mode as ExtractMode | undefined) ?? 'requirements-scoring'
  const sections = context.sections as TenderSection[]
  const rawText = context.rawText as string
  const totalPages = context.totalPages as number
  const hasScannedContent = context.hasScannedContent as boolean | undefined

  if (mode === 'mandatory-items') {
    const existingRequirements = (context.existingRequirements ?? []) as RequirementItem[]
    const prompt = detectMandatoryPrompt({
      sections,
      rawText,
      totalPages,
      hasScannedContent,
      existingRequirements: existingRequirements.map((r) => ({
        description: r.description,
        sourcePages: r.sourcePages,
      })),
    })
    throwIfAborted(signal, 'Extract agent cancelled')

    return {
      messages: [
        {
          role: 'system',
          content:
            '你是一位资深售前工程师，专精招标文件合规分析与必响应项（*项）识别。请严格按照 JSON 格式输出结果。',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 8192,
      temperature: 0.2,
    }
  }

  // Default: requirements-scoring mode
  const prompt = extractRequirementsPrompt({
    sections,
    rawText,
    totalPages,
    hasScannedContent,
  })
  throwIfAborted(signal, 'Extract agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深售前工程师，擅长分析招标文件、提取技术需求和评分标准。请严格按照 JSON 格式输出结果。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
    temperature: 0.3,
  }
}
