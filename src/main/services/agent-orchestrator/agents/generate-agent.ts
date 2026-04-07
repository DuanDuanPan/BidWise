import {
  generateChapterPrompt,
  GENERATE_CHAPTER_SYSTEM_PROMPT,
} from '@main/prompts/generate-chapter.prompt'
import type { GenerateChapterContext } from '@main/prompts/generate-chapter.prompt'
import { throwIfAborted } from '@main/utils/abort'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const generateAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Generate agent cancelled')

  // Stage 1: Analyzing (0%)
  updateProgress(0, 'analyzing')

  const promptContext: GenerateChapterContext = {
    chapterTitle: context.chapterTitle as string,
    chapterLevel: (context.chapterLevel as number) ?? 2,
    requirements: context.requirements as string,
    guidanceText: context.guidanceText as string | undefined,
    scoringWeights: context.scoringWeights as string | undefined,
    mandatoryItems: context.mandatoryItems as string | undefined,
    writingStyle: context.writingStyle as string | undefined,
    adjacentChaptersBefore: context.adjacentChaptersBefore as string | undefined,
    adjacentChaptersAfter: context.adjacentChaptersAfter as string | undefined,
    strategySeed: context.strategySeed as string | undefined,
    additionalContext: context.additionalContext as string | undefined,
  }

  const prompt = generateChapterPrompt(promptContext)
  throwIfAborted(signal, 'Generate agent cancelled')

  // Stage 2: Asset matching (25%) — Alpha placeholder, quick skip
  updateProgress(25, 'matching-assets')

  throwIfAborted(signal, 'Generate agent cancelled')

  // Stage 3: Generating (50%) — actual AI call happens after this return
  updateProgress(50, 'generating')

  return {
    messages: [
      { role: 'system', content: GENERATE_CHAPTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 8192,
  }
}
