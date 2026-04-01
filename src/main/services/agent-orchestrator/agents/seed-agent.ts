import { generateSeedPrompt } from '@main/prompts/generate-seed.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const seedAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Seed agent cancelled')

  const sourceMaterial = context.sourceMaterial as string
  const existingRequirements = (context.existingRequirements ?? []) as Array<{
    description: string
    sourcePages: number[]
  }>
  const scoringModel = context.scoringModel as
    | { criteria: Array<{ category: string; maxScore: number; weight: number }> }
    | undefined
  const mandatoryItems = (context.mandatoryItems ?? []) as Array<{ content: string }>

  const prompt = generateSeedPrompt({
    sourceMaterial,
    existingRequirements,
    scoringModel,
    mandatoryItems,
  })

  throwIfAborted(signal, 'Seed agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深售前架构师，擅长从客户沟通中捕捉隐性需求并转化为投标策略。请严格按照 JSON 格式输出结果。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
    temperature: 0.5,
  }
}
