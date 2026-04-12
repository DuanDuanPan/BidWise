import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { throwIfAborted } from '@main/utils/abort'
import { terminologyService } from '@main/services/terminology-service'
import { terminologyReplacementService } from '@main/services/terminology-replacement-service'
import { annotationService } from '@main/services/annotation-service'
import { createChapterLocatorKey } from '@shared/chapter-locator-key'
import { ErrorCode } from '@shared/constants'
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
    const createdIds: string[] = []
    let failedCount = 0

    for (const replacement of applyResult.replacements) {
      if (signal?.aborted) {
        logger.info('术语后处理已取消，跳过剩余批注创建')
        break
      }

      try {
        let content = `已将「${replacement.sourceTerm}」替换为「${replacement.targetTerm}」（术语库自动应用）`
        if (replacement.count > 1) {
          content += `（共 ${replacement.count} 处）`
        }

        const record = await annotationService.create({
          projectId,
          sectionId,
          type: 'ai-suggestion',
          content,
          author: 'system:terminology',
        })
        createdIds.push(record.id)
      } catch (err) {
        failedCount++
        logger.error(`术语批注创建失败: ${(err as Error).message}`)
      }
    }

    // On abort, roll back ALL created annotations to prevent orphan leaks
    if (signal?.aborted) {
      if (createdIds.length > 0) {
        logger.info(`术语后处理已取消，回滚 ${createdIds.length} 条已创建批注`)
        for (const id of createdIds) {
          try {
            await annotationService.delete(id)
          } catch (deleteErr) {
            logger.warn(`取消后批注回滚失败 (${id}): ${(deleteErr as Error).message}`)
          }
        }
      }
      // Return replaced content — orchestrator's throwIfAborted() will discard it
      return { ...result, content: applyResult.content }
    }

    // AC3: every replaced term must have an annotation — partial failure is an error
    if (failedCount > 0) {
      // Roll back successfully created annotations since the operation is incomplete
      for (const id of createdIds) {
        try {
          await annotationService.delete(id)
        } catch (deleteErr) {
          logger.warn(`批注回滚失败 (${id}): ${(deleteErr as Error).message}`)
        }
      }
      throw new BidWiseError(
        ErrorCode.ANNOTATION_CREATION_FAILED,
        `术语替换已完成（${applyResult.totalReplacements} 处），但 ${failedCount}/${applyResult.replacements.length} 条批注创建失败，用户将无法在侧边栏看到完整替换记录`
      )
    }
  }

  return {
    ...result,
    content: applyResult.content,
  }
}
