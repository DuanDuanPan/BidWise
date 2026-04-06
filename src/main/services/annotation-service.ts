import { AnnotationRepository } from '@main/db/repositories/annotation-repo'
import { documentService } from '@main/services/document-service'
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

async function syncToSidecar(projectId: string): Promise<void> {
  try {
    const annotations = await annotationRepo.listByProject(projectId)
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
    return record
  },

  async update(input: UpdateAnnotationInput): Promise<AnnotationRecord> {
    const record = await annotationRepo.update(input)
    await syncToSidecar(record.projectId)
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

    if (input.sectionId) {
      return annotationRepo.listBySection(input.projectId, input.sectionId)
    }
    return annotationRepo.listByProject(input.projectId)
  },

  async syncProjectToSidecar(projectId: string): Promise<void> {
    const annotations = await annotationRepo.listByProject(projectId)
    await documentService.updateMetadata(projectId, (current) => ({
      ...current,
      annotations,
    }))
  },
}
