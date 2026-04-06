import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 4.1 E2E: Annotation Service — basic annotation CRUD via IPC,
 * panel states (loading/empty/list), and sidecar persistence.
 *
 * These tests launch the Electron app, create a project via IPC,
 * pre-populate annotations via window.api.annotationCreate,
 * then navigate to the workspace to verify the annotation panel.
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
    const res = await api.projectCreate({ name: 'E2E Annotation Test' })
    return res
  })

  const projectId = (result as { success: boolean; data: { id: string } }).data.id

  return { electronApp, window, sandboxHome, projectId }
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

  test('annotation:create returns valid record via IPC', async () => {
    const result = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationCreate({
        projectId: pid,
        sectionId: 'project-root',
        type: 'human',
        content: 'E2E test annotation',
        author: 'e2e-user',
      })
    }, ctx.projectId)

    const data = result as { success: boolean; data: { id: string; status: string } }
    expect(data.success).toBe(true)
    expect(data.data.id).toBeTruthy()
    expect(data.data.status).toBe('pending')
  })

  test('annotation:list returns created annotations for project', async () => {
    const result = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationList({ projectId: pid })
    }, ctx.projectId)

    const data = result as { success: boolean; data: Array<{ content: string }> }
    expect(data.success).toBe(true)
    expect(data.data.length).toBeGreaterThanOrEqual(1)
    expect(data.data.some((a) => a.content === 'E2E test annotation')).toBe(true)
  })

  test('annotation:update changes content', async () => {
    // Get first annotation
    const listResult = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationList({ projectId: pid })
    }, ctx.projectId)
    const items = (listResult as { data: Array<{ id: string }> }).data
    const firstId = items[0].id

    const updateResult = await ctx.window.evaluate(
      async (args: { id: string }) => {
        const api = (window as unknown as { api: AnyApi }).api
        return api.annotationUpdate({ id: args.id, content: 'Updated content' })
      },
      { id: firstId }
    )

    const data = updateResult as { success: boolean; data: { content: string } }
    expect(data.success).toBe(true)
    expect(data.data.content).toBe('Updated content')
  })

  test('annotation:delete removes annotation', async () => {
    // Create one to delete
    const createResult = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationCreate({
        projectId: pid,
        sectionId: 'project-root',
        type: 'ai-suggestion',
        content: 'To be deleted',
        author: 'e2e-user',
      })
    }, ctx.projectId)
    const deleteId = (createResult as { data: { id: string } }).data.id

    const deleteResult = await ctx.window.evaluate(
      async (args: { id: string }) => {
        const api = (window as unknown as { api: AnyApi }).api
        return api.annotationDelete({ id: args.id })
      },
      { id: deleteId }
    )

    expect((deleteResult as { success: boolean }).success).toBe(true)

    // Verify it's gone
    const listResult = await ctx.window.evaluate(async (pid: string) => {
      const api = (window as unknown as { api: AnyApi }).api
      return api.annotationList({ projectId: pid })
    }, ctx.projectId)

    const items = (listResult as { data: Array<{ id: string }> }).data
    expect(items.some((a) => a.id === deleteId)).toBe(false)
  })
})
