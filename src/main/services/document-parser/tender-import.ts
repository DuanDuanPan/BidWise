import * as fs from 'fs/promises'
import * as path from 'path'
import { createLogger } from '@main/utils/logger'
import { BidWiseError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { ProjectRepository } from '@main/db/repositories/project-repo'
import { taskQueue } from '@main/services/task-queue'
import { RfpParser } from './rfp-parser'
import type { ImportTenderInput, ImportTenderResult, ParsedTender } from '@shared/analysis-types'
import type { TaskExecutorContext } from '@main/services/task-queue'

const logger = createLogger('tender-import')

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc'])

export class TenderImportService {
  private projectRepo = new ProjectRepository()
  private rfpParser = new RfpParser()

  async importTender(input: ImportTenderInput): Promise<ImportTenderResult> {
    const { projectId, filePath } = input

    // Validate file exists
    try {
      await fs.access(filePath)
    } catch {
      throw new BidWiseError(ErrorCode.TENDER_IMPORT, `文件不存在: ${filePath}`)
    }

    // Validate format
    const ext = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      throw new BidWiseError(
        ErrorCode.UNSUPPORTED_FORMAT,
        `不支持的文件格式: ${ext}，仅支持 PDF、DOCX、DOC`
      )
    }

    // Get project root path
    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) {
      throw new BidWiseError(ErrorCode.TENDER_IMPORT, `项目未设置存储路径: ${projectId}`)
    }

    const tenderDir = path.join(project.rootPath, 'tender')
    const originalDir = path.join(tenderDir, 'original')
    await fs.mkdir(originalDir, { recursive: true })

    // Copy original file
    const originalFileName = path.basename(filePath)
    const copiedPath = path.join(originalDir, originalFileName)
    await fs.copyFile(filePath, copiedPath)
    logger.info(`File copied to ${copiedPath}`)

    // Enqueue task
    const taskId = await taskQueue.enqueue({
      category: 'import',
      input: { projectId, filePath: copiedPath, originalFileName },
    })

    // Fire-and-forget execution
    const rfpParser = this.rfpParser
    const rootPath = project.rootPath
    taskQueue
      .execute(taskId, async (ctx: TaskExecutorContext) => {
        const taskInput = ctx.input as {
          projectId: string
          filePath: string
          originalFileName: string
        }

        const parsed = await rfpParser.parse(taskInput.filePath, {
          onProgress: (progress, message) => {
            ctx.updateProgress(progress, message)
          },
        })

        // Write parsed result
        const tenderParsedPath = path.join(rootPath, 'tender', 'tender-parsed.json')
        await fs.writeFile(tenderParsedPath, JSON.stringify(parsed, null, 2), 'utf-8')

        // Write metadata
        const tenderMetaPath = path.join(rootPath, 'tender', 'tender-meta.json')
        await fs.writeFile(tenderMetaPath, JSON.stringify(parsed.meta, null, 2), 'utf-8')

        ctx.updateProgress(100, '解析完成')
        logger.info(`Tender parsed and saved for project ${taskInput.projectId}`)
        return parsed
      })
      .catch((err) => {
        logger.error(`Tender import task failed: ${taskId}`, err)
      })

    return { taskId }
  }

  async getTender(projectId: string): Promise<ParsedTender | null> {
    const project = await this.projectRepo.findById(projectId)
    if (!project.rootPath) return null

    const parsedPath = path.join(project.rootPath, 'tender', 'tender-parsed.json')
    try {
      const content = await fs.readFile(parsedPath, 'utf-8')
      return JSON.parse(content) as ParsedTender
    } catch {
      return null
    }
  }
}
