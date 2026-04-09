import { join, basename, relative, isAbsolute } from 'path'
import { readFile, copyFile, rm, readdir, stat } from 'fs/promises'
import { dialog } from 'electron'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { documentService } from '@main/services/document-service'
import { projectService } from '@main/services/project-service'
import { docxBridgeService } from '@main/services/docx-bridge'
import { taskQueue } from '@main/services/task-queue'
import type {
  StartExportPreviewInput,
  StartExportPreviewOutput,
  LoadPreviewContentInput,
  LoadPreviewContentOutput,
  ConfirmExportInput,
  ConfirmExportOutput,
  CleanupPreviewInput,
  PreviewTaskResult,
} from '@shared/export-types'

const logger = createLogger('export-service')

const PREVIEW_FILE_PATTERN = /^\.preview-\d+\.docx$/

function getExportsDir(projectId: string): string {
  return join(resolveProjectDataPath(projectId), 'exports')
}

function validateTempPath(projectId: string, tempPath: string): void {
  const exportsDir = getExportsDir(projectId)
  const rel = relative(exportsDir, tempPath)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ValidationError(`临时文件路径超出项目边界: ${tempPath}`)
  }
  const file = basename(tempPath)
  if (!PREVIEW_FILE_PATTERN.test(file)) {
    throw new ValidationError(`无效的预览文件名: ${file}`)
  }
}

async function resolveTemplatePath(
  projectId: string,
  inputTemplatePath?: string
): Promise<string | undefined> {
  if (inputTemplatePath) return inputTemplatePath

  try {
    const projectRoot = resolveProjectDataPath(projectId)
    const mappingPath = join(projectRoot, 'template-mapping.json')
    const raw = await readFile(mappingPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      'templatePath' in parsed &&
      typeof (parsed as Record<string, unknown>).templatePath === 'string'
    ) {
      return (parsed as Record<string, string>).templatePath
    }
  } catch {
    // No template-mapping.json or invalid — fall back to no template
  }
  return undefined
}

async function cleanupPreviewFiles(projectId: string, specificPath?: string): Promise<void> {
  if (specificPath) {
    validateTempPath(projectId, specificPath)
    try {
      await rm(specificPath, { force: true })
      logger.info(`已清理预览文件: ${specificPath}`)
    } catch {
      // Best-effort cleanup
    }
    return
  }

  const exportsDir = getExportsDir(projectId)
  try {
    const files = await readdir(exportsDir)
    for (const file of files) {
      if (PREVIEW_FILE_PATTERN.test(file)) {
        try {
          await rm(join(exportsDir, file), { force: true })
        } catch {
          // Best-effort
        }
      }
    }
    logger.info(`已清理项目 ${projectId} 所有预览文件`)
  } catch {
    // exports dir may not exist yet
  }
}

export const exportService = {
  async startPreview(input: StartExportPreviewInput): Promise<StartExportPreviewOutput> {
    // Clean up old preview files first
    await cleanupPreviewFiles(input.projectId)

    const taskId = await taskQueue.enqueue({
      category: 'export',
      input: { projectId: input.projectId },
    })

    // Fire-and-forget execution
    taskQueue
      .execute(taskId, async (ctx) => {
        ctx.updateProgress(10, '正在加载方案')

        const doc = await documentService.load(input.projectId)
        if (!doc.content || doc.content.trim().length === 0) {
          throw new BidWiseError(ErrorCode.EXPORT, '方案内容为空，无法生成预览')
        }

        ctx.updateProgress(30, '正在解析模板')
        const templatePath = await resolveTemplatePath(input.projectId, input.templatePath)

        ctx.updateProgress(50, '正在生成 docx 预览')
        const timestamp = Date.now()
        const fileName = `.preview-${timestamp}.docx`
        const outputPath = fileName

        const renderResult = await docxBridgeService.renderDocx({
          markdownContent: doc.content,
          outputPath,
          templatePath,
          projectId: input.projectId,
        })

        ctx.updateProgress(100, 'completed')

        const result: PreviewTaskResult = {
          tempPath: renderResult.outputPath,
          fileName,
          pageCount: renderResult.pageCount,
          renderTimeMs: renderResult.renderTimeMs,
        }
        return result
      })
      .catch((err) => {
        logger.error(`预览任务失败: ${taskId}`, err)
      })

    return { taskId }
  },

  async loadPreviewContent(input: LoadPreviewContentInput): Promise<LoadPreviewContentOutput> {
    validateTempPath(input.projectId, input.tempPath)

    const docxBytes = await readFile(input.tempPath)
    return { docxBase64: docxBytes.toString('base64') }
  },

  async confirmExport(input: ConfirmExportInput): Promise<ConfirmExportOutput> {
    validateTempPath(input.projectId, input.tempPath)

    // Verify file exists
    await stat(input.tempPath)

    const project = await projectService.get(input.projectId)
    const defaultFileName = `${project.name}-方案.docx`

    const result = await dialog.showSaveDialog({
      defaultPath: defaultFileName,
      filters: [{ name: 'Word 文档', extensions: ['docx'] }],
    })

    if (result.canceled || !result.filePath) {
      return { cancelled: true }
    }

    await copyFile(input.tempPath, result.filePath)
    const fileInfo = await stat(result.filePath)

    // Clean up temp file after successful export
    await cleanupPreviewFiles(input.projectId, input.tempPath)

    return {
      outputPath: result.filePath,
      fileSize: fileInfo.size,
    }
  },

  async cleanupPreview(input: CleanupPreviewInput): Promise<void> {
    await cleanupPreviewFiles(input.projectId, input.tempPath)
  },
}
