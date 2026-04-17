/**
 * Chapter summary service (Story 3.12).
 *
 * Thin facade over `agent-orchestrator` that the write-side (EditorView /
 * batch pipeline) and IPC layer call to kick off a best-effort summary
 * extraction for a single chapter locator.
 *
 * Failure is swallowed at the task-queue layer — summary is a cache, not a
 * blocker for chapter generation success.
 */
import { agentOrchestrator } from '@main/services/agent-orchestrator'
import { createLogger } from '@main/utils/logger'
import type {
  ChapterSummaryExtractInput,
  ChapterSummaryExtractOutput,
} from '@shared/chapter-summary-types'

const logger = createLogger('chapter-summary-service')

const CHAPTER_SUMMARY_TIMEOUT_MS = 60_000
const CHAPTER_SUMMARY_MAX_RETRIES = 2

export const chapterSummaryService = {
  async enqueueExtraction(input: ChapterSummaryExtractInput): Promise<ChapterSummaryExtractOutput> {
    const response = await agentOrchestrator.execute({
      agentType: 'chapter-summary',
      context: {
        projectId: input.projectId,
        locator: input.locator,
        ...(input.directBody !== undefined ? { directBody: input.directBody } : {}),
      },
      options: {
        priority: 'low',
        timeoutMs: CHAPTER_SUMMARY_TIMEOUT_MS,
        maxRetries: CHAPTER_SUMMARY_MAX_RETRIES,
      },
    })

    logger.info(
      `chapter-summary extraction enqueued: project=${input.projectId} locator="${input.locator.title}" taskId=${response.taskId}`
    )

    return { taskId: response.taskId }
  },
}
