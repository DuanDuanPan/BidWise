import { join, basename, relative, isAbsolute } from 'path'
import { readFile, writeFile, copyFile, rm, readdir, stat, mkdir, access } from 'fs/promises'
import { dialog, app } from 'electron'
import { createLogger } from '@main/utils/logger'
import { BidWiseError, ValidationError } from '@main/utils/errors'
import { ErrorCode } from '@shared/constants'
import { resolveProjectDataPath } from '@main/utils/project-paths'
import { documentService } from '@main/services/document-service'
import { projectService } from '@main/services/project-service'
import { docxBridgeService } from '@main/services/docx-bridge'
import { figureExportService } from '@main/services/figure-export-service'
import { taskQueue } from '@main/services/task-queue'
import { throwIfAborted } from '@main/utils/abort'
import type {
  StartExportPreviewInput,
  StartExportPreviewOutput,
  LoadPreviewContentInput,
  LoadPreviewContentOutput,
  ConfirmExportInput,
  ConfirmExportOutput,
  CleanupPreviewInput,
  PreviewTaskResult,
  TemplateStyleMapping,
  TemplatePageSetup,
} from '@shared/export-types'

const logger = createLogger('export-service')

const PREVIEW_FILE_PATTERN = /^\.preview-\d+\.docx$/

async function maybeDelayForE2E(signal?: AbortSignal): Promise<void> {
  const delayMs = Number.parseInt(process.env.BIDWISE_E2E_EXPORT_PREVIEW_DELAY_MS ?? '0', 10)
  if (!Number.isFinite(delayMs) || delayMs <= 0) return

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(signal.reason)
        return
      }
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(signal.reason)
        },
        { once: true }
      )
    }
  })
}

/**
 * Minimal valid .docx (Open XML) for E2E mock — generated from a ZIP containing
 * [Content_Types].xml, _rels/.rels, word/document.xml, word/_rels/document.xml.rels.
 */
/* prettier-ignore */
const MOCK_DOCX_BASE64 =
  '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' +
  'AAAAAAAAEAD tQakDAAB3b3JkL19yZWxzL1VUBQADqnbXaXV4CwABBPUBAAAEAAAAAFBLAQIeAxQA' +
  'AAAIAHOOiVzV6iDXeQAAAI4AAAAcABgAAAAAAAEAAACkge4DAAB3b3JkL19yZWxzL2RvY3VtZW50' +
  'LnhtbC5yZWxzVVQFAAOqdtdpdXgLAAEE9QEAAAQAAAAAUEsFBgAAAAAHAAcASwIAAL0EAAAAAA=='

/** Tracks how many times confirmExport was called per-session (for E2E dialog mock). */
let e2eDialogCallCount = 0

/** Active preview task per project — used to cancel stale tasks on re-trigger */
const activePreviewTasks = new Map<string, string>()

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

export type ResolvedTemplateMapping = {
  templatePath?: string
  styleMapping?: TemplateStyleMapping
  pageSetup?: TemplatePageSetup
  warnings: string[]
}

async function resolveRelativeTemplatePath(
  relativePath: string,
  projectId: string
): Promise<string> {
  const candidates = [
    join(app.getAppPath(), relativePath),
    join(app.getPath('userData'), relativePath),
    join(resolveProjectDataPath(projectId), relativePath),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try next candidate
    }
  }

  // Return first candidate so Python reports TEMPLATE_NOT_FOUND with an absolute path
  return candidates[0]
}

async function resolveTemplateMapping(
  projectId: string,
  inputTemplatePath?: string
): Promise<ResolvedTemplateMapping> {
  const warnings: string[] = []

  // Resolve the explicit input template path (if provided)
  let explicitTemplatePath: string | undefined
  if (inputTemplatePath) {
    if (isAbsolute(inputTemplatePath)) {
      explicitTemplatePath = inputTemplatePath
    } else {
      explicitTemplatePath = await resolveRelativeTemplatePath(inputTemplatePath, projectId)
    }
  }

  // Always attempt to read template-mapping.json for styles/pageSetup
  let raw: string | undefined
  try {
    const projectRoot = resolveProjectDataPath(projectId)
    const mappingPath = join(projectRoot, 'template-mapping.json')
    raw = await readFile(mappingPath, 'utf-8')
  } catch {
    // No template-mapping.json — allowed, fall back to defaults
    if (explicitTemplatePath) {
      return { templatePath: explicitTemplatePath, warnings }
    }
    return { warnings }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw!)
  } catch (err) {
    throw new ValidationError(
      `template-mapping.json 格式错误: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('template-mapping.json 必须是一个 JSON 对象')
  }

  const obj = parsed as Record<string, unknown>

  // Resolve templatePath — explicit input takes precedence over JSON
  let templatePath: string | undefined = explicitTemplatePath
  if (!templatePath && typeof obj.templatePath === 'string' && obj.templatePath.length > 0) {
    const rawPath = obj.templatePath
    if (isAbsolute(rawPath)) {
      templatePath = rawPath
    } else {
      templatePath = await resolveRelativeTemplatePath(rawPath, projectId)
    }
  }

  // Parse styles
  let styleMapping: TemplateStyleMapping | undefined
  if (obj.styles && typeof obj.styles === 'object' && !Array.isArray(obj.styles)) {
    styleMapping = obj.styles as TemplateStyleMapping
  }

  // Parse pageSetup
  let pageSetup: TemplatePageSetup | undefined
  if (obj.pageSetup && typeof obj.pageSetup === 'object' && !Array.isArray(obj.pageSetup)) {
    const ps = obj.pageSetup as Record<string, unknown>
    if (typeof ps.contentWidthMm === 'number') {
      pageSetup = { contentWidthMm: ps.contentWidthMm }
    }
  }

  return { templatePath, styleMapping, pageSetup, warnings }
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
    // Cancel any in-flight preview for the same project
    const previousTaskId = activePreviewTasks.get(input.projectId)
    if (previousTaskId) {
      taskQueue.cancel(previousTaskId).catch(() => {
        // Task may already be completed/cancelled — safe to ignore
      })
      logger.info(`已取消旧预览任务: ${previousTaskId} (项目: ${input.projectId})`)
    }

    // Clean up old preview files first
    await cleanupPreviewFiles(input.projectId)

    const taskId = await taskQueue.enqueue({
      category: 'export',
      input: { projectId: input.projectId },
    })

    activePreviewTasks.set(input.projectId, taskId)

    // Fire-and-forget execution
    taskQueue
      .execute(taskId, async (ctx) => {
        await maybeDelayForE2E(ctx.signal)
        ctx.updateProgress(10, '正在加载方案')

        const doc = await documentService.load(input.projectId)
        if (!doc.content || doc.content.trim().length === 0) {
          throw new BidWiseError(ErrorCode.EXPORT, '方案内容为空，无法生成预览')
        }

        ctx.updateProgress(30, '正在解析模板')
        const mapping = await resolveTemplateMapping(input.projectId, input.templatePath)
        const projectPath = resolveProjectDataPath(input.projectId)

        ctx.updateProgress(40, '正在预处理图表资产')
        const preprocessResult = await figureExportService.preprocessMarkdownForExport(
          doc.content,
          projectPath
        )

        ctx.updateProgress(50, '正在生成 docx 预览')
        const timestamp = Date.now()
        const fileName = `.preview-${timestamp}.docx`
        const outputPath = fileName
        const previewPath = join(getExportsDir(input.projectId), fileName)

        let renderResult
        if (process.env.BIDWISE_E2E_EXPORT_PREVIEW_MOCK === 'true') {
          // E2E mock: write a minimal valid .docx instead of calling the real bridge
          const exportsDir = getExportsDir(input.projectId)
          await mkdir(exportsDir, { recursive: true })
          await writeFile(previewPath, Buffer.from(MOCK_DOCX_BASE64, 'base64'))
          renderResult = { outputPath: previewPath, renderTimeMs: 50, pageCount: 1 }
          logger.info(`E2E mock: wrote stub docx to ${previewPath}`)
        } else {
          try {
            renderResult = await docxBridgeService.renderDocx(
              {
                markdownContent: preprocessResult.processedMarkdown,
                outputPath,
                templatePath: mapping.templatePath,
                projectId: input.projectId,
                styleMapping: mapping.styleMapping,
                pageSetup: mapping.pageSetup,
                projectPath,
              },
              { signal: ctx.signal }
            )
          } catch (err) {
            if (ctx.signal.aborted) {
              await cleanupPreviewFiles(input.projectId, previewPath)
            }
            throw err
          }
        }

        if (ctx.signal.aborted) {
          await cleanupPreviewFiles(input.projectId, renderResult.outputPath)
          throwIfAborted(ctx.signal, `Preview task ${ctx.taskId} cancelled`)
        }

        ctx.updateProgress(100, 'completed')

        const allWarnings = [
          ...mapping.warnings,
          ...preprocessResult.warnings,
          ...(renderResult.warnings ?? []),
        ]
        const result: PreviewTaskResult = {
          tempPath: renderResult.outputPath,
          fileName,
          pageCount: renderResult.pageCount,
          renderTimeMs: renderResult.renderTimeMs,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
        }
        return result
      })
      .catch((err) => {
        logger.error(`预览任务失败: ${taskId}`, err)
      })
      .finally(() => {
        // Remove from active map only if this task is still the current one
        if (activePreviewTasks.get(input.projectId) === taskId) {
          activePreviewTasks.delete(input.projectId)
        }
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

    // E2E dialog mock: bypass native save dialog when configured
    const e2eDialogPath = process.env.BIDWISE_E2E_EXPORT_DIALOG_PATH
    let chosenPath: string | undefined
    if (e2eDialogPath) {
      e2eDialogCallCount++
      const cancelCount = Number.parseInt(
        process.env.BIDWISE_E2E_EXPORT_DIALOG_CANCEL_COUNT ?? '0',
        10
      )
      if (e2eDialogCallCount <= cancelCount) {
        logger.info(`E2E mock: dialog cancel #${e2eDialogCallCount}`)
        return { cancelled: true }
      }
      chosenPath = e2eDialogPath
      logger.info(`E2E mock: dialog auto-save to ${chosenPath}`)
    } else {
      const result = await dialog.showSaveDialog({
        defaultPath: defaultFileName,
        filters: [{ name: 'Word 文档', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) {
        return { cancelled: true }
      }
      chosenPath = result.filePath
    }

    await copyFile(input.tempPath, chosenPath)
    const fileInfo = await stat(chosenPath)

    // Clean up temp file after successful export
    await cleanupPreviewFiles(input.projectId, input.tempPath)

    return {
      outputPath: chosenPath,
      fileSize: fileInfo.size,
    }
  },

  async cleanupPreview(input: CleanupPreviewInput): Promise<void> {
    await cleanupPreviewFiles(input.projectId, input.tempPath)
  },
}
