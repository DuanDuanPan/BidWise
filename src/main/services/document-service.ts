import { join, resolve } from 'path'
import { app } from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { readFile, rename, rm, writeFile } from 'fs/promises'
import { projectService } from '@main/services/project-service'
import { chapterIdentityMigrationService } from '@main/services/chapter-identity-migration-service'
import { ErrorCode } from '@shared/constants'
import {
  createContentDigest,
  extractMarkdownHeadings,
  findMarkdownHeading,
} from '@shared/chapter-markdown'
import type { DocumentSaveDebugContext } from '@shared/ipc-types'
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
const metadataLock = new Map<string, Promise<unknown>>()
const DOCUMENT_VERSION = 1
const METADATA_VERSION = '1.0'

// Shrink guard: U+200B + \n is Plate's empty-editor canonical serialization (2 bytes).
// If existing file has meaningful content and new payload is near-empty, reject the write.
const SHRINK_GUARD_MIN_EXISTING_CHARS = 100
const SHRINK_GUARD_RATIO = 0.1

function meaningfulLength(text: string | undefined | null): number {
  if (!text) return 0
  return text.replace(/[\u200B\s]/g, '').length
}

type ShrinkGuardVerdict = {
  block: boolean
  reason: string
  existingMeaningful: number
  newMeaningful: number
}

function evaluateShrinkGuard(existing: string, next: string): ShrinkGuardVerdict {
  const existingMeaningful = meaningfulLength(existing)
  const newMeaningful = meaningfulLength(next)
  if (existingMeaningful < SHRINK_GUARD_MIN_EXISTING_CHARS) {
    return { block: false, reason: 'below-min', existingMeaningful, newMeaningful }
  }
  if (newMeaningful >= existingMeaningful * SHRINK_GUARD_RATIO) {
    return { block: false, reason: 'within-ratio', existingMeaningful, newMeaningful }
  }
  return {
    block: true,
    reason: `catastrophic shrink ${existingMeaningful} → ${newMeaningful}`,
    existingMeaningful,
    newMeaningful,
  }
}

function getBackupPath(filePath: string): string {
  return `${filePath}.prev.bak`
}

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
    sourceAttributions: [],
    baselineValidations: [],
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
    sourceAttributions: Array.isArray(meta?.sourceAttributions) ? meta.sourceAttributions : [],
    baselineValidations: Array.isArray(meta?.baselineValidations) ? meta.baselineValidations : [],
    ...(meta?.sectionWeights !== undefined ? { sectionWeights: meta.sectionWeights } : {}),
    ...(meta?.sectionIndex !== undefined ? { sectionIndex: meta.sectionIndex } : {}),
    ...(meta?.templateId !== undefined ? { templateId: meta.templateId } : {}),
    ...(meta?.writingStyleId !== undefined ? { writingStyleId: meta.writingStyleId } : {}),
    ...(meta?.confirmedSkeletons !== undefined
      ? { confirmedSkeletons: meta.confirmedSkeletons }
      : {}),
    ...(meta?.chapterIdentitySchemaVersion !== undefined
      ? { chapterIdentitySchemaVersion: meta.chapterIdentitySchemaVersion }
      : {}),
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
  if (metadata.sourceAttributions !== undefined && !Array.isArray(metadata.sourceAttributions)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 sourceAttributions 必须是数组`)
  }
  if (metadata.baselineValidations !== undefined && !Array.isArray(metadata.baselineValidations)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 baselineValidations 必须是数组`)
  }
  if (metadata.sectionWeights !== undefined && !Array.isArray(metadata.sectionWeights)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 sectionWeights 必须是数组`)
  }
  if (metadata.sectionIndex !== undefined && !Array.isArray(metadata.sectionIndex)) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 sectionIndex 必须是数组`)
  }
  if (metadata.templateId !== undefined && typeof metadata.templateId !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 templateId 必须是字符串`)
  }
  if (metadata.writingStyleId !== undefined && typeof metadata.writingStyleId !== 'string') {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 writingStyleId 必须是字符串`)
  }
  if (
    metadata.confirmedSkeletons !== undefined &&
    (typeof metadata.confirmedSkeletons !== 'object' ||
      metadata.confirmedSkeletons === null ||
      Array.isArray(metadata.confirmedSkeletons))
  ) {
    throw new BidWiseError(ErrorCode.PARSE, `${metaPath} 字段 confirmedSkeletons 必须是对象`)
  }
  if (
    metadata.chapterIdentitySchemaVersion !== undefined &&
    metadata.chapterIdentitySchemaVersion !== 1 &&
    metadata.chapterIdentitySchemaVersion !== 2
  ) {
    throw new BidWiseError(
      ErrorCode.PARSE,
      `${metaPath} 字段 chapterIdentitySchemaVersion 仅接受 1 或 2`
    )
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

function findSuspiciousHeadingLines(markdown: string): string[] {
  return markdown
    .split('\n')
    .flatMap((line, index) => (/^(#{1,4})\s+.*>\s*\S/.test(line) ? [`${index + 1}: ${line}`] : []))
    .slice(0, 8)
}

function collectTargetWindow(markdown: string, debugContext?: DocumentSaveDebugContext): string[] {
  const target = debugContext?.target
  if (!target) return []

  const lines = markdown.split('\n')
  const headings = extractMarkdownHeadings(markdown)
  const targetHeading = findMarkdownHeading(headings, target)
  if (!targetHeading) return []

  const start = Math.max(0, targetHeading.lineIndex - 1)
  const end = Math.min(lines.length, targetHeading.lineIndex + 4)
  return lines.slice(start, end).map((line, index) => `${start + index + 1}: ${line}`)
}

function summarizeDebugTrail(debugTrail?: DocumentSaveDebugContext[]): string[] {
  return (debugTrail ?? []).map(
    (entry) => `${entry.source}:${entry.contentDigest ?? 'no-digest'}:${entry.contentLength ?? 0}`
  )
}

function buildSaveDebugPayload(
  content: string,
  debugContext?: DocumentSaveDebugContext,
  debugTrail?: DocumentSaveDebugContext[]
): Record<string, unknown> {
  return {
    source: debugContext?.source ?? 'unknown',
    note: debugContext?.note,
    target: debugContext?.target ?? null,
    contentLength: content.length,
    contentDigest: createContentDigest(content),
    upstreamDigest: debugContext?.contentDigest,
    upstreamSuspiciousHeadings: debugContext?.suspiciousHeadings ?? [],
    upstreamSectionWindow: debugContext?.sectionWindow ?? [],
    candidateDigests: debugContext?.candidateDigests ?? [],
    contentTargetWindow: collectTargetWindow(content, debugContext),
    suspiciousHeadings: findSuspiciousHeadingLines(content),
    debugTrail: summarizeDebugTrail(debugTrail),
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

async function withMetadataLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const previous = metadataLock.get(projectId) ?? Promise.resolve()
  let releaseLock!: () => void
  const next = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  metadataLock.set(projectId, next)

  try {
    await previous
    return await fn()
  } finally {
    releaseLock()
  }
}

/**
 * Story 11.1: lazy per-session gate that ensures a project is on the latest
 * chapter identity schema before any metadata read/write. Log-only on
 * failure — we must not block proposal reads when migration has a transient
 * issue (disk, SQLite lock); downstream services can still operate on the
 * legacy shape until migration retries.
 */
async function ensureChapterIdentityUpgraded(projectId: string): Promise<void> {
  try {
    await chapterIdentityMigrationService.ensureMigrated(projectId)
  } catch (err) {
    logger.warn(`Chapter identity migration deferred for ${projectId}: ${(err as Error).message}`)
  }
}

export const documentService = {
  async load(projectId: string): Promise<ProposalDocument> {
    const rootPath = await getProjectRootPath(projectId)
    await ensureChapterIdentityUpgraded(projectId)
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

  async save(
    projectId: string,
    content: string,
    debugContext?: DocumentSaveDebugContext,
    debugTrail?: DocumentSaveDebugContext[]
  ): Promise<{ lastSavedAt: string }> {
    const rootPath = await getProjectRootPath(projectId)
    const sequence = beginSave(projectId)
    const { filePath, tmpPath } = getDocumentPaths(rootPath, sequence)
    const lastSavedAt = new Date().toISOString()
    const debugPayload = buildSaveDebugPayload(content, debugContext, debugTrail)

    logger.info(`proposal.md save requested: ${projectId} seq=${sequence}`, debugPayload)

    let existingContent = ''
    try {
      existingContent = await readFile(filePath, 'utf-8')
    } catch (err) {
      if (!hasErrorCode(err, 'ENOENT')) {
        logger.warn(`proposal.md 预读失败 (shrink-guard跳过): ${projectId}`, err)
      }
    }

    const verdict = evaluateShrinkGuard(existingContent, content)
    if (verdict.block) {
      logger.error(
        `proposal.md save refused (shrink-guard): ${projectId} seq=${sequence} existing=${verdict.existingMeaningful} new=${verdict.newMeaningful}`,
        debugPayload
      )
      throw new DocumentSaveError(
        `保存被拒：内容从 ${verdict.existingMeaningful} 字符骤降至 ${verdict.newMeaningful} 字符，疑似空编辑器误覆盖`
      )
    }

    try {
      await writeFile(tmpPath, content, 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        await cleanupTmpFile(tmpPath)
        logger.info(
          `proposal.md save skipped (superseded): ${projectId} seq=${sequence}`,
          debugPayload
        )
        return { lastSavedAt }
      }
      if (existingContent) {
        try {
          await writeFile(getBackupPath(filePath), existingContent, 'utf-8')
        } catch (backupErr) {
          logger.warn(`proposal.md 备份写入失败 (不阻断保存): ${projectId}`, backupErr)
        }
      }
      await rename(tmpPath, filePath)
    } catch (err) {
      logger.error(`proposal.md 写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`方案文件保存失败: ${(err as Error).message}`, err)
    }

    // Update sidecar metadata lastSavedAt (AC2: md + sidecar must be synchronized)
    if (isLatestSave(projectId, sequence)) {
      await documentService.updateMetadata(projectId, (current) => ({
        ...current,
        lastSavedAt,
      }))
      logger.info(`proposal.md save committed: ${projectId} seq=${sequence}`, debugPayload)
    }

    return { lastSavedAt }
  },

  saveSync(
    projectId: string,
    rootPath: string,
    content: string,
    debugContext?: DocumentSaveDebugContext,
    debugTrail?: DocumentSaveDebugContext[]
  ): { lastSavedAt: string } {
    const validatedRootPath = validateProjectRootPath(projectId, rootPath)
    const sequence = beginSave(projectId)
    const { filePath, metaPath, tmpPath, metaTmpPath } = getDocumentPaths(
      validatedRootPath,
      sequence
    )
    const lastSavedAt = new Date().toISOString()
    const debugPayload = buildSaveDebugPayload(content, debugContext, debugTrail)

    logger.info(`proposal.md sync-save requested: ${projectId} seq=${sequence}`, debugPayload)

    let existingContent = ''
    try {
      existingContent = readFileSync(filePath, 'utf-8')
    } catch (err) {
      if (!hasErrorCode(err, 'ENOENT')) {
        logger.warn(`proposal.md sync 预读失败 (shrink-guard跳过): ${projectId}`, err)
      }
    }

    const verdict = evaluateShrinkGuard(existingContent, content)
    if (verdict.block) {
      logger.error(
        `proposal.md sync-save refused (shrink-guard): ${projectId} seq=${sequence} existing=${verdict.existingMeaningful} new=${verdict.newMeaningful}`,
        debugPayload
      )
      throw new DocumentSaveError(
        `保存被拒：内容从 ${verdict.existingMeaningful} 字符骤降至 ${verdict.newMeaningful} 字符，疑似空编辑器误覆盖`
      )
    }

    try {
      writeFileSync(tmpPath, content, 'utf-8')
      if (!isLatestSave(projectId, sequence)) {
        cleanupTmpFileSync(tmpPath)
        logger.info(
          `proposal.md sync-save skipped (superseded): ${projectId} seq=${sequence}`,
          debugPayload
        )
        return { lastSavedAt }
      }
      if (existingContent) {
        try {
          writeFileSync(getBackupPath(filePath), existingContent, 'utf-8')
        } catch (backupErr) {
          logger.warn(`proposal.md sync 备份写入失败 (不阻断保存): ${projectId}`, backupErr)
        }
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
        logger.info(
          `proposal.md sync-save metadata skipped (superseded): ${projectId} seq=${sequence}`,
          debugPayload
        )
        return { lastSavedAt }
      }
      renameSync(metaTmpPath, metaPath)
      logger.info(`proposal.md sync-save committed: ${projectId} seq=${sequence}`, debugPayload)
    } catch (err) {
      logger.error(`proposal.meta.json 同步写入失败: ${projectId}`, err)
      throw new DocumentSaveError(`元数据保存失败: ${(err as Error).message}`, err)
    }

    return { lastSavedAt }
  },

  async getMetadata(projectId: string): Promise<ProposalMetadata> {
    const rootPath = await getProjectRootPath(projectId)
    await ensureChapterIdentityUpgraded(projectId)
    const metaPath = join(rootPath, 'proposal.meta.json')
    return readMetadata(metaPath, projectId, new Date().toISOString())
  },

  async updateMetadata(
    projectId: string,
    updater: (current: ProposalMetadata) => ProposalMetadata
  ): Promise<ProposalMetadata> {
    return withMetadataLock(projectId, async () => {
      const rootPath = await getProjectRootPath(projectId)
      const metaPath = join(rootPath, 'proposal.meta.json')
      const current = await readMetadata(metaPath, projectId, new Date().toISOString())
      const updated = normalizeMetadata(projectId, current.lastSavedAt, updater(current))

      const tmpSuffix = Date.now()
      const tmpPath = join(rootPath, `.proposal.meta.json.tmp.${tmpSuffix}`)
      try {
        await writeFile(tmpPath, JSON.stringify(updated, null, 2), 'utf-8')
        await rename(tmpPath, metaPath)
      } catch (err) {
        await cleanupTmpFile(tmpPath)
        logger.error(`proposal.meta.json 更新失败: ${projectId}`, err)
        throw new DocumentSaveError(`元数据更新失败: ${(err as Error).message}`, err)
      }

      return updated
    })
  },
}
