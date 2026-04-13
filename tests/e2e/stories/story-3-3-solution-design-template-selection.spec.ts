import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(90_000)

async function withIsolatedApp(run: (window: Page) => Promise<void>): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-3-3-'))
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

async function createProjectWithExistingSolutionContent(window: Page): Promise<string> {
  const result = await window.evaluate(async () => {
    const created = await window.api.projectCreate({
      name: `Story 3-3 Project ${Date.now()}`,
      customerName: '客户甲',
      proposalType: 'presale-technical',
    })

    if (!created.success) {
      return { success: false, message: created.error.message }
    }

    const projectId = created.data.id

    const saveResult = await window.api.documentSave({
      projectId,
      content: '# 项目概述\n\n已有内容\n\n# 系统设计\n\n已有内容\n',
    })

    if (!saveResult.success) {
      return { success: false, message: saveResult.error.message }
    }

    const updateResult = await window.api.projectUpdate({
      projectId,
      input: { sopStage: 'solution-design' },
    })

    if (!updateResult.success) {
      return { success: false, message: updateResult.error.message }
    }

    return { success: true, projectId }
  })

  expect(result.success, result.success ? undefined : result.message).toBeTruthy()

  if (!result.success || !('projectId' in result)) {
    throw new Error(result.success ? 'missing project id' : result.message)
  }

  await window.reload()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId(`project-card-${result.projectId}`)).toBeVisible()

  return result.projectId
}

test('@story-3-3 @p1 shows a confirmation dialog when reselecting template from existing content', async () => {
  await withIsolatedApp(async (window) => {
    const projectId = await createProjectWithExistingSolutionContent(window)

    await window.getByTestId(`project-card-${projectId}`).click()
    await expect(window.getByTestId('has-content-view')).toBeVisible()

    await window.getByTestId('reselect-template-btn').click()

    await expect(window.getByRole('dialog', { name: '重新选择模板' })).toBeVisible()
    await expect(window.getByText('重新生成骨架将覆盖当前方案内容，是否继续？')).toBeVisible()
  })
})
