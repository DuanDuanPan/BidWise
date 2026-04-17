/**
 * Chapter summary agent (Story 3.12).
 *
 * Given a project / locator, loads the current document, extracts the chapter's
 * direct body, and asks the LLM for a structured summary. The resulting content
 * is parsed and persisted to sidecar by `chapterSummaryPostProcessor`.
 *
 * AI calls go through the orchestrator → ai-proxy path so desensitization +
 * trace logging apply uniformly with every other agent.
 */
import { throwIfAborted } from '@main/utils/abort'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { documentService } from '@main/services/document-service'
import { getMarkdownDirectSectionBody } from '@shared/chapter-markdown'
import {
  summarizeChapterPrompt,
  SUMMARIZE_CHAPTER_SYSTEM_PROMPT,
} from '@main/prompts/summarize-chapter.prompt'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { AgentHandler, AiRequestParams } from '../orchestrator'

export const chapterSummaryAgentHandler: AgentHandler = async (
  context: Record<string, unknown>,
  { signal, updateProgress }
): Promise<AiRequestParams> => {
  throwIfAborted(signal, 'Chapter-summary agent cancelled')

  const projectId = context.projectId as string | undefined
  const locator = context.locator as ChapterHeadingLocator | undefined
  const preExtractedDirectBody = context.directBody as string | undefined
  if (!projectId || !locator) {
    throw new BidWiseError(
      ErrorCode.AGENT_EXECUTE,
      'chapter-summary agent 缺少 projectId 或 locator'
    )
  }

  updateProgress(10, 'loading-section')

  // Prefer the caller-supplied directBody. It is bounded by one chapter's
  // body (vs. a whole-document snapshot that would persist on every queue
  // row), and avoids the "autosave has not flushed yet" race because the
  // renderer computed it against the freshly-applied document. Disk fallback
  // is only for callers that did not pre-extract.
  const directBody =
    preExtractedDirectBody !== undefined
      ? preExtractedDirectBody
      : getMarkdownDirectSectionBody((await documentService.load(projectId)).content, locator)

  throwIfAborted(signal, 'Chapter-summary agent cancelled')

  updateProgress(40, 'summarizing')

  const prompt = summarizeChapterPrompt({
    chapterTitle: locator.title,
    chapterLevel: locator.level,
    directBody,
  })

  return {
    messages: [
      { role: 'system', content: SUMMARIZE_CHAPTER_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    maxTokens: 512,
    temperature: 0.2,
  }
}
