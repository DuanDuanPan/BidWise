import {
  classifyCertaintyPrompt,
  type ClassifyCertaintyPromptContext,
} from '@main/prompts/classify-certainty.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const fogMapAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Fog map agent cancelled')

  const promptContext: ClassifyCertaintyPromptContext = {
    requirements: context.requirements as ClassifyCertaintyPromptContext['requirements'],
    scoringModel: (context.scoringModel ?? null) as ClassifyCertaintyPromptContext['scoringModel'],
    mandatoryItems: (context.mandatoryItems ??
      null) as ClassifyCertaintyPromptContext['mandatoryItems'],
    tenderSections: (context.tenderSections ??
      null) as ClassifyCertaintyPromptContext['tenderSections'],
  }

  const prompt = classifyCertaintyPrompt(promptContext)

  throwIfAborted(signal, 'Fog map agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深招标分析师，擅长识别招标文件中的模糊地带和风险区域。请严格按照 JSON 格式输出结果。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
    temperature: 0.3,
  }
}
