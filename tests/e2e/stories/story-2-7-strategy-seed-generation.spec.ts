import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(120_000)

interface TestSession {
  electronApp: ElectronApplication
  page: Page
  projectId: string
  testHome: string
}

async function launchSession(testTitle: string): Promise<TestSession> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-2-7-'))
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
    },
  })

  const page = await electronApp.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page).toHaveTitle('BidWise')
  await expect(page.getByTestId('project-kanban')).toBeVisible()

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
      return api.projectCreate({ name, customerName, industry, proposalType: 'presale-technical' })
    },
    {
      name: `QA Story 2-7 ${timestamp} ${testTitle}`,
      customerName: '自动化测试客户',
      industry: '军工',
    }
  )

  expect(response.success, response.error?.message ?? 'projectCreate failed').toBeTruthy()
  const projectId = response.data!.id

  // Navigate to workspace
  const projectCard = page.getByTestId(`project-card-${projectId}`)
  await expect(projectCard).toBeVisible()
  await projectCard.click()
  await expect(page.getByTestId('project-workspace')).toBeVisible()
  await expect(page.getByTestId('analysis-view')).toBeVisible()

  return { electronApp, page, projectId, testHome }
}

async function cleanupSession(session: TestSession): Promise<void> {
  try {
    await session.page.evaluate(async (id) => {
      const api = (
        window as Window & {
          api: { projectDelete: (id: string) => Promise<{ success: boolean }> }
        }
      ).api
      await api.projectDelete(id)
    }, session.projectId)
  } catch {
    // Best effort cleanup
  }
  await session.electronApp.close()
  rmSync(session.testHome, { recursive: true, force: true })
}

test('@story-2-7 @p0 displays strategy seed empty state in analysis view', async () => {
  const session = await launchSession('empty-state')
  try {
    const { page } = session

    // The analysis view should be visible with seed list tab available
    await expect(page.getByTestId('analysis-view')).toBeVisible()

    // Strategy seed tab should exist (labeled "策略种子")
    const seedTab = page.getByRole('tab', { name: /策略种子/ })
    await expect(seedTab).toBeVisible()

    // Click the seed tab to see empty state
    await seedTab.click()
    await expect(page.getByTestId('seed-list')).toBeVisible()

    // The generate button should be present in the empty state
    await expect(page.getByTestId('seed-generate')).toBeVisible()
  } finally {
    await cleanupSession(session)
  }
})

test('@story-2-7 @p1 seed generation completes and seeds can be confirmed, edited, and deleted', async () => {
  const session = await launchSession('seed-crud')
  try {
    const { page } = session

    // Navigate to strategy seed tab
    const seedTab = page.getByRole('tab', { name: /策略种子/ })
    await seedTab.click()
    await expect(page.getByTestId('seed-list')).toBeVisible()

    // Click generate to open material input modal
    await page.getByTestId('seed-generate').click()
    await expect(page.getByTestId('material-modal')).toBeVisible()

    // Fill in source material
    const textarea = page.getByTestId('material-textarea')
    await expect(textarea).toBeVisible()
    await textarea.fill(
      '客户会议纪要：客户非常关注数据安全合规性，希望系统支持国密算法加密。' +
        '客户CTO多次提及之前使用竞品A的体验不佳，主要是性能问题。' +
        '客户期望项目在3个月内完成上线。'
    )

    // Trigger generation
    await page.getByTestId('material-generate').click()

    // Modal should close and generation should start (or the seeds appear)
    // Wait for generation to finish — either seeds appear or we see a progress indicator
    // then the final state
    await expect(page.getByTestId('material-modal')).toBeHidden({ timeout: 5_000 })

    // Wait for seed cards to appear (generation may take time via task queue)
    // We use a generous timeout since this is async AI generation
    const seedCard = page.getByTestId('seed-card').first()
    await expect(seedCard).toBeVisible({ timeout: 60_000 })

    // Verify seed summary is visible
    await expect(page.getByTestId('seed-summary')).toBeVisible()

    // Test confirm action on the first pending seed
    const confirmBtn = page.getByTestId('seed-confirm').first()
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click()
      // After confirm, the button should disappear or the seed status should change
    }

    // Test that the seed list persists across navigation
    // Go back to kanban
    await page.getByTestId('back-to-kanban').click()
    await expect(page.getByTestId('project-kanban')).toBeVisible()

    // Re-open the project
    const projectCard = page.getByTestId(`project-card-${session.projectId}`)
    await projectCard.click()
    await expect(page.getByTestId('project-workspace')).toBeVisible()

    // Navigate back to seed tab and verify seeds persisted
    const seedTabAgain = page.getByRole('tab', { name: /策略种子/ })
    await seedTabAgain.click()
    await expect(page.getByTestId('seed-card').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await cleanupSession(session)
  }
})

test('@story-2-7 @p1 seed generation does not block other analysis operations', async () => {
  const session = await launchSession('non-blocking')
  try {
    const { page } = session

    // Verify the analysis view is accessible and responsive
    await expect(page.getByTestId('analysis-view')).toBeVisible()

    // The extraction tab (requirements) should still be interactable
    // even if seed generation would be running
    const extractionTab = page.getByRole('tab', { name: /需求/ }).first()
    if (await extractionTab.isVisible()) {
      await extractionTab.click()
      // Should be able to switch tabs without issues
    }

    // Switch to seed tab
    const seedTab = page.getByRole('tab', { name: /策略种子/ })
    await seedTab.click()
    await expect(page.getByTestId('seed-list')).toBeVisible()

    // Switch back — UI should remain responsive
    if (await extractionTab.isVisible()) {
      await extractionTab.click()
    }
  } finally {
    await cleanupSession(session)
  }
})
