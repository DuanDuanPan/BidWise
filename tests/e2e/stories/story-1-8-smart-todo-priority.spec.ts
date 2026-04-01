import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')
const RESIZE_SETTLE_MS = 450

test.setTimeout(90_000)

type SeedProjectInput = {
  name: string
  customerName: string
  industry: string
  deadline?: string
  sopStage?: string
}

type ProjectCreateResponse = {
  success: boolean
  data?: { id: string }
  error?: { message?: string }
}

type ProjectListResponse = {
  success: boolean
  data?: Array<{ id: string }>
  error?: { message?: string }
}

type ProjectUpdateResponse = {
  success: boolean
  error?: { message?: string }
}

function daysFromNowIso(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  date.setHours(12, 0, 0, 0)
  return date.toISOString()
}

async function withIsolatedApp(
  viewport: { width: number; height: number },
  run: (page: Page) => Promise<void>
): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-1-8-'))
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
    await expect.poll(() => electronApp.windows().length, { timeout: 30_000 }).toBeGreaterThan(0)
    const [window] = electronApp.windows()
    await window.waitForLoadState('domcontentloaded')
    await window.setViewportSize(viewport)
    await expect.poll(() => window.evaluate(() => window.innerWidth)).toBe(viewport.width)
    await window.waitForTimeout(RESIZE_SETTLE_MS)
    await expect(window).toHaveTitle('BidWise')
    await expect(window.getByTestId('project-kanban')).toBeVisible()
    await clearAllProjects(window)
    await reloadKanban(window)
    await run(window)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function createProject(page: Page, input: SeedProjectInput): Promise<string> {
  const response = await page.evaluate(async (payload) => {
    const api = (
      window as Window & {
        api: {
          projectCreate: (input: {
            name: string
            customerName: string
            industry: string
            deadline?: string
            proposalType: 'presale-technical'
          }) => Promise<ProjectCreateResponse>
        }
      }
    ).api

    return api.projectCreate({
      name: payload.name,
      customerName: payload.customerName,
      industry: payload.industry,
      deadline: payload.deadline,
      proposalType: 'presale-technical',
    })
  }, input)

  expect(response.success, response.error?.message ?? 'projectCreate failed').toBeTruthy()

  if (!response.success || !response.data?.id) {
    throw new Error(response.error?.message ?? 'projectCreate did not return an id')
  }

  return response.data.id
}

async function updateProject(
  page: Page,
  projectId: string,
  input: { deadline?: string; sopStage?: string }
): Promise<void> {
  const response = await page.evaluate(
    async (payload) => {
      const api = (
        window as Window & {
          api: {
            projectUpdate: (input: {
              projectId: string
              input: { deadline?: string; sopStage?: string }
            }) => Promise<ProjectUpdateResponse>
          }
        }
      ).api

      return api.projectUpdate(payload)
    },
    { projectId, input }
  )

  expect(response.success, response.error?.message ?? 'projectUpdate failed').toBeTruthy()
}

async function seedProject(
  page: Page,
  input: SeedProjectInput
): Promise<{ id: string; name: string }> {
  const projectId = await createProject(page, input)

  if (input.deadline !== undefined || input.sopStage !== undefined) {
    await updateProject(page, projectId, {
      deadline: input.deadline,
      sopStage: input.sopStage,
    })
  }

  return { id: projectId, name: input.name }
}

async function clearAllProjects(page: Page): Promise<void> {
  const response = await page.evaluate(async () => {
    const api = (
      window as Window & {
        api: {
          projectList: () => Promise<ProjectListResponse>
          projectDelete: (projectId: string) => Promise<ProjectUpdateResponse>
        }
      }
    ).api

    const listResult = await api.projectList()
    if (!listResult.success) {
      return { success: false, error: listResult.error?.message ?? 'projectList failed' }
    }

    for (const project of listResult.data ?? []) {
      const deleteResult = await api.projectDelete(project.id)
      if (!deleteResult.success) {
        return {
          success: false,
          error: deleteResult.error?.message ?? `projectDelete failed for ${project.id}`,
        }
      }
    }

    return { success: true }
  })

  expect(response.success, response.error ?? 'Failed to clear existing projects').toBeTruthy()
}

async function reloadKanban(page: Page): Promise<void> {
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByTestId('project-kanban')).toBeVisible()
}

async function resizeWindow(page: Page, width: number, height = 920): Promise<void> {
  await page.setViewportSize({ width, height })
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width)
  await page.waitForTimeout(RESIZE_SETTLE_MS)
}

async function getTodoOrder(page: Page): Promise<string[]> {
  return page
    .getByRole('list', { name: '待办列表' })
    .locator('[data-testid^="todo-item-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid') ?? ''))
}

test('@story-1-8 @p0 prioritizes projects in the smart todo panel and opens the matching workspace stage', async () => {
  await withIsolatedApp({ width: 1600, height: 920 }, async (page) => {
    const runId = Date.now().toString()
    const highest = await seedProject(page, {
      name: `Story 1-8 Alpha ${runId}`,
      customerName: '客户甲',
      industry: '军工',
      deadline: daysFromNowIso(1),
      sopStage: 'delivery',
    })
    const middle = await seedProject(page, {
      name: `Story 1-8 Beta ${runId}`,
      customerName: '客户乙',
      industry: '能源',
      deadline: daysFromNowIso(3),
      sopStage: 'compliance-review',
    })
    const lowest = await seedProject(page, {
      name: `Story 1-8 Gamma ${runId}`,
      customerName: '客户丙',
      industry: '医疗',
      sopStage: 'requirements-analysis',
    })

    await reloadKanban(page)

    await expect
      .poll(() =>
        page.getByRole('list', { name: '待办列表' }).locator('[data-testid^="todo-item-"]').count()
      )
      .toBe(3)
    await expect(page.getByRole('complementary', { name: '智能待办' })).toBeVisible()
    await expect(page.getByTestId(`todo-item-${highest.id}`)).toContainText('导出交付物')
    await expect(page.getByTestId(`todo-item-${lowest.id}`)).toContainText('未设定')
    expect(await getTodoOrder(page)).toEqual([
      `todo-item-${highest.id}`,
      `todo-item-${middle.id}`,
      `todo-item-${lowest.id}`,
    ])

    await page.getByTestId(`todo-item-${highest.id}`).click()

    await expect(page.getByTestId('project-workspace')).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`#\\/project\\/${highest.id}$`))
    await expect(page.getByTestId('stage-guide-placeholder')).toHaveAttribute(
      'data-stage',
      'delivery'
    )
  })
})

test('@story-1-8 @p0 shows the empty state and falls back to SOP-stage ordering when deadlines are missing', async () => {
  await withIsolatedApp({ width: 1600, height: 920 }, async (page) => {
    await expect(page.getByTestId('todo-empty-state')).toBeVisible()
    await expect(page.getByText('暂无待办事项')).toBeVisible()
    await expect(
      page.getByTestId('todo-empty-state').getByRole('button', { name: /新建项目/ })
    ).toBeVisible()

    const runId = Date.now().toString()
    const earlierStage = await seedProject(page, {
      name: `Story 1-8 Delta ${runId}`,
      customerName: '客户丁',
      industry: '军工',
      sopStage: 'requirements-analysis',
    })
    const laterStage = await seedProject(page, {
      name: `Story 1-8 Epsilon ${runId}`,
      customerName: '客户戊',
      industry: '能源',
      sopStage: 'compliance-review',
    })

    await reloadKanban(page)

    await expect
      .poll(() =>
        page.getByRole('list', { name: '待办列表' }).locator('[data-testid^="todo-item-"]').count()
      )
      .toBe(2)
    expect(await getTodoOrder(page)).toEqual([
      `todo-item-${laterStage.id}`,
      `todo-item-${earlierStage.id}`,
    ])
    await expect(
      page
        .getByRole('list', { name: '待办列表' })
        .locator('[data-testid^="todo-item-"] >> text=未设定')
    ).toHaveCount(2)
  })
})

test('@story-1-8 @p1 auto-collapses the smart todo panel in compact mode and keeps manual overrides until the breakpoint changes', async () => {
  await withIsolatedApp({ width: 1180, height: 920 }, async (page) => {
    const runId = Date.now().toString()
    await seedProject(page, {
      name: `Story 1-8 Compact ${runId}`,
      customerName: '客户己',
      industry: '轨交',
      deadline: daysFromNowIso(2),
      sopStage: 'solution-design',
    })

    await reloadKanban(page)

    await expect(page.getByTestId('todo-panel-icon-bar')).toBeVisible()
    await expect(page.getByTestId('todo-panel-flyout')).toHaveCount(0)

    const compactTrigger = page
      .getByTestId('todo-panel-icon-bar')
      .getByRole('button', { name: '展开智能待办面板' })
    await expect(compactTrigger).toBeVisible()
    await compactTrigger.click()
    await expect(page.getByTestId('todo-panel-flyout')).toBeVisible()

    await resizeWindow(page, 1100)
    await expect(page.getByTestId('todo-panel-flyout')).toBeVisible()

    await resizeWindow(page, 1400)
    await expect(page.getByTestId('todo-panel')).toBeVisible()
    await expect(page.getByTestId('todo-panel-icon-bar')).toHaveCount(0)

    await resizeWindow(page, 1180)
    await expect(page.getByTestId('todo-panel-icon-bar')).toBeVisible()
    await expect(page.getByTestId('todo-panel-flyout')).toHaveCount(0)
  })
})
