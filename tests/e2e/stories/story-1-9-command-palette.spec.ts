import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const MODIFIER_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'
const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(90_000)

async function withIsolatedApp(run: (window: Page) => Promise<void>): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-1-9-'))
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

async function createProject(window: Page, name: string, customerName: string): Promise<string> {
  const response = await window.evaluate(
    async ({ projectName, projectCustomer }) => {
      return window.api.projectCreate({
        name: projectName,
        customerName: projectCustomer,
        proposalType: 'presale-technical',
      })
    },
    { projectName: name, projectCustomer: customerName }
  )

  expect(response.success, response.success ? undefined : response.error.message).toBeTruthy()

  if (!response.success || !response.data?.id) {
    throw new Error(
      response.success ? 'projectCreate did not return an id' : response.error.message
    )
  }

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible()
  await expect(window.getByTestId(`project-card-${response.data.id}`)).toBeVisible()

  return response.data.id
}

async function triggerShortcut(window: Page, key: string): Promise<void> {
  await window.evaluate(
    ({ shortcutKey, modifierKey }) => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        key: shortcutKey,
        metaKey: modifierKey === 'Meta',
        ctrlKey: modifierKey === 'Control',
        bubbles: true,
        cancelable: true,
      })

      window.dispatchEvent(keyboardEvent)
    },
    { shortcutKey: key, modifierKey: MODIFIER_KEY }
  )
}

async function openCommandPalette(window: Page): Promise<void> {
  await triggerShortcut(window, 'k')
  await expect(window.getByTestId('command-palette')).toBeVisible()
  await expect(window.getByTestId('command-palette-input')).toBeVisible()
}

async function searchCommand(window: Page, query: string): Promise<void> {
  const input = window.getByTestId('command-palette-input')
  await input.fill(query)
}

test('@story-1-9 @p0 opens the command palette and supports stage jumps, project switching, and scoped placeholders', async () => {
  await withIsolatedApp(async (window) => {
    const runId = Date.now().toString()
    const projectAlpha = `Story 1-9 Alpha ${runId}`
    const projectBeta = `Story 1-9 Beta ${runId}`

    await createProject(window, projectAlpha, '客户甲')
    await createProject(window, projectBeta, '客户乙')

    await openCommandPalette(window)
    await searchCommand(window, projectAlpha)
    await expect(window.getByTestId('command-palette-list').getByText(projectAlpha)).toBeVisible()
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(window.getByTestId('project-workspace')).toBeVisible()
    await expect(window.getByTestId('project-workspace').getByText(projectAlpha)).toBeVisible()

    await openCommandPalette(window)
    await searchCommand(window, '方案设计')
    await expect(window.getByTestId('command-palette-list').getByText('方案设计阶段')).toBeVisible()
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(
      window.getByTestId('solution-design-view').or(window.getByTestId('solution-design-loading'))
    ).toBeVisible()

    await openCommandPalette(window)
    await searchCommand(window, projectBeta)
    await expect(window.getByTestId('command-palette-list').getByText(projectBeta)).toBeVisible()
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(window.getByTestId('project-workspace')).toBeVisible()
    await expect(window.getByTestId('project-workspace').getByText(projectBeta)).toBeVisible()

    await openCommandPalette(window)
    await searchCommand(window, '章节')
    const sectionCommand = window.getByTestId('command-item-command-palette:jump-to-section')
    await expect(sectionCommand).toContainText('1.7 合并后可用')
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(window.getByText('章节跳转将在 Story 1.7 合并后可用')).toBeVisible()

    await openCommandPalette(window)
    await searchCommand(window, '对抗')
    const reviewCommand = window.getByTestId(
      'command-item-command-palette:start-adversarial-review'
    )
    await expect(reviewCommand).toContainText('需要 Epic 5')
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(window.getByText('对抗评审需要 Epic 5 模块就绪')).toBeVisible()

    await openCommandPalette(window)
    await searchCommand(window, '资产')
    const assetCommand = window.getByTestId('command-item-command-palette:search-assets')
    await expect(assetCommand).toContainText('需要 Epic 6')
    await window.getByTestId('command-palette-input').press('Enter')
    await expect(window.getByText('资产库搜索需要 Epic 6 模块就绪')).toBeVisible()
  })
})

test('@story-1-9 @p0 intercepts Cmd/Ctrl+S and shows the auto-save toast', async () => {
  await withIsolatedApp(async (window) => {
    await triggerShortcut(window, 's')

    const autosaveToast = window.getByText('已自动保存')
    await expect(autosaveToast).toBeVisible()
    await expect(autosaveToast).toBeHidden({ timeout: 5_000 })
  })
})

test('@story-1-9 @p1 intercepts Cmd/Ctrl+E and exposes the export placeholder in the command palette', async () => {
  await withIsolatedApp(async (window) => {
    await triggerShortcut(window, 'e')

    const exportToast = window.getByText('导出功能即将推出')
    await expect(exportToast).toBeVisible()
    await expect(exportToast).toBeHidden({ timeout: 5_000 })

    await openCommandPalette(window)
    await searchCommand(window, '导出')

    const exportCommand = window.getByTestId('command-item-command-palette:export-document')
    await expect(exportCommand).toContainText('即将推出')
    await exportCommand.click({ force: true })

    await expect(window.getByText('导出功能即将推出')).toBeVisible()
  })
})
