import { adversarialRolePrompt } from '@main/prompts/adversarial-role.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const adversarialAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Adversarial agent cancelled')

  updateProgress(10, '正在整理对抗角色提示词...')

  const requirements = context.requirements as string
  const scoringCriteria = context.scoringCriteria as string
  const strategySeeds = context.strategySeeds as string | undefined
  const proposalType = context.proposalType as string | undefined
  const mandatoryItems = context.mandatoryItems as string | undefined

  const prompt = adversarialRolePrompt({
    requirements,
    scoringCriteria,
    strategySeeds,
    proposalType,
    mandatoryItems,
  })

  throwIfAborted(signal, 'Adversarial agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深投标评审专家，擅长从多维度对投标方案进行攻击性评审。请严格按照 JSON 数组格式输出结果，不要添加任何额外文字。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 4096,
    temperature: 0.7,
  }
}
