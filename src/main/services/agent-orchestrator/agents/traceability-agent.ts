import { generateTraceabilityPrompt } from '@main/prompts/generate-traceability.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const traceabilityAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Traceability agent cancelled')

  const requirements = context.requirements as Array<{
    id: string
    sequenceNumber: number
    description: string
    category: string
  }>
  const sections = context.sections as Array<{
    sectionId: string
    title: string
    level: number
  }>
  const existingManualLinks = context.existingManualLinks as
    | Array<{ requirementId: string; sectionId: string; coverageStatus: string }>
    | undefined

  const prompt = generateTraceabilityPrompt({
    requirements,
    sections,
    existingManualLinks,
  })

  throwIfAborted(signal, 'Traceability agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深售前合规工程师，专精招标需求追溯分析与方案覆盖评估。请严格按照 JSON 格式输出结果。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
    temperature: 0.2,
  }
}
