import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MODIFIER_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'
const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(120_000)

async function withIsolatedApp(
  run: (window: Page) => Promise<void>,
  extraEnv?: Record<string, string>
): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-8-2-'))
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
    await run(window)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function createProjectAndNavigate(window: Page): Promise<string> {
  const response = await window.evaluate(async () => {
    return window.api.projectCreate({
      name: '预览测试项目',
      customerName: '测试客户',
      proposalType: 'presale-technical',
    })
  })
  const projectId = (response as { success: true; data: { id: string } }).data.id

  // Save some content to proposal.md
  await window.evaluate(
    async ({ pid }) => {
      await window.api.documentSave({
        projectId: pid,
        content:
          '# 项目概述\n\n这是一份测试方案文档。\n\n## 系统设计\n\n### 技术架构\n\n详细描述。',
      })
    },
    { pid: projectId }
  )

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

test('@story-8-2 @p0 preview button renders and is enabled when document has content', async () => {
  await withIsolatedApp(async (window) => {
    await createProjectAndNavigate(window)

    const previewBtn = window.getByTestId('preview-btn')
    await expect(previewBtn).toBeVisible()
    await expect(previewBtn).toBeEnabled()
  })
})

test('@story-8-2 @p0 clicking preview shows loading overlay', async () => {
  await withIsolatedApp(async (window) => {
    await createProjectAndNavigate(window)

    const previewBtn = window.getByTestId('preview-btn')
    await previewBtn.click()

    // Should show loading overlay (may be brief if bridge is not available)
    const overlay = window.getByTestId('export-preview-loading-overlay')
    // Either loading overlay appears, or we get an error modal
    await expect(overlay.or(window.getByTestId('preview-error-alert'))).toBeVisible({
      timeout: 10_000,
    })
  })
})

test('@story-8-2 @p1 Cmd/Ctrl+E triggers preview in workspace', async () => {
  await withIsolatedApp(async (window) => {
    await createProjectAndNavigate(window)

    await window.keyboard.press(`${MODIFIER_KEY}+e`)

    // Should show loading overlay or error (docx bridge may not be running)
    const overlay = window.getByTestId('export-preview-loading-overlay')
    await expect(overlay.or(window.getByTestId('preview-error-alert'))).toBeVisible({
      timeout: 10_000,
    })
  })
})

test('@story-8-2 @p0 preview error shows friendly message and retry', async () => {
  await withIsolatedApp(async (window) => {
    await createProjectAndNavigate(window)

    // Click preview — without Python process running, this should fail
    await window.getByTestId('preview-btn').click()

    // Wait for error state
    const errorAlert = window.getByTestId('preview-error-alert')
    await expect(errorAlert).toBeVisible({ timeout: 30_000 })

    // Retry button should be available
    await expect(window.getByTestId('retry-btn')).toBeVisible()

    // Back to edit should work
    await window.getByTestId('back-to-edit-btn').click()

    // Modal should close and workspace should be intact
    await expect(window.getByTestId('project-workspace')).toBeVisible()
  })
})

test('@story-8-2 @p1 Escape closes error/ready modal', async () => {
  await withIsolatedApp(async (window) => {
    await createProjectAndNavigate(window)

    await window.getByTestId('preview-btn').click()

    // Wait for either loading or error state
    const overlay = window.getByTestId('export-preview-loading-overlay')
    const errorAlert = window.getByTestId('preview-error-alert')
    await expect(overlay.or(errorAlert)).toBeVisible({ timeout: 30_000 })

    // If we're in error state, try Escape to close the modal
    if (await errorAlert.isVisible().catch(() => false)) {
      await window.keyboard.press('Escape')
      await expect(window.getByTestId('project-workspace')).toBeVisible()
    }
  })
})

test('@story-8-2 @p1 cancel during loading dismisses overlay', async () => {
  await withIsolatedApp(
    async (window) => {
      await createProjectAndNavigate(window)

      await window.getByTestId('preview-btn').click()

      // E2E delay guarantees the loading overlay stays visible long enough to cancel
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

test('@story-8-2 @p1 preview ready → back to edit closes modal (AC4)', async () => {
  await withIsolatedApp(
    async (window) => {
      await createProjectAndNavigate(window)

      await window.getByTestId('preview-btn').click()

      // Wait for preview to reach ready state — confirm button only renders in ready state
      const confirmBtn = window.getByTestId('confirm-export-btn')
      await expect(confirmBtn).toBeVisible({ timeout: 30_000 })

      // Click 返回编辑
      await window.getByTestId('back-to-edit-btn').click()

      // Modal should close: confirm button disappears, workspace stays intact
      await expect(confirmBtn).not.toBeVisible({ timeout: 5_000 })
      await expect(window.getByTestId('project-workspace')).toBeVisible()
    },
    { BIDWISE_E2E_EXPORT_PREVIEW_MOCK: 'true' }
  )
})

test('@story-8-2 @p1 confirm export: cancel preserves modal, retry succeeds with toast (AC5)', async () => {
  const exportOutputPath = join(mkdtempSync(join(tmpdir(), 'bidwise-e2e-ac5-')), 'test-output.docx')

  try {
    await withIsolatedApp(
      async (window) => {
        await createProjectAndNavigate(window)

        await window.getByTestId('preview-btn').click()

        // Wait for ready state
        const confirmBtn = window.getByTestId('confirm-export-btn')
        await expect(confirmBtn).toBeVisible({ timeout: 30_000 })

        // First 确认导出 → dialog cancel → modal stays open
        await confirmBtn.click()
        // Confirm button should still be visible (modal persists after cancel)
        await expect(confirmBtn).toBeVisible({ timeout: 5_000 })

        // Second 确认导出 → dialog auto-save → success Toast
        await confirmBtn.click()

        // Success toast should appear
        const toast = window.locator('.ant-message-success')
        await expect(toast).toBeVisible({ timeout: 10_000 })
        await expect(toast).toContainText('导出')

        // Modal should close
        await expect(confirmBtn).not.toBeVisible({ timeout: 5_000 })
      },
      {
        BIDWISE_E2E_EXPORT_PREVIEW_MOCK: 'true',
        BIDWISE_E2E_EXPORT_DIALOG_PATH: exportOutputPath,
        BIDWISE_E2E_EXPORT_DIALOG_CANCEL_COUNT: '1',
      }
    )
  } finally {
    // Clean up exported file
    if (existsSync(exportOutputPath)) unlinkSync(exportOutputPath)
    try {
      rmSync(resolve(exportOutputPath, '..'), { recursive: true, force: true })
    } catch {
      // Best-effort
    }
  }
})
