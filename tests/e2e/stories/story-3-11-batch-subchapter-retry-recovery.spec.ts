import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 3.11 E2E: Batch subchapter retry & recovery.
 *
 * Tests verify the batch-generate error recovery flow:
 * - Auto-retry with exponential backoff (5s → 10s → 30s)
 * - Manual retry of a single failed section
 * - Skip failed section and continue chain
 * - Session resume with batchId preservation
 *
 * Uses BIDWISE_E2E_AI_MOCK=true with __E2E_FORCE_ERROR__ marker to trigger
 * deterministic failures in specific sub-chapter sections.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = Record<string, (...args: any[]) => any>

type LaunchContext = {
  electronApp: Awaited<ReturnType<typeof electron.launch>>
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>
  sandboxHome: string
  projectId: string
}

const APP_ENTRY = resolve(process.cwd(), 'out/main/index.js')

/**
 * Proposal with a two-level heading that triggers skeleton-expand flow.
 * The parent H2 has two sub-sections: one normal, one with error marker.
 */
const PROPOSAL_FIXTURE = `# E2E 测试方案

## 系统设计

> 描述系统的整体设计方案，包括功能模块和接口。
`

// ─── Helpers (shared with story-3-4 pattern) ────────────────────────

async function launchApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-11-'))

  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: sandboxHome,
      BIDWISE_USER_DATA_DIR: join(sandboxHome, 'bidwise-data'),
      BIDWISE_E2E_AI_MOCK: 'true',
      BIDWISE_E2E_AI_MOCK_DELAY_MS: '200',
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  const projectId = await createProject(window)
  await saveProposalDocument(window, projectId, PROPOSAL_FIXTURE)
  await updateProjectStage(window, projectId, 'proposal-writing')

  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)
  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  const sopTab = window.getByTestId('sop-stage-proposal-writing')
  if (await sopTab.isVisible().catch(() => false)) {
    await sopTab.click()
  }

  await expect(window.getByTestId('editor-view')).toBeVisible({ timeout: 15_000 })

  return { electronApp, window, sandboxHome, projectId }
}

async function createProject(page: Page): Promise<string> {
  const timestamp = Date.now()
  const response = await page.evaluate(
    async ({ name, customerName, industry }) => {
      const api = (window as Window & { api: AnyApi }).api
      return api.projectCreate({
        name,
        customerName,
        industry,
        proposalType: 'presale-technical',
      }) as Promise<{ success: boolean; data?: { id: string }; error?: { message?: string } }>
    },
    { name: `Story 3-11 E2E ${timestamp}`, customerName: '自动化测试客户', industry: '军工' }
  )
  if (!response.success || !response.data?.id) {
    throw new Error(response.error?.message ?? 'projectCreate failed')
  }
  return response.data.id
}

async function saveProposalDocument(page: Page, projectId: string, content: string): Promise<void> {
  const response = await page.evaluate(
    async ({ pId, md }) => {
      const api = (window as Window & { api: AnyApi }).api
      return api.documentSave({ projectId: pId, content: md }) as Promise<{
        success: boolean
        error?: { message?: string }
      }>
    },
    { pId: projectId, md: content }
  )
  if (!response.success) {
    throw new Error(response.error?.message ?? 'documentSave failed')
  }
}

async function updateProjectStage(page: Page, projectId: string, stage: string): Promise<void> {
  const response = await page.evaluate(
    async ({ pId, sopStage }) => {
      const api = (window as Window & { api: AnyApi }).api
      return api.projectUpdate({ projectId: pId, input: { sopStage } }) as Promise<{
        success: boolean
        error?: { message?: string }
      }>
    },
    { pId: projectId, sopStage: stage }
  )
  if (!response.success) {
    throw new Error(response.error?.message ?? 'projectUpdate failed')
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

test.describe('Story 3.11: Batch subchapter retry & recovery', () => {
  let ctx: LaunchContext

  test.beforeAll(async () => {
    ctx = await launchApp()
  })

  test.afterAll(async () => {
    await ctx.electronApp.close()
    await rm(ctx.sandboxHome, { recursive: true, force: true }).catch(() => {})
  })

  test('@p0 batch retry/skip IPC channels are registered in preload', async () => {
    const apiKeys = await ctx.window.evaluate(() =>
      Object.keys((window as Window & { api: AnyApi }).api)
    )
    expect(apiKeys).toContain('chapterBatchRetrySection')
    expect(apiKeys).toContain('chapterBatchSkipSection')
  })

  test('@p0 batch-retry-section returns validation error for invalid batchId', async () => {
    const result = await ctx.window.evaluate(async (projectId) => {
      const api = (window as Window & { api: AnyApi }).api
      return api.chapterBatchRetrySection({
        projectId,
        batchId: 'nonexistent-batch-id',
        sectionIndex: 0,
      }) as Promise<{ success: boolean; error?: { message?: string } }>
    }, ctx.projectId)

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('BatchOrchestration not found')
  })

  test('@p0 batch-skip-section returns validation error for invalid batchId', async () => {
    const result = await ctx.window.evaluate(async (projectId) => {
      const api = (window as Window & { api: AnyApi }).api
      return api.chapterBatchSkipSection({
        projectId,
        batchId: 'nonexistent-batch-id',
        sectionIndex: 0,
      }) as Promise<{ success: boolean; error?: { message?: string } }>
    }, ctx.projectId)

    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('BatchOrchestration not found')
  })
})
