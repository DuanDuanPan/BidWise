import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 4.1 E2E: Annotation Service — IPC CRUD, panel states
 * (loading/empty/list), pending pill, and sidecar persistence.
 *
 * Each test creates its own data to avoid order-dependency.
 * The shared Electron app and project are used for performance,
 * but no test relies on mutations from another test.
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
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-e2e-4-1-'))
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      ELECTRON_IS_DEV: '0',
      BIDWISE_E2E: 'true',
      BIDWISE_E2E_ANNOTATION_LIST_DELAY_MS: '400',
      HOME: sandboxHome,
      APPDATA: sandboxHome,
      XDG_CONFIG_HOME: sandboxHome,
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  // Create a project
  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: AnyApi }).api
    return api.projectCreate({ name: 'E2E Annotation Test' })
  })

  const projectId = (result as { success: boolean; data: { id: string } }).data.id

  return { electronApp, window, sandboxHome, projectId }
}

/** Helper: create an annotation via IPC and return the record */
async function createAnnotation(
  ctx: LaunchContext,
  overrides: Record<string, string> = {},
  projectId = ctx.projectId
): Promise<{ id: string; status: string; content: string; projectId: string }> {
  const result = await ctx.window.evaluate(
    async (args: { pid: string; overrides: Record<string, string> }) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationCreate({
        projectId: args.pid,
        sectionId: args.overrides.sectionId ?? 'project-root',
        type: args.overrides.type ?? 'human',
        content: args.overrides.content ?? `E2E annotation ${Date.now()}`,
        author: args.overrides.author ?? 'e2e-user',
      })
    },
    { pid: projectId, overrides }
  )

  const data = result as {
    success: boolean
    data: { id: string; status: string; content: string; projectId: string }
  }
  return data.data
}

/** Helper: navigate to project workspace and enter proposal-writing stage */
async function navigateToProposalWriting(
  ctx: LaunchContext,
  projectId = ctx.projectId
): Promise<void> {
  await ctx.window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)
  await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  // Click proposal-writing stage in SOP bar
  const sopTab = ctx.window.getByTestId('sop-stage-proposal-writing')
  if (await sopTab.isVisible().catch(() => false)) {
    await sopTab.click()
  }
}

async function setAnnotationListFailure(ctx: LaunchContext, message: string | null): Promise<void> {
  await ctx.electronApp.evaluate((_electron, value) => {
    if (value === null) {
      delete process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE
      return
    }
    process.env.BIDWISE_E2E_ANNOTATION_LIST_FAIL_MESSAGE = value
  }, message)
}

test.describe('Story 4.1 Annotation Service E2E', () => {
  let ctx: LaunchContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await ctx.electronApp.close()
    await rm(ctx.sandboxHome, { recursive: true, force: true })
  })

  // --- IPC CRUD (self-contained) ---

  test('annotation:create returns valid record via IPC', async () => {
    const record = await createAnnotation(ctx, { content: 'Create test annotation' })
    expect(record.id).toBeTruthy()
    expect(record.status).toBe('pending')
    expect(record.content).toBe('Create test annotation')
  })

  test('annotation:list returns annotations for project', async () => {
    // Create own data
    await createAnnotation(ctx, { content: 'List test A' })
    await createAnnotation(ctx, { content: 'List test B' })

    const result = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationList({ projectId: pid })
    }, ctx.projectId)

    const data = result as { success: boolean; data: Array<{ content: string }> }
    expect(data.success).toBe(true)
    expect(data.data.length).toBeGreaterThanOrEqual(2)
    expect(data.data.some((a) => a.content === 'List test A')).toBe(true)
    expect(data.data.some((a) => a.content === 'List test B')).toBe(true)
  })

  test('annotation:update changes content', async () => {
    // Create own annotation to update
    const created = await createAnnotation(ctx, { content: 'Before update' })

    const updateResult = await ctx.window.evaluate(
      async (args: { id: string }) => {
        const api = (window as unknown as { api: AnyApi }).api
        return api.annotationUpdate({ id: args.id, content: 'After update' })
      },
      { id: created.id }
    )

    const data = updateResult as { success: boolean; data: { content: string } }
    expect(data.success).toBe(true)
    expect(data.data.content).toBe('After update')
  })

  test('annotation:delete removes annotation', async () => {
    // Create own annotation to delete
    const created = await createAnnotation(ctx, { content: 'To be deleted' })

    const deleteResult = await ctx.window.evaluate(
      async (args: { id: string }) => {
        const api = (window as unknown as { api: AnyApi }).api
        return api.annotationDelete({ id: args.id })
      },
      { id: created.id }
    )

    expect((deleteResult as { success: boolean }).success).toBe(true)

    // Verify it's gone
    const listResult = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationList({ projectId: pid })
    }, ctx.projectId)

    const items = (listResult as { data: Array<{ id: string }> }).data
    expect(items.some((a) => a.id === created.id)).toBe(false)
  })

  // --- Sidecar persistence (AC 4) ---

  test('sidecar proposal.meta.json.annotations mirrors SQLite after create', async () => {
    const created = await createAnnotation(ctx, { content: 'Sidecar verification' })

    const metaResult = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.documentGetMetadata({ projectId: pid })
    }, ctx.projectId)

    const meta = metaResult as {
      success: boolean
      data: { annotations: Array<{ id: string; content: string }> }
    }
    expect(meta.success).toBe(true)
    expect(meta.data.annotations.some((a) => a.id === created.id)).toBe(true)
    expect(meta.data.annotations.some((a) => a.content === 'Sidecar verification')).toBe(true)
  })

  // --- Panel states (AC 8, AC 10) ---

  test('annotation panel shows loading skeleton and spinner before list state with annotations', async () => {
    // Ensure at least one annotation exists for the project
    await createAnnotation(ctx, { content: 'Panel list test' })

    await navigateToProposalWriting(ctx)

    // Wait for annotation panel to appear (expanded or compact flyout)
    const panel = ctx.window
      .getByTestId('annotation-panel')
      .or(ctx.window.getByTestId('annotation-icon-bar'))
    await expect(panel).toBeVisible({ timeout: 15_000 })

    // If compact mode, open flyout
    const iconButton = ctx.window.getByTestId('annotation-icon-button')
    if (await iconButton.isVisible().catch(() => false)) {
      await iconButton.click()
      await expect(ctx.window.getByTestId('annotation-flyout')).toBeVisible({ timeout: 5_000 })
    }

    await expect(ctx.window.getByTestId('annotation-loading')).toBeVisible({ timeout: 5_000 })
    await expect(ctx.window.getByTestId('annotation-header-spinner')).toBeVisible({
      timeout: 5_000,
    })

    // Should eventually show annotation list (after loading completes)
    await expect(ctx.window.getByTestId('annotation-list')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.window.getByTestId('annotation-loading')).toHaveCount(0)
    await expect(ctx.window.getByTestId('annotation-header-spinner')).toHaveCount(0)

    // Verify items are rendered
    const items = ctx.window.getByTestId('annotation-item')
    await expect(items.first()).toBeVisible()
  })

  test('annotation panel shows error state and can recover after annotation:list failure', async () => {
    const newProject = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.projectCreate({ name: 'E2E Annotation Failure Project' })
    })
    const failureProjectId = (newProject as { data: { id: string } }).data.id

    await createAnnotation(ctx, { content: 'Failure recovery annotation' }, failureProjectId)

    try {
      await setAnnotationListFailure(ctx, 'forced annotation list failure')
      await navigateToProposalWriting(ctx, failureProjectId)

      const panel = ctx.window
        .getByTestId('annotation-panel')
        .or(ctx.window.getByTestId('annotation-icon-bar'))
      await expect(panel).toBeVisible({ timeout: 15_000 })

      const iconButton = ctx.window.getByTestId('annotation-icon-button')
      if (await iconButton.isVisible().catch(() => false)) {
        await iconButton.click()
        await expect(ctx.window.getByTestId('annotation-flyout')).toBeVisible({ timeout: 5_000 })
      }

      await expect(ctx.window.getByTestId('annotation-loading')).toBeVisible({ timeout: 5_000 })
      await expect(ctx.window.getByTestId('annotation-header-spinner')).toBeVisible({
        timeout: 5_000,
      })

      await expect(ctx.window.getByTestId('annotation-error')).toBeVisible({ timeout: 15_000 })
      await expect(ctx.window.getByText('forced annotation list failure')).toBeVisible()
      await expect(ctx.window.getByTestId('annotation-loading')).toHaveCount(0)
      await expect(ctx.window.getByTestId('annotation-header-spinner')).toHaveCount(0)

      await setAnnotationListFailure(ctx, null)
      await ctx.window.getByTestId('annotation-retry').click()

      await expect(ctx.window.getByTestId('annotation-list')).toBeVisible({ timeout: 15_000 })
      await expect(ctx.window.getByText('Failure recovery annotation')).toBeVisible()
      await expect(ctx.window.getByTestId('annotation-error')).toHaveCount(0)
    } finally {
      await setAnnotationListFailure(ctx, null)
    }
  })

  test('pending pill shows count of pending annotations', async () => {
    // Create a pending annotation
    await createAnnotation(ctx, { content: 'Pending pill test' })

    await navigateToProposalWriting(ctx)

    // Wait for workspace to stabilize
    const panel = ctx.window
      .getByTestId('annotation-panel')
      .or(ctx.window.getByTestId('annotation-icon-bar'))
    await expect(panel).toBeVisible({ timeout: 15_000 })

    // If compact mode, open flyout to see the pill
    const iconButton = ctx.window.getByTestId('annotation-icon-button')
    if (await iconButton.isVisible().catch(() => false)) {
      await iconButton.click()
      await expect(ctx.window.getByTestId('annotation-flyout')).toBeVisible({ timeout: 5_000 })
    }

    // Wait for annotations to load, then check pending pill
    await expect(ctx.window.getByTestId('annotation-list')).toBeVisible({ timeout: 15_000 })

    const pill = ctx.window.getByTestId('annotation-pending-pill')
    await expect(pill).toBeVisible({ timeout: 5_000 })
    const pillText = await pill.textContent()
    expect(pillText).toContain('待处理')
  })

  test('empty annotation panel shows empty state for project with no annotations', async () => {
    // Create a second project with no annotations
    const newProject = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.projectCreate({ name: 'E2E Empty Annotation Project' })
    })
    const emptyProjectId = (newProject as { data: { id: string } }).data.id

    // Navigate to the empty project
    await ctx.window.evaluate((id) => {
      window.location.hash = `#/project/${id}`
    }, emptyProjectId)
    await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

    // Click proposal-writing stage
    const sopTab = ctx.window.getByTestId('sop-stage-proposal-writing')
    if (await sopTab.isVisible().catch(() => false)) {
      await sopTab.click()
    }

    // Wait for panel
    const panel = ctx.window
      .getByTestId('annotation-panel')
      .or(ctx.window.getByTestId('annotation-icon-bar'))
    await expect(panel).toBeVisible({ timeout: 15_000 })

    // If compact mode, open flyout
    const iconButton = ctx.window.getByTestId('annotation-icon-button')
    if (await iconButton.isVisible().catch(() => false)) {
      await iconButton.click()
      await expect(ctx.window.getByTestId('annotation-flyout')).toBeVisible({ timeout: 5_000 })
    }

    // Should show empty state (no annotations exist for this project)
    await expect(ctx.window.getByTestId('annotation-empty')).toBeVisible({ timeout: 15_000 })

    // No pending pill should appear
    await expect(ctx.window.getByTestId('annotation-pending-pill')).toHaveCount(0)
  })
})
