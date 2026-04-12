import {
  attackChecklistPrompt,
  ATTACK_CHECKLIST_SYSTEM_PROMPT,
} from '@main/prompts/attack-checklist.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const attackChecklistAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Attack checklist agent cancelled')

  updateProgress(10, '正在分析项目攻击面...')

  const requirements = context.requirements as string
  const scoringCriteria = context.scoringCriteria as string
  const mandatoryItems = context.mandatoryItems as string | undefined
  const strategySeed = context.strategySeed as string | undefined
  const proposalType = context.proposalType as string | undefined
  const industry = context.industry as string | undefined

  const prompt = attackChecklistPrompt({
    requirements,
    scoringCriteria,
    mandatoryItems,
    strategySeed,
    proposalType,
    industry,
  })

  throwIfAborted(signal, 'Attack checklist agent cancelled')

  updateProgress(30, '正在生成攻击清单...')

  return {
    messages: [
      { role: 'system', content: ATTACK_CHECKLIST_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 4096,
    temperature: 0.7,
  }
}
