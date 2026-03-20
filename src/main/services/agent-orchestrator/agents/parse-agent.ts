import { parseRfpPrompt } from '@main/prompts/parse-rfp.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const parseAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Parse agent cancelled')

  const rfpContent = context.rfpContent as string
  const language = context.language as string | undefined

  const prompt = parseRfpPrompt({ rfpContent, language })
  throwIfAborted(signal, 'Parse agent cancelled')

  return {
    messages: [
      { role: 'system', content: '你是一个专业的招标文件分析助手。' },
      { role: 'user', content: prompt },
    ],
    maxTokens: 4096,
  }
}
