import { throwIfAborted } from '@main/utils/abort'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { skillLoader, skillExecutor } from '@main/services/skill-engine'
import type { AgentHandler, AiRequestParams } from '../orchestrator'
import type { SkillExecuteContext } from '@main/services/skill-engine/types'

export const skillAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  const ctx = context as unknown as SkillExecuteContext

  throwIfAborted(signal, 'Skill agent cancelled')

  const skill = skillLoader.getSkill(ctx.skillName)
  if (!skill) {
    throw new BidWiseError(ErrorCode.SKILL_NOT_FOUND, `Skill not found: ${ctx.skillName}`)
  }

  // F12: report progress during prompt expansion (may include shell commands)
  updateProgress(10, `Expanding skill prompt: ${ctx.skillName}`)

  // F7: propagate signal into expandPrompt so shell commands can be cancelled
  const expandedPrompt = await skillExecutor.expandPrompt(skill, ctx.args, ctx.sessionId, signal)

  throwIfAborted(signal, 'Skill agent cancelled')

  updateProgress(50, 'Building AI request')

  const messages = skillExecutor.buildMessages(expandedPrompt, ctx.userMessage, skill)

  return {
    messages,
    model: skill.frontmatter.model,
    maxTokens: skill.frontmatter.maxTokens ?? 8192,
    temperature: skill.frontmatter.temperature ?? 0.3,
  }
}
