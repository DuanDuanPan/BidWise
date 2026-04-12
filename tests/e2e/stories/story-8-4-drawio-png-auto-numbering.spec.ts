import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(120_000)

async function withIsolatedApp(
  run: (window: Page, electronApp: ElectronApplication, userDataDir: string) => Promise<void>,
  extraEnv?: Record<string, string>
): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-8-4-'))
  const userDataDir = join(testHome, 'bidwise-data')
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome,
      APPDATA: join(testHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(testHome, 'AppData', 'Local'),
      XDG_CONFIG_HOME: join(testHome, '.config'),
      XDG_DATA_HOME: join(testHome, '.local', 'share'),
      BIDWISE_USER_DATA_DIR: userDataDir,
      ...extraEnv,
    },
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('BidWise')
    await expect(window.getByTestId('project-kanban')).toBeVisible()
    await run(window, electronApp, userDataDir)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function createFigureProject(window: Page, userDataDir: string): Promise<string> {
  const response = await window.evaluate(async () => {
    return window.api.projectCreate({
      name: '图表测试项目',
      customerName: '测试客户',
      proposalType: 'presale-technical',
    })
  })
  const projectId = (response as { success: true; data: { id: string } }).data.id

  // Save content with captioned images for figure numbering
  await window.evaluate(
    async ({ pid }) => {
      await window.api.documentSave({
        projectId: pid,
        content: [
          '# 第一章 方案概述',
          '',
          '![系统架构图](assets/arch.png)',
          '',
          '如 {figref:系统架构图} 所示。',
          '',
          '## 1.1 技术方案',
          '',
          '详细描述技术方案设计。',
        ].join('\n'),
      })
    },
    { pid: projectId }
  )

  // Prepare image asset
  const projectDataDir = join(userDataDir, 'data', 'projects', projectId)
  const assetsDir = join(projectDataDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })

  // Minimal 1x1 white PNG
  const minimalPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg==',
    'base64'
  )
  writeFileSync(join(assetsDir, 'arch.png'), minimalPng)

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible()
  await expect(window.getByTestId(`project-card-${projectId}`)).toBeVisible()

  await window.getByTestId(`project-card-${projectId}`).click()
  await expect(window.getByTestId('project-workspace')).toBeVisible()

  return projectId
}

test('@story-8-4 @p1 preview with figure assets exports successfully', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'bidwise-8-4-export-'))

  await withIsolatedApp(
    async (window, _app, userDataDir) => {
      await createFigureProject(window, userDataDir)

      // Navigate to export step
      await window.getByTestId('sop-stage-export').click()
      await expect(window.getByTestId('export-panel')).toBeVisible()

      // Start preview
      await window.getByTestId('preview-button').click()
      await expect(window.getByTestId('preview-status')).toBeVisible()

      // Wait for preview to complete (or timeout)
      await expect(window.getByTestId('preview-complete')).toBeVisible({ timeout: 60_000 })

      // Confirm export
      const exportPath = join(exportDir, 'figure-export.docx')
      await window.getByTestId('confirm-export-button').click()

      // Wait for file to appear
      await expect(async () => {
        expect(existsSync(exportPath)).toBe(true)
        const fileInfo = statSync(exportPath)
        expect(fileInfo.size).toBeGreaterThan(0)
      }).toPass({ timeout: 30_000 })
    },
    {
      BIDWISE_E2E_EXPORT_PREVIEW_MOCK: 'true',
      BIDWISE_E2E_EXPORT_DIALOG_PATH: join(exportDir, 'figure-export.docx'),
    }
  )

  rmSync(exportDir, { recursive: true, force: true })
})

test('@story-8-4 @p1 preview does not regress story 8.2/8.3 basic export', async () => {
  const exportDir = mkdtempSync(join(tmpdir(), 'bidwise-8-4-regression-'))

  await withIsolatedApp(
    async (window, _app, _userDataDir) => {
      // Create a simple project without figure assets
      const response = await window.evaluate(async () => {
        return window.api.projectCreate({
          name: '回归测试项目',
          customerName: '测试客户',
          proposalType: 'presale-technical',
        })
      })
      const projectId = (response as { success: true; data: { id: string } }).data.id

      await window.evaluate(
        async ({ pid }) => {
          await window.api.documentSave({
            projectId: pid,
            content: '# 方案概述\n\n这是一份测试方案文档。\n\n## 系统设计\n\n详细描述。',
          })
        },
        { pid: projectId }
      )

      await window.reload()
      await window.waitForLoadState('domcontentloaded')
      await expect(window.getByTestId('project-kanban')).toBeVisible()
      await expect(window.getByTestId(`project-card-${projectId}`)).toBeVisible()

      await window.getByTestId(`project-card-${projectId}`).click()
      await expect(window.getByTestId('project-workspace')).toBeVisible()

      // Navigate to export and do preview
      await window.getByTestId('sop-stage-export').click()
      await expect(window.getByTestId('export-panel')).toBeVisible()

      await window.getByTestId('preview-button').click()
      await expect(window.getByTestId('preview-status')).toBeVisible()
      await expect(window.getByTestId('preview-complete')).toBeVisible({ timeout: 60_000 })

      // Confirm export
      await window.getByTestId('confirm-export-button').click()

      const exportPath = join(exportDir, 'regression-export.docx')
      await expect(async () => {
        expect(existsSync(exportPath)).toBe(true)
      }).toPass({ timeout: 30_000 })
    },
    {
      BIDWISE_E2E_EXPORT_PREVIEW_MOCK: 'true',
      BIDWISE_E2E_EXPORT_DIALOG_PATH: join(exportDir, 'regression-export.docx'),
    }
  )

  rmSync(exportDir, { recursive: true, force: true })
})
