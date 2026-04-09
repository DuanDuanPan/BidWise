import { AnnotationRepository } from '@main/db/repositories/annotation-repo'
import { documentService } from '@main/services/document-service'
import { notificationService } from '@main/services/notification-service'
import { projectService } from '@main/services/project-service'
import { createLogger } from '@main/utils/logger'
import type {
  AnnotationRecord,
  CreateAnnotationInput,
  UpdateAnnotationInput,
  ListAnnotationsInput,
} from '@shared/annotation-types'

const logger = createLogger('annotation-service')
const annotationRepo = new AnnotationRepository()

async function maybeDelayAnnotationListForE2E(): Promise<void> {
  const delayMs = Number.parseInt(process.env.BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS ?? '0', 10)
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function getForcedAnnotationListErrorMessageForE2E(): string | null {
  const message = process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE?.trim()
  return message ? message : null
}

async function syncToSidecar(projectId: string): Promise<void> {
  try {
    const annotations = await annotationRepo.listByProject(projectId, { includeReplies: true })
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      annotations,
    }))
  } catch (err) {
    logger.warn(`批注 sidecar 同步失败 (project: ${projectId}), SQLite 数据已保留`, err)
  }
}

export const annotationService = {
  async create(input: CreateAnnotationInput): Promise<AnnotationRecord> {
    const record = await annotationRepo.create(input)
    await syncToSidecar(record.projectId)

    try {
      const project = await projectService.get(record.projectId)
      const projectName = project.name

      // cross-role annotation notification
      if (record.type === 'cross-role' && record.assignee) {
        await notificationService.notifyCrossRole({ annotation: record, projectName })
      }

      // reply notification
      if (record.parentId) {
        const parent = await annotationRepo.findById(record.parentId)
        if (parent) {
          await notificationService.notifyReplyReceived({
            parentAnnotation: parent,
            reply: record,
            projectName,
          })
        }
      }
    } catch (err) {
      logger.warn('通知触发失败 (create), 批注数据已保留', err)
    }

    return record
  },

  async update(input: UpdateAnnotationInput): Promise<AnnotationRecord> {
    const previous = await annotationRepo.findById(input.id)
    const record = await annotationRepo.update(input)
    await syncToSidecar(record.projectId)

    try {
      // needs-decision notification (only on status transition)
      if (
        record.status === 'needs-decision' &&
        previous?.status !== 'needs-decision' &&
        record.assignee
      ) {
        const project = await projectService.get(record.projectId)
        await notificationService.notifyDecisionRequested({
          annotation: record,
          projectName: project.name,
        })
      }
    } catch (err) {
      logger.warn('通知触发失败 (update), 批注数据已保留', err)
    }

    return record
  },

  async delete(id: string): Promise<void> {
    const existing = await annotationRepo.findById(id)
    await annotationRepo.delete(id)
    if (existing) {
      await syncToSidecar(existing.projectId)
    }
  },

  async list(input: ListAnnotationsInput): Promise<AnnotationRecord[]> {
    await maybeDelayAnnotationListForE2E()

    const forcedErrorMessage = getForcedAnnotationListErrorMessageForE2E()
    if (forcedErrorMessage) {
      throw new Error(forcedErrorMessage)
    }

    const opts = { includeReplies: input.includeReplies }
    if (input.sectionId) {
      return annotationRepo.listBySection(input.projectId, input.sectionId, opts)
    }
    return annotationRepo.listByProject(input.projectId, opts)
  },

  async listReplies(parentId: string): Promise<AnnotationRecord[]> {
    return annotationRepo.listReplies(parentId)
  },

  async syncProjectToSidecar(projectId: string): Promise<void> {
    const annotations = await annotationRepo.listByProject(projectId, { includeReplies: true })
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      annotations,
    }))
  },
}
