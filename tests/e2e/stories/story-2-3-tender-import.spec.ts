import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { basename, join, resolve } from 'path'
import { tmpdir } from 'os'

type ProjectRecord = {
  id: string
  name: string
}

type TaskRecord = {
  id: string
  status: string
  progress: number
  createdAt: string
}

type TaskProgressEvent = {
  taskId: string
  progress: number
  message?: string
}

type LaunchContext = {
  electronApp: Awaited<ReturnType<typeof electron.launch>>
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>
  sandboxHome: string
  fixturesDir: string
}

const APP_ENTRY = resolve(process.cwd(), 'out/main/index.js')
const DOCX_FIXTURE = resolve(
  process.cwd(),
  'node_modules/.pnpm/mammoth@1.12.0/node_modules/mammoth/test/test-data/single-paragraph.docx'
)

async function launchStoryApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-2-3-'))
  const fixturesDir = join(sandboxHome, 'fixtures')
  await mkdir(fixturesDir, { recursive: true })

  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: sandboxHome,
      BIDWISE_USER_DATA_DIR: join(sandboxHome, 'bidwise-data'),
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  return { electronApp, window, sandboxHome, fixturesDir }
}

async function closeStoryApp(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
}

async function createProject(
  window: LaunchContext['window'],
  name: string
): Promise<ProjectRecord> {
  return window.evaluate(
    async ({ projectName }) => {
      const response = await window.api.projectCreate({
        name: projectName,
        proposalType: 'presale-technical',
      })

      if (!response.success) {
        throw new Error(response.error.message)
      }

      return {
        id: response.data.id,
        name: response.data.name,
      }
    },
    { projectName: name }
  )
}

async function navigateToProject(
  window: LaunchContext['window'],
  projectId: string
): Promise<void> {
  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)

  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })
  await expect(window.getByTestId('analysis-view')).toBeVisible({ timeout: 30_000 })
}

async function startTaskProgressCapture(window: LaunchContext['window']): Promise<void> {
  await window.evaluate(() => {
    const globalWindow = window as Window & {
      __story23ProgressEvents?: TaskProgressEvent[]
      __story23ProgressUnlisten?: () => void
    }

    globalWindow.__story23ProgressUnlisten?.()
    globalWindow.__story23ProgressEvents = []
    globalWindow.__story23ProgressUnlisten = window.api.onTaskProgress((event) => {
      globalWindow.__story23ProgressEvents?.push(event)
    })
  })
}

async function getCapturedTaskProgress(
  window: LaunchContext['window']
): Promise<TaskProgressEvent[]> {
  return window.evaluate(() => {
    const globalWindow = window as Window & {
      __story23ProgressEvents?: TaskProgressEvent[]
    }

    return globalWindow.__story23ProgressEvents ?? []
  })
}

async function getLatestImportTask(window: LaunchContext['window']): Promise<TaskRecord | null> {
  return window.evaluate(async () => {
    const response = await window.api.taskList({ category: 'import' })
    if (!response.success) {
      throw new Error(response.error.message)
    }

    const tasks = [...response.data].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const task = tasks[0]

    return task
      ? {
          id: task.id,
          status: task.status,
          progress: task.progress,
          createdAt: task.createdAt,
        }
      : null
  })
}

async function getTaskStatus(
  window: LaunchContext['window'],
  taskId: string
): Promise<string | null> {
  return window.evaluate(async (id) => {
    const response = await window.api.taskGetStatus({ taskId: id })
    if (!response.success) {
      throw new Error(response.error.message)
    }

    return response.data?.status ?? null
  }, taskId)
}

async function uploadTenderFile(
  window: LaunchContext['window'],
  options: { filePath: string; mimeType: string }
): Promise<void> {
  const fileName = basename(options.filePath)

  await window.evaluate(
    ({ filePath, tenderFileName, mimeType }) => {
      const input = document.querySelector('[data-testid="tender-upload-zone"] input[type="file"]')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Tender upload input not found')
      }

      const file = new File(['playwright-tender'], tenderFileName, {
        type: mimeType,
        lastModified: Date.now(),
      })

      Object.defineProperty(file, 'path', {
        value: filePath,
        configurable: true,
      })

      const transfer = new DataTransfer()
      transfer.items.add(file)

      Object.defineProperty(input, 'files', {
        value: transfer.files,
        configurable: true,
      })

      input.dispatchEvent(
        new Event('change', {
          bubbles: true,
          cancelable: true,
        })
      )
    },
    {
      filePath: options.filePath,
      tenderFileName: fileName,
      mimeType: options.mimeType,
    }
  )
}

function repeatText(seed: string, repeatCount: number): string {
  return Array.from({ length: repeatCount }, (_, index) => `${seed} ${index + 1}.`).join(' ')
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildPdfDocument(pages: string[][]): Buffer {
  const objects: string[] = []
  const addObject = (content: string): number => {
    objects.push(content)
    return objects.length
  }

  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pageIds: number[] = []

  for (const lines of pages) {
    const contentLines = ['BT', '/F1 12 Tf', '72 760 Td']

    for (const [index, line] of lines.entries()) {
      if (index > 0) {
        contentLines.push('0 -18 Td')
      }
      contentLines.push(`(${escapePdfText(line)}) Tj`)
    }

    contentLines.push('ET')
    const stream = contentLines.join('\n')
    const contentId = addObject(
      `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`
    )
    const pageId = addObject(
      `<< /Type /Page /Parent PAGES_ID 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    )
    pageIds.push(pageId)
  }

  const pagesId = addObject(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  )
  for (const pageId of pageIds) {
    objects[pageId - 1] = objects[pageId - 1].replace('PAGES_ID', String(pagesId))
  }

  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }

  const startXref = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

async function createPdfFixture(
  fixturesDir: string,
  name: string,
  pages: string[][]
): Promise<string> {
  const filePath = join(fixturesDir, name)
  await writeFile(filePath, buildPdfDocument(pages))
  return filePath
}

async function createLegacyDocFixture(fixturesDir: string, name: string): Promise<string> {
  const filePath = join(fixturesDir, name)
  await writeFile(filePath, 'Legacy DOC fixture for conversion fallback coverage.', 'utf8')
  return filePath
}

function buildHappyPathPdfPages(pageCount: number): string[][] {
  return Array.from({ length: pageCount }, (_, index) => {
    const pageNo = index + 1
    return [
      pageNo === 1 ? '1. Overview' : `${pageNo}. Section ${pageNo}`,
      repeatText(`Tender page ${pageNo} technical requirement narrative`, 12),
      repeatText(`Commercial clause page ${pageNo}`, 8),
    ]
  })
}

function buildScannedLikePdfPages(pageCount: number): string[][] {
  return Array.from({ length: pageCount }, (_, index) => [`${index + 1}. A`, 'xy'])
}

test.describe('Story 2-3 tender import async parsing', () => {
  test.describe.configure({ timeout: 120_000 })

  test('@story-2-3 @p0 uploads a PDF tender and shows async parsing progress before the parsed summary', async () => {
    test.slow()
    const ctx = await launchStoryApp()

    try {
      const project = await createProject(ctx.window, 'Story 2-3 AC1 PDF import')
      const pdfPath = await createPdfFixture(
        ctx.fixturesDir,
        'story-2-3-ac1.pdf',
        buildHappyPathPdfPages(400)
      )

      await navigateToProject(ctx.window, project.id)
      await startTaskProgressCapture(ctx.window)
      await uploadTenderFile(ctx.window, { filePath: pdfPath, mimeType: 'application/pdf' })

      await expect
        .poll(async () => {
          const task = await getLatestImportTask(ctx.window)
          return task?.id ?? null
        })
        .not.toBeNull()

      await expect
        .poll(
          async () => {
            const events = await getCapturedTaskProgress(ctx.window)
            return events.length
          },
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0)

      await expect
        .poll(
          async () => {
            const events = await getCapturedTaskProgress(ctx.window)
            return events.some(
              (event) =>
                event.progress > 0 &&
                [
                  '检测文件格式...',
                  '提取文档文本...',
                  '识别文档结构...',
                  '整理解析结果...',
                ].includes(event.message ?? '')
            )
          },
          { timeout: 15_000 }
        )
        .toBe(true)

      const parseProgress = ctx.window.getByTestId('parse-progress')
      if (await parseProgress.isVisible().catch(() => false)) {
        await expect(ctx.window.getByText(/检测文件格式|提取文档文本|识别文档结构/)).toBeVisible({
          timeout: 15_000,
        })
      }

      await expect(ctx.window.getByText(/PDF · \d+ 页 · 检测到 \d+ 个章节/)).toBeVisible({
        timeout: 15_000,
      })

      await expect(ctx.window.getByTestId('tender-result-summary')).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        ctx.window.getByTestId('tender-result-summary').getByText('story-2-3-ac1.pdf')
      ).toBeVisible()
      await expect(ctx.window.getByText(/PDF · \d+ 页 · 检测到 \d+ 个章节/)).toBeVisible()
      await expect(ctx.window.getByText('1. Overview')).toBeVisible()
      await expect(ctx.window.getByTestId('tender-uploaded')).toBeVisible()
    } finally {
      await closeStoryApp(ctx)
    }
  })

  test('@story-2-3 @p0 keeps parsing alive while the user switches to another project and notifies on completion', async () => {
    test.slow()
    const ctx = await launchStoryApp()

    try {
      const sourceProject = await createProject(ctx.window, 'Story 2-3 AC2 source project')
      const otherProject = await createProject(ctx.window, 'Story 2-3 AC2 other project')
      const longPdfPath = await createPdfFixture(
        ctx.fixturesDir,
        'story-2-3-ac2-long.pdf',
        buildHappyPathPdfPages(600)
      )

      await navigateToProject(ctx.window, sourceProject.id)
      await startTaskProgressCapture(ctx.window)
      await uploadTenderFile(ctx.window, { filePath: longPdfPath, mimeType: 'application/pdf' })

      await expect
        .poll(
          async () => {
            const task = await getLatestImportTask(ctx.window)
            return task?.id ?? null
          },
          { timeout: 15_000 }
        )
        .not.toBeNull()

      const importTask = await getLatestImportTask(ctx.window)
      const taskId = importTask?.id
      if (!taskId) {
        throw new Error('Import task id was not captured')
      }

      await ctx.window.getByTestId('back-to-kanban').click()
      await expect(ctx.window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })
      await expect(ctx.window.getByTestId(`project-card-${otherProject.id}`)).toBeVisible({
        timeout: 30_000,
      })
      await ctx.window.getByTestId(`project-card-${otherProject.id}`).click()

      await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })
      await expect(ctx.window.getByText(otherProject.name)).toBeVisible()
      await expect(ctx.window.getByTestId('tender-upload-zone')).toBeVisible()

      await expect
        .poll(
          async () => {
            const events = await getCapturedTaskProgress(ctx.window)
            return events.some((event) => event.progress > 0)
          },
          { timeout: 30_000 }
        )
        .toBe(true)

      await expect
        .poll(async () => getTaskStatus(ctx.window, taskId), { timeout: 90_000 })
        .toBe('completed')

      await ctx.window.getByTestId('back-to-kanban').click()
      await expect(ctx.window.getByTestId(`project-card-${sourceProject.id}`)).toBeVisible({
        timeout: 30_000,
      })
      await ctx.window.getByTestId(`project-card-${sourceProject.id}`).click()

      await expect(ctx.window.getByTestId('tender-result-summary')).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        ctx.window.getByTestId('tender-result-summary').getByText('story-2-3-ac2-long.pdf')
      ).toBeVisible()
    } finally {
      await closeStoryApp(ctx)
    }
  })

  test('@story-2-3 @p1 warns when a PDF looks like scanned content', async () => {
    const ctx = await launchStoryApp()

    try {
      const project = await createProject(ctx.window, 'Story 2-3 AC3 scanned PDF')
      const pdfPath = await createPdfFixture(
        ctx.fixturesDir,
        'story-2-3-scanned.pdf',
        buildScannedLikePdfPages(5)
      )

      await navigateToProject(ctx.window, project.id)
      await uploadTenderFile(ctx.window, { filePath: pdfPath, mimeType: 'application/pdf' })

      await expect(ctx.window.getByTestId('tender-result-summary')).toBeVisible({
        timeout: 90_000,
      })
      await expect(ctx.window.getByTestId('scanned-warning')).toBeVisible()
    } finally {
      await closeStoryApp(ctx)
    }
  })

  test('@story-2-3 @p1 imports a DOCX tender successfully', async () => {
    const ctx = await launchStoryApp()

    try {
      const project = await createProject(ctx.window, 'Story 2-3 AC3 DOCX import')

      await navigateToProject(ctx.window, project.id)
      await uploadTenderFile(ctx.window, {
        filePath: DOCX_FIXTURE,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      await expect(ctx.window.getByTestId('tender-result-summary')).toBeVisible({
        timeout: 90_000,
      })
      await expect(
        ctx.window.getByTestId('tender-result-summary').getByText('single-paragraph.docx')
      ).toBeVisible()
      await expect(ctx.window.getByText(/DOCX · \d+ 页 · 检测到 \d+ 个章节/)).toBeVisible()
    } finally {
      await closeStoryApp(ctx)
    }
  })

  test('@story-2-3 @p1 shows the manual-conversion guidance when a legacy DOC file cannot be converted', async () => {
    const ctx = await launchStoryApp()

    try {
      const project = await createProject(ctx.window, 'Story 2-3 AC3 DOC fallback')
      const docPath = await createLegacyDocFixture(ctx.fixturesDir, 'story-2-3-legacy.doc')

      await navigateToProject(ctx.window, project.id)
      await uploadTenderFile(ctx.window, { filePath: docPath, mimeType: 'application/msword' })

      await expect(
        ctx.window.getByText(
          '.doc 格式自动转换失败，请安装 LibreOffice 或手动将文件另存为 .docx 格式后重试'
        )
      ).toBeVisible({ timeout: 90_000 })
      await expect(ctx.window.getByTestId('tender-upload-zone')).toBeVisible()
    } finally {
      await closeStoryApp(ctx)
    }
  })
})
