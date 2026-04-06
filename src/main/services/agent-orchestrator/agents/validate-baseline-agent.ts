import {
  validateBaselinePrompt,
  VALIDATE_BASELINE_SYSTEM_PROMPT,
} from '@main/prompts/validate-baseline.prompt'
import type { ValidateBaselineContext } from '@main/prompts/validate-baseline.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'
import type { RenderableParagraph } from '@shared/source-attribution-types'

export const validateBaselineAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Validate-baseline agent cancelled')

  // Stage 1: Extracting claims (0%)
  updateProgress(0, 'extracting-claims')

  const promptContext: ValidateBaselineContext = {
    chapterTitle: context.chapterTitle as string,
    paragraphs: context.paragraphs as RenderableParagraph[],
    productBaseline: context.productBaseline as string,
  }

  const prompt = validateBaselinePrompt(promptContext)
  throwIfAborted(signal, 'Validate-baseline agent cancelled')

  // Stage 2: Comparing against baseline (50%)
  updateProgress(50, 'comparing-baseline')

  return {
    messages: [
      { role: 'system', content: VALIDATE_BASELINE_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 4096,
  }
}
