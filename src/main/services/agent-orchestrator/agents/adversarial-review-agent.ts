import { buildAdversarialReviewPrompt } from '@main/prompts/adversarial-review.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AdversarialIntensity } from '@shared/adversarial-types'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const adversarialReviewAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Adversarial review agent cancelled')

  updateProgress(10, '正在整理评审提示词...')

  const { prompt, temperature, maxTokens } = buildAdversarialReviewPrompt({
    roleName: context.roleName as string,
    rolePerspective: context.rolePerspective as string,
    attackFocus: context.attackFocus as string[],
    intensity: context.intensity as AdversarialIntensity,
    roleDescription: context.roleDescription as string,
    proposalContent: context.proposalContent as string,
    scoringCriteria: context.scoringCriteria as string | undefined,
    mandatoryItems: context.mandatoryItems as string | undefined,
  })

  throwIfAborted(signal, 'Adversarial review agent cancelled')

  return {
    messages: [
      {
        role: 'system',
        content:
          '你是一位资深投标评审专家，正在以指定角色对投标方案进行对抗性攻击审查。请严格按照 JSON 数组格式输出审查发现，不要添加任何额外文字。',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens,
    temperature,
  }
}
