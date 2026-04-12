import { createLogger } from '@main/utils/logger'
import { throwIfAborted } from '@main/utils/abort'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { terminologyService } from '@main/services/terminology-service'
import { terminologyReplacementService } from '@main/services/terminology-replacement-service'
import { annotationService } from '@main/services/annotation-service'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import type { ChapterHeadingLocator } from '@shared/chapter-types'
import type { AgentPostProcessor } from '../orchestrator'

const logger = createLogger('terminology-post-processor')

export const terminologyPostProcessor: AgentPostProcessor = async (result, context, signal) => {
  // Only apply to chapter generation mode (not ask-system, not annotation-feedback)
  if (context.mode === 'ask-system' || context.mode === 'annotation-feedback') {
    return result
  }

  throwIfAborted(signal, '术语后处理已取消')

  const entries = await terminologyService.getActiveEntries()
  if (entries.length === 0) {
    return result
  }

  const applyResult = terminologyReplacementService.applyReplacements(result.content, entries)
  if (applyResult.totalReplacements === 0) {
    return result
  }

  logger.info(
    `术语后处理: ${applyResult.totalReplacements} 处替换, ${applyResult.replacements.length} 个术语`
  )

  // Create annotations for each replaced term
  const projectId = context.projectId as string | undefined
  const target = context.target as ChapterHeadingLocator | undefined

  if (projectId && target) {
    const sectionId = createChapterLocatorKey(target)
    let failedCount = 0

    for (const replacement of applyResult.replacements) {
      throwIfAborted(signal, '术语后处理已取消')

      try {
        let content = `已将「${replacement.sourceTerm}」替换为「${replacement.targetTerm}」（术语库自动应用）`
        if (replacement.count > 1) {
          content += `（共 ${replacement.count} 处）`
        }

        await annotationService.create({
          projectId,
          sectionId,
          type: 'ai-suggestion',
          content,
          author: 'system:terminology',
        })
      } catch (err) {
        failedCount++
        logger.error(`术语批注创建失败: ${(err as Error).message}`)
      }
    }

    if (failedCount > 0 && failedCount === applyResult.replacements.length) {
      throw new BidWiseError(
        ErrorCode.AGENT_EXECUTE,
        `术语替换已完成（${applyResult.totalReplacements} 处），但全部 ${failedCount} 条批注创建失败，用户将无法在侧边栏看到替换记录`
      )
    }
    if (failedCount > 0) {
      logger.warn(
        `术语批注部分创建失败: ${failedCount}/${applyResult.replacements.length} 条未写入`
      )
    }
  }

  return {
    ...result,
    content: applyResult.content,
  }
}
