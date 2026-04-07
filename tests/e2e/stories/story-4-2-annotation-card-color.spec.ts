import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 4.2 E2E: Annotation Card Color Coding — five-color cards,
 * type-specific action buttons, keyboard navigation, status transitions.
 *
 * Each test creates its own data to avoid order-dependency.
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
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-e2e-4-2-'))
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
    return api.projectCreate({ name: 'E2E Card Color Test' })
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
        sectionId: args.overrides.sectionId ?? 'project-root',
        type: args.overrides.type ?? 'human',
        content: args.overrides.content ?? `E2E card ${Date.now()}`,
        author: args.overrides.author ?? 'e2e-user',
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
  await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  const sopTab = ctx.window.getByTestId('sop-stage-proposal-writing')
  if (await sopTab.isVisible().catch(() => false)) {
    await sopTab.click()
  }
}

async function refreshAnnotations(ctx: LaunchContext): Promise<void> {
  await ctx.window.evaluate(async (pid) => {
    const api = (window as unknown as { api: AnyApi }).api
    const res = await api.annotationList({ projectId: pid })
    // Dispatch a custom event so the store can pick up the new data
    // The simplest approach: call loadAnnotations via the store directly
    // Since we can't import the store here, we re-navigate to force a remount
    return res
  }, ctx.projectId)

  // Navigate away briefly to force unmount, then back
  await ctx.window.evaluate(() => {
    window.location.hash = '#/'
  })
  await ctx.window
    .getByTestId('project-workspace')
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => {})
}

async function ensurePanelOpen(ctx: LaunchContext): Promise<void> {
  const panel = ctx.window
    .getByTestId('annotation-panel')
    .or(ctx.window.getByTestId('annotation-icon-bar'))
  await expect(panel).toBeVisible({ timeout: 15_000 })

  const iconButton = ctx.window.getByTestId('annotation-icon-button')
  if (await iconButton.isVisible().catch(() => false)) {
    await iconButton.click()
    await expect(ctx.window.getByTestId('annotation-flyout')).toBeVisible({ timeout: 5_000 })
  }

  await expect(ctx.window.getByTestId('annotation-list')).toBeVisible({ timeout: 15_000 })
}

test.describe('Story 4.2 Annotation Card Color Coding E2E', () => {
  let ctx: LaunchContext | null = null

  function getContext(): LaunchContext {
    if (!ctx) {
      throw new Error('E2E launch context was not initialized')
    }
    return ctx
  }

  test.beforeEach(async () => {
    ctx = await launchApp()
  })

  test.afterEach(async () => {
    if (ctx) {
      await cleanupApp(ctx)
      ctx = null
    }
  })

  test('five-color left borders render for different annotation types', async () => {
    const testCtx = getContext()
    const colorMap: Record<string, string> = {
      'ai-suggestion': 'rgb(22, 119, 255)',
      'asset-recommendation': 'rgb(82, 196, 26)',
      'score-warning': 'rgb(250, 173, 20)',
      adversarial: 'rgb(255, 77, 79)',
      human: 'rgb(114, 46, 209)',
    }

    for (const [type, content] of Object.entries({
      'ai-suggestion': 'E2E blue card test',
      'asset-recommendation': 'E2E green card test',
      'score-warning': 'E2E orange card test',
      adversarial: 'E2E red card test',
      human: 'E2E purple card test',
    })) {
      await createAnnotation(testCtx, { type, content })
    }

    await refreshAnnotations(testCtx)
    await navigateToProposalWriting(testCtx)
    await ensurePanelOpen(testCtx)

    const cards = testCtx.window.getByTestId('annotation-card')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Check that at least one card has each expected color
    for (const [, expectedColor] of Object.entries(colorMap)) {
      const matchingCard = cards.filter({
        has: testCtx.window.locator(`[style*="${expectedColor}"]`),
      })
      await expect(matchingCard.first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('action buttons display correct labels for ai-suggestion type', async () => {
    const testCtx = getContext()

    await createAnnotation(testCtx, {
      type: 'ai-suggestion',
      content: 'Action button label test',
    })

    await refreshAnnotations(testCtx)
    await navigateToProposalWriting(testCtx)
    await ensurePanelOpen(testCtx)

    // Find the ai-suggestion card
    const card = testCtx.window.getByText('Action button label test').locator('..')

    await expect(card.getByTestId('annotation-action-accept')).toContainText('采纳')
    await expect(card.getByTestId('annotation-action-reject')).toContainText('驳回')
    await expect(card.getByTestId('annotation-action-edit')).toContainText('修改')
  })

  test('clicking accept button changes card to accepted state with reduced opacity', async () => {
    const testCtx = getContext()

    const created = await createAnnotation(testCtx, {
      type: 'ai-suggestion',
      content: 'Status transition test card',
    })

    await refreshAnnotations(testCtx)
    await navigateToProposalWriting(testCtx)
    await ensurePanelOpen(testCtx)

    const card = testCtx.window.locator(`[data-annotation-id="${created.id}"]`)
    await expect(card).toBeVisible({ timeout: 5_000 })

    // Record the pending badge count before accept
    const pendingTab = testCtx.window.getByTestId('status-filter-pending')
    const pendingCountBefore = await pendingTab.locator('span').last().innerText()
    const countBefore = Number(pendingCountBefore)

    // Click accept — card leaves the "pending" filtered view
    await card.getByTestId('annotation-action-accept').click()

    // Pending count should drop by 1
    await expect(pendingTab.locator('span').last()).toHaveText(String(countBefore - 1), {
      timeout: 5_000,
    })

    // Switch to "processed" tab to find the accepted card
    await testCtx.window.getByTestId('status-filter-processed').click()

    const acceptedCard = testCtx.window.locator(`[data-annotation-id="${created.id}"]`)
    await expect(acceptedCard).toBeVisible({ timeout: 5_000 })

    // Card should now show status label and reduced opacity
    await expect(acceptedCard.getByTestId('annotation-status-label')).toBeVisible({
      timeout: 5_000,
    })
    await expect(acceptedCard.getByTestId('annotation-status-label')).toContainText('已采纳')

    // Verify opacity reduced
    const opacity = await acceptedCard.evaluate((el) => el.style.opacity)
    expect(opacity).toBe('0.6')

    // Action buttons should be hidden
    await expect(acceptedCard.getByTestId('annotation-action-accept')).toHaveCount(0)
  })

  test('keyboard navigation Alt+Arrow cycles through cards', async () => {
    const testCtx = getContext()

    // Create multiple annotations
    await createAnnotation(testCtx, { type: 'ai-suggestion', content: 'Nav card A' })
    await createAnnotation(testCtx, { type: 'score-warning', content: 'Nav card B' })

    await refreshAnnotations(testCtx)
    await navigateToProposalWriting(testCtx)
    await ensurePanelOpen(testCtx)

    const cards = testCtx.window.getByTestId('annotation-card')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const getOutline = (
      cardIndex: number
    ): Promise<{ color: string; style: string; width: string }> =>
      cards.nth(cardIndex).evaluate((el) => {
        const style = window.getComputedStyle(el)
        return {
          color: style.outlineColor,
          style: style.outlineStyle,
          width: style.outlineWidth,
        }
      })
    const expectedFocusColor = 'rgb(22, 119, 255)'

    // First card should be focused by default
    const firstOutline = await getOutline(0)
    expect(firstOutline.width).toBe('2px')
    expect(firstOutline.style).toBe('solid')
    expect(firstOutline.color).toBe(expectedFocusColor)

    // Press Alt+ArrowDown to move to next
    await testCtx.window.keyboard.press('Alt+ArrowDown')

    // Second card should now be focused
    const secondOutline = await getOutline(1)
    expect(secondOutline.width).toBe('2px')
    expect(secondOutline.style).toBe('solid')
    expect(secondOutline.color).toBe(expectedFocusColor)
  })
})
