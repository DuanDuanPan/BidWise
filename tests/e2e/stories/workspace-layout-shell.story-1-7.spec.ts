import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { resolve } from 'path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')
const RESIZE_SETTLE_MS = 450

interface WorkspaceSession {
  electronApp: ElectronApplication
  page: Page
  projectId: string
}

async function launchElectronApp(): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
  })

  await expect.poll(() => electronApp.windows().length, { timeout: 30000 }).toBeGreaterThan(0)

  const [page] = electronApp.windows()
  await page.waitForLoadState('domcontentloaded')

  return { electronApp, page }
}

async function createProject(page: Page, testTitle: string): Promise<string> {
  const timestamp = Date.now()
  const response = await page.evaluate(
    async ({ name, customerName, industry }) => {
      const api = (
        window as Window & {
          api: {
            projectCreate: (input: {
              name: string
              customerName: string
              industry: string
              proposalType: 'presale-technical'
            }) => Promise<{
              success: boolean
              data?: { id: string }
              error?: { message?: string }
            }>
          }
        }
      ).api

      return api.projectCreate({
        name,
        customerName,
        industry,
        proposalType: 'presale-technical',
      })
    },
    {
      name: `QA Story 1-7 ${timestamp} ${testTitle}`,
      customerName: '自动化测试客户',
      industry: '军工',
    }
  )

  expect(response.success, response.error?.message ?? 'projectCreate failed').toBeTruthy()

  if (!response.success || !response.data?.id) {
    throw new Error(response.error?.message ?? 'projectCreate did not return an id')
  }

  return response.data.id
}

async function deleteProject(page: Page, projectId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const api = (
      window as Window & {
        api: {
          projectDelete: (projectId: string) => Promise<{ success: boolean }>
        }
      }
    ).api

    await api.projectDelete(id)
  }, projectId)
}

async function openWorkspaceFromKanban(page: Page, projectId: string): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const projectCard = page.getByTestId(`project-card-${projectId}`)
  await expect(projectCard).toBeVisible()
  await projectCard.click()

  await expect(page.getByTestId('project-workspace')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`#\\/project\\/${projectId}$`))
}

async function launchWorkspaceSession(
  testTitle: string,
  size: { width: number; height: number }
): Promise<WorkspaceSession> {
  const { electronApp, page } = await launchElectronApp()

  await page.setViewportSize(size)
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(size.width)

  const projectId = await createProject(page, testTitle)
  await openWorkspaceFromKanban(page, projectId)

  return { electronApp, page, projectId }
}

async function cleanupSession(session: WorkspaceSession): Promise<void> {
  try {
    await deleteProject(session.page, session.projectId)
  } catch {
    // Best effort cleanup for test-created records.
  }

  await session.electronApp.close()
}

async function getWidth(locator: Locator): Promise<number> {
  return locator.evaluate((node) => Math.round((node as HTMLElement).getBoundingClientRect().width))
}

async function dispatchWorkspaceShortcut(page: Page, key: 'b' | '\\'): Promise<void> {
  const isMac = process.platform === 'darwin'

  await page.evaluate(
    ({ shortcutKey, metaKey, ctrlKey }) => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: shortcutKey,
          metaKey,
          ctrlKey,
          bubbles: true,
          cancelable: true,
        })
      )
    },
    { shortcutKey: key, metaKey: isMac, ctrlKey: !isMac }
  )
}

async function resizeWorkspace(page: Page, width: number, height = 960): Promise<void> {
  await page.setViewportSize({ width, height })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
  await page.waitForTimeout(RESIZE_SETTLE_MS)
}

test('@story-1-7 @p0 renders the three-column workspace shell from the kanban flow', async () => {
  const session = await launchWorkspaceSession('shell-render', { width: 1600, height: 960 })

  try {
    const { page } = session
    const outlinePanel = page.getByTestId('outline-panel')
    const annotationPanel = page.getByTestId('annotation-panel')
    const statusBar = page.getByTestId('status-bar')
    const workspaceMain = page.getByTestId('workspace-main')
    const mainContentShell = page.locator('[data-testid="workspace-main"] > div').first()

    await expect(page.getByRole('complementary', { name: '文档大纲' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: '智能批注' })).toBeVisible()
    await expect(page.getByRole('status', { name: '项目状态栏' })).toBeVisible()
    await expect(page.getByTestId('sop-progress-bar')).toBeVisible()
    await expect(page.getByTestId('analysis-view')).toBeVisible()

    expect(await getWidth(outlinePanel)).toBeGreaterThanOrEqual(230)
    expect(await getWidth(workspaceMain)).toBeGreaterThanOrEqual(600)
    expect(await getWidth(annotationPanel)).toBeGreaterThanOrEqual(310)
    expect(await getWidth(statusBar)).toBeGreaterThan(0)
    expect(await getWidth(mainContentShell)).toBeLessThanOrEqual(800)
  } finally {
    await cleanupSession(session)
  }
})

test('@story-1-7 @p0 toggles both side panels with workspace keyboard shortcuts', async () => {
  const session = await launchWorkspaceSession('keyboard-toggles', { width: 1600, height: 960 })

  try {
    const { page } = session
    const outlinePanel = page.getByTestId('outline-panel')
    const annotationPanel = page.getByTestId('annotation-panel')

    await expect(page.getByLabel('折叠文档大纲')).toBeVisible()
    await expect(page.getByLabel('折叠智能批注')).toBeVisible()

    await dispatchWorkspaceShortcut(page, 'b')
    await expect(page.getByLabel('展开智能批注')).toBeVisible()
    await expect.poll(() => getWidth(annotationPanel)).toBeLessThanOrEqual(48)

    await dispatchWorkspaceShortcut(page, '\\')
    await expect(page.getByLabel('展开文档大纲')).toBeVisible()
    await expect.poll(() => getWidth(outlinePanel)).toBeLessThanOrEqual(48)

    await dispatchWorkspaceShortcut(page, 'b')
    await expect(page.getByLabel('折叠智能批注')).toBeVisible()
    await expect.poll(() => getWidth(annotationPanel)).toBeGreaterThanOrEqual(310)

    await dispatchWorkspaceShortcut(page, '\\')
    await expect(page.getByLabel('折叠文档大纲')).toBeVisible()
    await expect.poll(() => getWidth(outlinePanel)).toBeGreaterThanOrEqual(230)
  } finally {
    await cleanupSession(session)
  }
})

test('@story-1-7 @p0 applies compact-mode auto-collapse and preserves manual overrides until breakpoint changes', async () => {
  const session = await launchWorkspaceSession('compact-mode', { width: 1280, height: 960 })

  try {
    const { page } = session
    const outlinePanel = page.getByTestId('outline-panel')
    const annotationPanel = page.getByTestId('annotation-panel')

    await expect(page.getByLabel('展开文档大纲')).toBeVisible()
    await expect(page.getByTestId('annotation-icon-bar')).toBeVisible()
    await expect.poll(() => getWidth(outlinePanel)).toBeLessThanOrEqual(48)

    await dispatchWorkspaceShortcut(page, '\\')
    await dispatchWorkspaceShortcut(page, 'b')

    await expect(page.getByLabel('折叠文档大纲')).toBeVisible()
    await expect(page.getByLabel('折叠智能批注')).toBeVisible()
    await expect(page.getByTestId('annotation-icon-bar')).toHaveCount(0)
    await expect.poll(() => getWidth(outlinePanel)).toBeGreaterThanOrEqual(230)
    await expect.poll(() => getWidth(annotationPanel)).toBeGreaterThanOrEqual(310)

    await resizeWorkspace(page, 1360)
    await expect(page.getByLabel('折叠文档大纲')).toBeVisible()
    await expect(page.getByLabel('折叠智能批注')).toBeVisible()

    await resizeWorkspace(page, 1520)
    await expect(page.getByLabel('折叠文档大纲')).toBeVisible()
    await expect(page.getByLabel('折叠智能批注')).toBeVisible()

    await resizeWorkspace(page, 1280)
    await expect(page.getByLabel('展开文档大纲')).toBeVisible()
    await expect(page.getByTestId('annotation-icon-bar')).toBeVisible()
    await expect.poll(() => getWidth(outlinePanel)).toBeLessThanOrEqual(48)
  } finally {
    await cleanupSession(session)
  }
})

test('@story-1-7 @p1 opens and closes the compact annotation flyout with focus recovery', async () => {
  const session = await launchWorkspaceSession('compact-flyout', { width: 1280, height: 960 })

  try {
    const { page } = session
    const trigger = page.getByTestId('annotation-icon-button')

    await expect(trigger).toBeVisible()
    await trigger.click()

    const flyout = page.getByTestId('annotation-flyout')
    await expect(flyout).toBeVisible()
    await expect(page.getByRole('dialog', { name: '智能批注面板' })).toBeVisible()
    await expect(flyout).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(flyout).toHaveCount(0)
    await expect(trigger).toBeFocused()
  } finally {
    await cleanupSession(session)
  }
})
