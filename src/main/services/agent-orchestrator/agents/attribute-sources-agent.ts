import {
  attributeSourcesPrompt,
  ATTRIBUTE_SOURCES_SYSTEM_PROMPT,
} from '@main/prompts/attribute-sources.prompt'
import type { AttributeSourcesContext } from '@main/prompts/attribute-sources.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'
import type { RenderableParagraph } from '@shared/source-attribution-types'

export const attributeSourcesAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Attribute-sources agent cancelled')

  // Stage 1: Parsing paragraphs (0%)
  updateProgress(0, 'parsing-paragraphs')

  const promptContext: AttributeSourcesContext = {
    chapterTitle: context.chapterTitle as string,
    paragraphs: context.paragraphs as RenderableParagraph[],
    availableAssetHints: context.availableAssetHints as string[] | undefined,
    knowledgeHints: context.knowledgeHints as string[] | undefined,
  }

  const prompt = attributeSourcesPrompt(promptContext)
  throwIfAborted(signal, 'Attribute-sources agent cancelled')

  // Stage 2: Analyzing sources (50%)
  updateProgress(50, 'analyzing-sources')

  return {
    messages: [
      { role: 'system', content: ATTRIBUTE_SOURCES_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 4096,
  }
}
