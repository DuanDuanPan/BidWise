import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(120_000)

async function withIsolatedApp(
  run: (window: Page, electronApp: ElectronApplication) => Promise<void>,
  extraEnv?: Record<string, string>
): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-8-3-'))
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
      BIDWISE_USER_DATA_DIR: join(testHome, 'bidwise-data'),
      ...extraEnv,
    },
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('BidWise')
    await expect(window.getByTestId('project-kanban')).toBeVisible()
    await run(window, electronApp)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function createRichExportProject(window: Page): Promise<string> {
  const response = await window.evaluate(async () => {
    return window.api.projectCreate({
      name: '导出测试项目',
      customerName: '测试客户',
      proposalType: 'presale-technical',
    })
  })
  const projectId = (response as { success: true; data: { id: string } }).data.id

  // Save rich Markdown content with headings, inline formatting, tables, code, and image ref
  await window.evaluate(
    async ({ pid }) => {
      await window.api.documentSave({
        projectId: pid,
        content: [
          '# 第一章 方案概述',
          '',
          '这是一份测试方案文档，包含 **加粗** 和 *斜体* 文本。',
          '',
          '## 1.1 技术方案',
          '',
          '- 要点一',
          '- 要点二',
          '',
          '1. 步骤一',
          '2. 步骤二',
          '',
          '| 项目 | 说明 |',
          '| --- | --- |',
          '| A | B |',
          '',
          '```python',
          'def hello():',
          '    pass',
          '```',
          '',
          '## 1.2 系统架构',
          '',
          '详细描述系统架构设计。',
        ].join('\n'),
      })
    },
    { pid: projectId }
  )

  // Note: template-mapping.json is optional — export works with fallback styles.
  // The E2E test validates the preview→export UI flow, not per-style rendering.

  // Reload so the Zustand store picks up the IPC-created project
  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible()
  await expect(window.getByTestId(`project-card-${projectId}`)).toBeVisible()

  // Navigate to project workspace
  await window.getByTestId(`project-card-${projectId}`).click()
  await expect(window.getByTestId('project-workspace')).toBeVisible()

  return projectId
}

test('@story-8-3 @p0 preview triggers for project with rich content', async () => {
  await withIsolatedApp(async (window) => {
    await createRichExportProject(window)

    const previewBtn = window.getByTestId('preview-btn')
    await expect(previewBtn).toBeVisible()
    await expect(previewBtn).toBeEnabled()

    await previewBtn.click()

    // Should show loading overlay or error (bridge may not be running)
    const overlay = window.getByTestId('export-preview-loading-overlay')
    const errorAlert = window.getByTestId('preview-error-alert')
    await expect(overlay.or(errorAlert)).toBeVisible({ timeout: 30_000 })
  })
})

test('@story-8-3 @p0 preview error shows retry and back-to-edit for rich content', async () => {
  await withIsolatedApp(async (window) => {
    await createRichExportProject(window)

    await window.getByTestId('preview-btn').click()

    // Wait for error state (Python bridge not running in E2E)
    const errorAlert = window.getByTestId('preview-error-alert')
    await expect(errorAlert).toBeVisible({ timeout: 30_000 })

    // Retry and back-to-edit buttons should be available
    await expect(window.getByTestId('retry-btn')).toBeVisible()
    await expect(window.getByTestId('back-to-edit-btn')).toBeVisible()

    // Back to edit closes modal
    await window.getByTestId('back-to-edit-btn').click()
    await expect(window.getByTestId('project-workspace')).toBeVisible()
  })
})

test('@story-8-3 @p1 cancel during loading returns to workspace', async () => {
  await withIsolatedApp(
    async (window) => {
      await createRichExportProject(window)

      await window.getByTestId('preview-btn').click()

      // E2E delay keeps loading overlay visible
      const overlay = window.getByTestId('export-preview-loading-overlay')
      await expect(overlay).toBeVisible({ timeout: 10_000 })

      await window.getByTestId('cancel-preview-btn').click()
      await expect(overlay).not.toBeVisible({ timeout: 5_000 })

      // Workspace should still be functional
      await expect(window.getByTestId('project-workspace')).toBeVisible()
    },
    { BIDWISE_E2E_EXPORT_PREVIEW_DELAY_MS: '5000' }
  )
})

test('@story-8-3 @p0 full export flow: preview → confirm → save .docx', async () => {
  await withIsolatedApp(async (window, electronApp) => {
    await createRichExportProject(window)

    // Prepare a temp directory for the exported file
    const exportDir = mkdtempSync(join(tmpdir(), 'bidwise-export-'))
    const exportPath = join(exportDir, 'exported.docx')

    try {
      // Mock dialog.showSaveDialog to return a known path (no native dialog prompt)
      await electronApp.evaluate(
        ({ dialog }, filePath) => {
          dialog.showSaveDialog = async () => ({ canceled: false, filePath })
        },
        exportPath
      )

      // Trigger preview
      await window.getByTestId('preview-btn').click()

      // Wait for preview to fully load (confirm button visible) or error
      const confirmBtn = window.getByTestId('confirm-export-btn')
      const errorAlert = window.getByTestId('preview-error-alert')
      await expect(confirmBtn.or(errorAlert)).toBeVisible({ timeout: 60_000 })

      // If Python bridge is not available, skip gracefully
      if (await errorAlert.isVisible()) {
        test.skip(true, 'Python bridge not available — cannot complete full export flow')
        return
      }

      // Preview loaded successfully — verify preview container has content
      await expect(window.getByTestId('docx-preview-container')).toBeVisible()

      // Confirm export (triggers mocked save dialog)
      await confirmBtn.click()

      // Wait for modal to close (export completed)
      await expect(window.getByTestId('export-preview-modal')).not.toBeVisible({ timeout: 30_000 })

      // Verify .docx file was saved to the mocked path
      expect(existsSync(exportPath)).toBe(true)
      const fileStats = statSync(exportPath)
      expect(fileStats.size).toBeGreaterThan(0)

      // Workspace should still be functional
      await expect(window.getByTestId('project-workspace')).toBeVisible()
    } finally {
      rmSync(exportDir, { recursive: true, force: true })
    }
  })
})
