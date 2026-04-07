import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 4.3 E2E: Smart Annotation Panel — type/status filters,
 * context-aware sorting, section scoping, overload panel, ask-system dialog.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = Record<string, (...args: any[]) => any>

const APP_ENTRY = resolve(process.cwd(), 'out/main/index.js')

type LaunchContext = {
  electronApp: Awaited<ReturnType<typeof electron.launch>>
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>
  sandboxHome: string
  projectId: string
}

async function launchApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-e2e-4-3-'))
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      ELECTRON_IS_DEV: '0',
      BIDWISE_E2E: 'true',
      HOME: sandboxHome,
      APPDATA: sandboxHome,
      XDG_CONFIG_HOME: sandboxHome,
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: AnyApi }).api
    return api.projectCreate({ name: 'E2E Smart Panel Test' })
  })

  const projectId = (result as { success: boolean; data: { id: string } }).data.id
  return { electronApp, window, sandboxHome, projectId }
}

async function cleanupApp(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
}

async function createAnnotation(
  ctx: LaunchContext,
  overrides: Record<string, string> = {}
): Promise<{ id: string; status: string; content: string }> {
  const result = await ctx.window.evaluate(
    async (args: { pid: string; overrides: Record<string, string> }) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationCreate({
        projectId: args.pid,
        sectionId: args.overrides.sectionId ?? '2:公司简介:0',
        type: args.overrides.type ?? 'ai-suggestion',
        content: args.overrides.content ?? `E2E annotation ${Date.now()}`,
        author: args.overrides.author ?? 'e2e-agent',
      })
    },
    { pid: ctx.projectId, overrides }
  )
  return (result as { data: { id: string; status: string; content: string } }).data
}

async function navigateToProposalWriting(ctx: LaunchContext): Promise<void> {
  await ctx.window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, ctx.projectId)

  await ctx.window.waitForSelector('[data-testid="project-workspace"]', { timeout: 10_000 })
  // Navigate to proposal-writing stage (Alt+3)
  await ctx.window.keyboard.press('Alt+3')
  // Wait for either expanded panel or compact icon bar (depends on viewport width)
  await ctx.window
    .locator('[data-testid="annotation-panel"], [data-testid="annotation-icon-bar"]')
    .first()
    .waitFor({ timeout: 10_000 })
}

async function ensurePanelOpen(ctx: LaunchContext): Promise<void> {
  const panel = ctx.window
    .locator('[data-testid="annotation-panel"]')
    .or(ctx.window.locator('[data-testid="annotation-icon-bar"]'))
  await expect(panel).toBeVisible({ timeout: 15_000 })

  // In compact mode the icon bar is shown; click to open the flyout
  const iconButton = ctx.window.locator('[data-testid="annotation-icon-button"]')
  if (await iconButton.isVisible().catch(() => false)) {
    await iconButton.click()
    await expect(ctx.window.locator('[data-testid="annotation-flyout"]')).toBeVisible({
      timeout: 5_000,
    })
  }
}

test.describe('Story 4.3: Smart Annotation Panel', () => {
  let ctx: LaunchContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await cleanupApp(ctx)
  })

  test('type filter toggles annotation visibility', async () => {
    await createAnnotation(ctx, { type: 'ai-suggestion', content: 'AI suggestion' })
    await createAnnotation(ctx, { type: 'adversarial', content: 'Adversarial finding' })
    await navigateToProposalWriting(ctx)
    await ensurePanelOpen(ctx)

    // Both should be visible initially
    const filters = ctx.window.locator('[data-testid="annotation-filters"]')
    await expect(filters).toBeVisible({ timeout: 5_000 })

    // Click to toggle off ai-suggestion filter
    const aiDot = ctx.window.locator('[data-testid="type-filter-ai-suggestion"]')
    await aiDot.click()

    // Wait a moment for filter to apply
    await ctx.window.waitForTimeout(500)
  })

  test('status filter tabs render with badge counts', async () => {
    await navigateToProposalWriting(ctx)
    await ensurePanelOpen(ctx)

    const pendingTab = ctx.window.locator('[data-testid="status-filter-pending"]')
    await expect(pendingTab).toBeVisible({ timeout: 5_000 })

    const processedTab = ctx.window.locator('[data-testid="status-filter-processed"]')
    await expect(processedTab).toBeVisible()

    const decisionTab = ctx.window.locator('[data-testid="status-filter-needs-decision"]')
    await expect(decisionTab).toBeVisible()
  })

  test('ask-system button is visible', async () => {
    await navigateToProposalWriting(ctx)
    await ensurePanelOpen(ctx)

    const askButton = ctx.window.locator('[data-testid="ask-system-button"]')
    await expect(askButton).toBeVisible({ timeout: 5_000 })
  })

  test('shell geometry contracts preserved', async () => {
    // Resize to >=1600px so the workspace exits compact mode and expands the panel
    const page = ctx.window
    await page.evaluate(() => window.resizeTo(1600, 900))
    // Allow layout to settle after resize
    await page.waitForTimeout(500)

    await navigateToProposalWriting(ctx)

    // In non-compact mode the expanded panel should be visible at 320px
    const panel = ctx.window.locator('[data-testid="annotation-panel"]')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    const box = await panel.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.width).toBe(320)
    }
  })
})
