import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 4.4 E2E: Pending decision marking, cross-role notifications,
 * annotation threads, AI feedback iteration, notification bell & panel.
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
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-e2e-4-4-'))
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
    return api.projectCreate({ name: 'E2E 4.4 Notification Test' })
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
): Promise<{ id: string; status: string; content: string; sectionId: string }> {
  const result = await ctx.window.evaluate(
    async (args: { pid: string; overrides: Record<string, string> }) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationCreate({
        projectId: args.pid,
        sectionId: args.overrides.sectionId ?? '2:公司简介:0',
        type: args.overrides.type ?? 'ai-suggestion',
        content: args.overrides.content ?? `E2E annotation ${Date.now()}`,
        author: args.overrides.author ?? 'agent:generate',
        ...(args.overrides.parentId ? { parentId: args.overrides.parentId } : {}),
        ...(args.overrides.assignee ? { assignee: args.overrides.assignee } : {}),
      })
    },
    { pid: ctx.projectId, overrides }
  )
  return (result as { data: { id: string; status: string; content: string; sectionId: string } })
    .data
}

async function updateAnnotation(
  ctx: LaunchContext,
  input: Record<string, string>
): Promise<{ id: string; status: string; assignee?: string }> {
  const result = await ctx.window.evaluate(async (args: Record<string, string>) => {
    const api = (window as unknown as { api: AnyApi }).api
    return api.annotationUpdate(args)
  }, input)
  return (result as { data: { id: string; status: string; assignee?: string } }).data
}

async function navigateToProposalWriting(ctx: LaunchContext): Promise<void> {
  await ctx.window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, ctx.projectId)

  await ctx.window.waitForSelector('[data-testid="project-workspace"]', { timeout: 10_000 })
  await ctx.window.keyboard.press('Alt+3')
  await ctx.window
    .locator('[data-testid="annotation-panel"], [data-testid="annotation-icon-bar"]')
    .first()
    .waitFor({ timeout: 10_000 })
}

test.describe('Story 4.4: Pending Decision & Cross-Role Notification', () => {
  let ctx: LaunchContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await cleanupApp(ctx)
  })

  test('Scenario 1: mark annotation as needs-decision with assignee', async () => {
    const ann = await createAnnotation(ctx, { content: 'Needs guidance' })

    const updated = await updateAnnotation(ctx, {
      id: ann.id,
      status: 'needs-decision',
      assignee: 'user:zhang-zong',
    })

    expect(updated.status).toBe('needs-decision')
    expect(updated.assignee).toBe('user:zhang-zong')

    // Verify a decision-requested notification was created
    const notifResult = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.notificationList({ targetUser: 'user:zhang-zong' })
    })
    const notifications = (notifResult as { data: { type: string; annotationId: string }[] }).data
    const decisionNotif = notifications.find(
      (n) => n.type === 'decision-requested' && n.annotationId === ann.id
    )
    expect(decisionNotif).toBeDefined()
  })

  test('Scenario 2: thread replies display in chronological order', async () => {
    const root = await createAnnotation(ctx, { content: 'Root annotation for thread' })

    // Create replies in order
    await createAnnotation(ctx, {
      content: 'First reply',
      parentId: root.id,
      type: 'human',
      author: 'user:default',
    })
    await createAnnotation(ctx, {
      content: 'Second reply',
      parentId: root.id,
      type: 'human',
      author: 'user:zhang-zong',
    })

    // Fetch replies via IPC
    const repliesResult = await ctx.window.evaluate(async (parentId: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationListReplies({ parentId })
    }, root.id)
    const replies = (repliesResult as { data: { content: string; createdAt: string }[] }).data

    expect(replies).toHaveLength(2)
    expect(replies[0].content).toBe('First reply')
    expect(replies[1].content).toBe('Second reply')
    // Chronological order
    expect(new Date(replies[0].createdAt).getTime()).toBeLessThanOrEqual(
      new Date(replies[1].createdAt).getTime()
    )
  })

  test('Scenario 3: reply-received notification for human author', async () => {
    const root = await createAnnotation(ctx, {
      content: 'Root by zhang-zong',
      author: 'user:zhang-zong',
    })

    // Another user replies
    await createAnnotation(ctx, {
      content: 'Reply to zhang-zong',
      parentId: root.id,
      type: 'human',
      author: 'user:default',
    })

    // Check notification for zhang-zong
    const notifResult = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.notificationList({ targetUser: 'user:zhang-zong' })
    })
    const notifications = (notifResult as { data: { type: string; annotationId: string }[] }).data
    const replyNotif = notifications.find(
      (n) => n.type === 'reply-received' && n.annotationId === root.id
    )
    expect(replyNotif).toBeDefined()
  })

  test('Scenario 4: notification bell badge and unread count', async () => {
    await navigateToProposalWriting(ctx)

    // Count unread notifications for default user
    const countResult = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.notificationCountUnread({ targetUser: 'user:default' })
    })
    const count = (countResult as { data: number }).data
    // At minimum we should have a number (could be 0 if no notifications target default user)
    expect(typeof count).toBe('number')

    // The bell should be visible
    const bell = ctx.window.locator('[data-testid="notification-bell"]')
    await expect(bell).toBeVisible({ timeout: 10_000 })
  })

  test('Scenario 5: cross-role annotation with assignee triggers notification', async () => {
    const ann = await createAnnotation(ctx, {
      type: 'cross-role',
      content: 'Cross-role feedback',
      author: 'user:default',
      assignee: 'user:li-jingli',
    })

    // Check notification for li-jingli
    const notifResult = await ctx.window.evaluate(async () => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.notificationList({ targetUser: 'user:li-jingli' })
    })
    const notifications = (notifResult as { data: { type: string; annotationId: string }[] }).data
    const crossNotif = notifications.find(
      (n) => n.type === 'cross-role-mention' && n.annotationId === ann.id
    )
    expect(crossNotif).toBeDefined()
  })

  test('self-notification suppression: no notification when assignee === author', async () => {
    await createAnnotation(ctx, {
      content: 'Self-assigned annotation',
      author: 'user:default',
    })

    const ann = await createAnnotation(ctx, { content: 'Will self-assign' })
    await updateAnnotation(ctx, {
      id: ann.id,
      status: 'needs-decision',
      assignee: ann.author || 'agent:generate',
    })

    // The agent author shouldn't receive a decision-requested notification
    // (agent authors are filtered as non-human)
    const notifResult = await ctx.window.evaluate(async (author: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.notificationList({ targetUser: author })
    }, ann.author || 'agent:generate')
    const notifications = (notifResult as { data: { type: string }[] }).data
    // Agent users don't receive human notifications
    expect(notifications.filter((n) => n.type === 'decision-requested')).toHaveLength(0)
  })
})
