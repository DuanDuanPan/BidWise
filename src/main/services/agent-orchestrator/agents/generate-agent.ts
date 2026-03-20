import { generateChapterPrompt } from '@main/prompts/generate-chapter.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const generateAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Generate agent cancelled')

  const chapterTitle = context.chapterTitle as string
  const requirements = context.requirements as string
  const language = context.language as string | undefined

  const prompt = generateChapterPrompt({ chapterTitle, requirements, language })
  throwIfAborted(signal, 'Generate agent cancelled')

  return {
    messages: [
      { role: 'system', content: '你是一个专业的技术方案撰写助手。' },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
  }
}
