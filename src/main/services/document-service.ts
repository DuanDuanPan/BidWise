import { join, resolve } from 'path'
import { app } from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { projectService } from '@main/services/project-service'
import { ErrorCode } from '@shared/constants'
import {
  BidWiseError,
  DocumentNotFoundError,
  DocumentSaveError,
  ValidationError,
} from '@main/utils/errors'
import { createLogger } from '@main/utils/logger'
import type { ProposalDocument, ProposalMetadata } from '@shared/models/proposal'

const logger = createLogger('document-service')
const latestSaveSequenceByProject = new Map<string, number>()
const DOCUMENT_VERSION = 1
const METADATA_VERSION = '1.0'

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isErrnoException(error) && error.code === code
}

function getExpectedProjectRootPath(projectId: string): string {
  return resolve(app.getPath('userData'), 'data', 'projects', projectId)
}

function validateProjectRootPath(projectId: string, rootPath: string): string {
  const normalizedRootPath = resolve(rootPath)
  const expectedRootPath = getExpectedProjectRootPath(projectId)

  if (normalizedRootPath !== expectedRootPath) {
    throw new ValidationError(`非法项目目录路径: ${normalizedRootPath}`)
  }

  return normalizedRootPath
}

async function getProjectRootPath(projectId: string): Promise<string> {
  const project = await projectService.get(projectId)
  if (!project.rootPath) {
    throw new DocumentNotFoundError(`项目 ${projectId} 没有 rootPath`)
  }
  return validateProjectRootPath(projectId, project.rootPath)
}

function beginSave(projectId: string): number {
  const nextSequence = (latestSaveSequenceByProject.get(projectId) ?? 0) + 1
  latestSaveSequenceByProject.set(projectId, nextSequence)
  return nextSequence
}

function isLatestSave(projectId: string, sequence: number): boolean {
  return latestSaveSequenceByProject.get(projectId) === sequence
}

function getDocumentPaths(
  rootPath: string,
  sequence: number
): {
  filePath: string
  metaPath: string
  tmpPath: string
  metaTmpPath: string
} {
  return {
    filePath: join(rootPath, 'proposal.md'),
    metaPath: join(rootPath, 'proposal.meta.json'),
    tmpPath: join(rootPath, `.proposal.md.tmp.${sequence}`),
    metaTmpPath: join(rootPath, `.proposal.meta.json.tmp.${sequence}`),
  }
}

function buildDefaultMetadata(projectId: string, lastSavedAt: string): ProposalMetadata {
  return {
    version: METADATA_VERSION,
    projectId,
    annotations: [],
    scores: [],
    lastSavedAt,
  }
}

function normalizeMetadata(
  projectId: string,
  lastSavedAt: string,
  meta?: Partial<ProposalMetadata>
): ProposalMetadata {
  return {
    version: meta?.version || METADATA_VERSION,
    projectId,
    annotations: Array.isArray(meta?.annotations) ? meta.annotations : [],
    scores: Array.isArray(meta?.scores) ? meta.scores : [],
    ...(meta?.sectionWeights !== undefined ? { sectionWeights: meta.sectionWeights } : {}),
    ...(meta?.templateId !== undefined ? { templateId: meta.templateId } : {}),
    lastSavedAt: meta?.lastSavedAt || lastSavedAt,
  }
}

function parseMetadata(
  metaRaw: string,
  metaPath: string,
  projectId: string
): Partial<ProposalMetadata> {
  let parsed: unknown

  try {
    parsed = JSON.parse(metaRaw)
  } catch (error) {
    throw new BidWiseError(
      ErrorCode.PARSE,
      `${metaPath} 不是合法 JSON: ${(error as Error).message}`,
      error
    )
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 必须是 JSON 对象`)
  }

  const metadata = parsed as Partial<ProposalMetadata>

  if (metadata.version !== undefined && typeof metadata.version !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 version 必须是字符串`)
  }
  if (metadata.projectId !== undefined && typeof metadata.projectId !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 projectId 必须是字符串`)
  }
  if (metadata.projectId && metadata.projectId !== projectId) {
    throw new BidWiseError(
      ErrorCode.PARSE,
      `${metaPath} projectId 与当前项目不匹配: ${metadata.projectId}`
    )
  }
  if (metadata.annotations !== undefined && !Array.isArray(metadata.annotations)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 annotations 必须是数组`)
  }
  if (metadata.scores !== undefined && !Array.isArray(metadata.scores)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 scores 必须是数组`)
  }
  if (metadata.lastSavedAt !== undefined && typeof metadata.lastSavedAt !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 lastSavedAt 必须是字符串`)
  }
  if (metadata.sectionWeights !== undefined && !Array.isArray(metadata.sectionWeights)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 sectionWeights 必须是数组`)
  }
  if (metadata.templateId !== undefined && typeof metadata.templateId !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 templateId 必须是字符串`)
  }

  return metadata
}

async function readMetadata(
  metaPath: string,
  projectId: string,
  lastSavedAt: string
): Promise<ProposalMetadata> {
  try {
    const metaRaw = await readFile(metaPath, 'utf-8')
    return normalizeMetadata(projectId, lastSavedAt, parseMetadata(metaRaw, metaPath, projectId))
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return buildDefaultMetadata(projectId, lastSavedAt)
    }
    throw error
  }
}

function readMetadataSync(
  metaPath: string,
  projectId: string,
  lastSavedAt: string
): ProposalMetadata {
  try {
    const metaRaw = readFileSync(metaPath, 'utf-8')
    return normalizeMetadata(projectId, lastSavedAt, parseMetadata(metaRaw, metaPath, projectId))
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return buildDefaultMetadata(projectId, lastSavedAt)
    }
    throw error
  }
}

async function cleanupTmpFile(tmpPath: string): Promise<void> {
  try {
    await rm(tmpPath, { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

function cleanupTmpFileSync(tmpPath: string): void {
  try {
    rmSync(tmpPath, { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

export const documentService = {
  async load(projectId: string): Promise<ProposalDocument> {
    const rootPath = await getProjectRootPath(projectId)
    const filePath = join(rootPath, 'proposal.md')
    const metaPath = join(rootPath, 'proposal.meta.json')

    let content = ''
    try {
      content = await readFile(filePath, 'utf-8')
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        logger.error(`proposal.md 读取失败: ${projectId}`, error)
        throw new BidWiseError(
          ErrorCode.FILE_SYSTEM,
          `方案文件读取失败: ${(error as Error).message}`,
          error
        )
      }
      logger.info(`proposal.md 不存在，返回空内容: ${projectId}`)
    }

    const metadata = await readMetadata(metaPath, projectId, new Date().toISOString())

    return {
      projectId,
      content,
      lastSavedAt: metadata.lastSavedAt,
      version: DOCUMENT_VERSION,
    }
  },

  async save(projectId: string, content: string): Promise<{ lastSavedAt: string }> {
    const rootPath = await getProjectRootPath(projectId)
    const sequence = beginSave(projectId)
    const { filePath, metaPath, tmpPath, metaTmpPath } = getDocumentPaths(rootPath, sequence)
    const lastSavedAt = new Date().toISOString()

    try {
      await writeFile(tmpPath, content, 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        await cleanupTmpFile(tmpPath)
        return { lastSavedAt }
      }
      await rename(tmpPath, filePath)
    } catch (err) {
      logger.error(`proposal.md 写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`方案文件保存失败: ${(err as Error).message}`, err)
    }

    // Update sidecar metadata lastSavedAt (AC2: md + sidecar must be synchronized)
    if (!isLatestSave(projectId, sequence)) {
      return { lastSavedAt }
    }

    const meta = await readMetadata(metaPath, projectId, lastSavedAt)
    try {
      await writeFile(metaTmpPath, JSON.stringify(meta, null, 2), 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        await cleanupTmpFile(metaTmpPath)
        return { lastSavedAt }
      }
      await rename(metaTmpPath, metaPath)
    } catch (err) {
      logger.error(`proposal.meta.json 写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`元数据保存失败: ${(err as Error).message}`, err)
    }

    return { lastSavedAt }
  },

  saveSync(projectId: string, rootPath: string, content: string): { lastSavedAt: string } {
    const validatedRootPath = validateProjectRootPath(projectId, rootPath)
    const sequence = beginSave(projectId)
    const { filePath, metaPath, tmpPath, metaTmpPath } = getDocumentPaths(
      validatedRootPath,
      sequence
    )
    const lastSavedAt = new Date().toISOString()

    try {
      writeFileSync(tmpPath, content, 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        cleanupTmpFileSync(tmpPath)
        return { lastSavedAt }
      }
      renameSync(tmpPath, filePath)
    } catch (err) {
      logger.error(`proposal.md 同步写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`方案文件保存失败: ${(err as Error).message}`, err)
    }

    if (!isLatestSave(projectId, sequence)) {
      return { lastSavedAt }
    }

    const meta = readMetadataSync(metaPath, projectId, lastSavedAt)
    try {
      writeFileSync(metaTmpPath, JSON.stringify(meta, null, 2), 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        cleanupTmpFileSync(metaTmpPath)
        return { lastSavedAt }
      }
      renameSync(metaTmpPath, metaPath)
    } catch (err) {
      logger.error(`proposal.meta.json 同步写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`元数据保存失败: ${(err as Error).message}`, err)
    }

    return { lastSavedAt }
  },

  async getMetadata(projectId: string): Promise<ProposalMetadata> {
    const rootPath = await getProjectRootPath(projectId)
    const metaPath = join(rootPath, 'proposal.meta.json')
    return readMetadata(metaPath, projectId, new Date().toISOString())
  },

  async updateMetadata(
    projectId: string,
    updater: (current: ProposalMetadata) => ProposalMetadata
  ): Promise<ProposalMetadata> {
    const rootPath = await getProjectRootPath(projectId)
    const metaPath = join(rootPath, 'proposal.meta.json')
    const sequence = beginSave(projectId)
    const current = await readMetadata(metaPath, projectId, new Date().toISOString())
    const updated = updater(current)

    try {
      const tmpPath = join(rootPath, `.proposal.meta.json.tmp.${sequence}`)
      await writeFile(tmpPath, JSON.stringify(updated, null, 2), 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        await cleanupTmpFile(tmpPath)
        return updated
      }
      await rename(tmpPath, metaPath)
    } catch (err) {
      logger.error(`proposal.meta.json 更新失败: ${projectId}`, err)
      throw new DocumentSaveError(`元数据更新失败: ${(err as Error).message}`, err)
    }

    return updated
  },
}
