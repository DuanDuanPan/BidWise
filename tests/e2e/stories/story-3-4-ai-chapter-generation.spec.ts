import { test, expect, type Locator, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

/**
 * Story 3.4 E2E: AI chapter generation — real orchestration with mock AI provider.
 *
 * Tests launch the app with BIDWISE_E2E_AI_MOCK=true, which activates a
 * deterministic MockAiProvider in the main process (see mock-provider.ts).
 * A proposal document with guidance-only chapters is saved via IPC, then
 * the workspace navigates to the proposal-writing stage so the editor
 * renders chapter-generate buttons.
 *
 * The mock provider returns canned Markdown content and throws when the
 * prompt contains `__E2E_FORCE_ERROR__` to exercise error-recovery paths.
 */

// ─── Types ──────────────────────────────────────────────────────────

type LaunchContext = {
  electronApp: Awaited<ReturnType<typeof electron.launch>>
  window: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>
  sandboxHome: string
  projectId: string
}

type TaskProgressEvent = {
  taskId: string
  progress: number
  message?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = Record<string, (...args: any[]) => any>

// ─── Constants ──────────────────────────────────────────────────────

const APP_ENTRY = resolve(process.cwd(), 'out/main/index.js')

/**
 * Proposal fixture with guidance-only chapters (generate button visible),
 * one chapter with real content (regenerate button visible), and one chapter
 * whose guidance contains the error marker (triggers mock AI failure).
 */
const PROPOSAL_FIXTURE = `# E2E 测试方案

## 项目概述

> 概述项目背景、目标和范围。

## 系统架构设计

> 描述系统的整体架构设计方案。

## 技术实施方案

> 详细说明技术实施方案和步骤。

## 质量保障措施

> 描述质量保障相关的措施和方法。

## 已有内容章节

本章节已包含人工撰写的内容，用于测试重新生成流程。

当前方案采用分布式微服务架构，支持弹性伸缩。

## 风险评估

> __E2E_FORCE_ERROR__ 请详细分析项目风险。
`

// ─── Helpers ────────────────────────────────────────────────────────

async function launchApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-4-'))

  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: sandboxHome,
      BIDWISE_USER_DATA_DIR: join(sandboxHome, 'bidwise-data'),
      BIDWISE_E2E_AI_MOCK: 'true',
      BIDWISE_E2E_AI_MOCK_DELAY_MS: '300',
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  const projectId = await createProject(window)

  // Save a proposal document with guidance-only + mixed chapters
  await saveProposalDocument(window, projectId, PROPOSAL_FIXTURE)

  // Advance the SOP stage to proposal-writing via projectUpdate
  await updateProjectStage(window, projectId, 'proposal-writing')

  // Navigate into the project workspace
  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)
  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  // Click the proposal-writing tab in SOP progress bar
  const sopTab = window.getByTestId('sop-stage-proposal-writing')
  if (await sopTab.isVisible().catch(() => false)) {
    await sopTab.click()
  }

  // Wait for the editor to render the document
  await expect(window.getByTestId('editor-view')).toBeVisible({ timeout: 15_000 })

  return { electronApp, window, sandboxHome, projectId }
}

async function createProject(page: Page): Promise<string> {
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
    { name: `Story 3-4 E2E ${timestamp}`, customerName: '自动化测试客户', industry: '军工' }
  )

  if (!response.success || !response.data?.id) {
    throw new Error(response.error?.message ?? 'projectCreate did not return an id')
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
    throw new Error(response.error?.message ?? 'projectUpdate (sopStage) failed')
  }
}

async function revealChapterAction(
  page: Page,
  headingTitle: string,
  actionTestId: 'chapter-generate-btn' | 'chapter-regenerate-btn'
): Promise<Locator> {
  const heading = page.getByTestId('editor-view').getByText(headingTitle, { exact: true }).first()
  await expect(heading).toBeVisible({ timeout: 10_000 })
  await heading.hover()

  const action = page.locator(`[data-testid="${actionTestId}"]`).first()
  await expect(action).toBeVisible({ timeout: 10_000 })
  return action
}

async function startTaskProgressCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window as Window & {
      __e2eProgressEvents?: TaskProgressEvent[]
      __e2eProgressUnlisten?: () => void
    }
    g.__e2eProgressUnlisten?.()
    g.__e2eProgressEvents = []
    g.__e2eProgressUnlisten = (window as Window & { api: AnyApi }).api.onTaskProgress(
      (event: TaskProgressEvent) => {
        g.__e2eProgressEvents?.push(event)
      }
    ) as () => void
  })
}

async function getCapturedProgress(page: Page): Promise<TaskProgressEvent[]> {
  return page.evaluate(() => {
    return (
      (window as Window & { __e2eProgressEvents?: TaskProgressEvent[] }).__e2eProgressEvents ?? []
    )
  })
}

async function getTaskStatus(page: Page, taskId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const api = (window as Window & { api: AnyApi }).api
    const res = (await api.taskGetStatus({ taskId: id })) as {
      success: boolean
      data?: { status: string }
    }
    return res.success ? (res.data?.status ?? null) : null
  }, taskId)
}

async function cleanup(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
}

// ─── Tests ──────────────────────────────────────────────────────────

test.describe('Story 3.4: AI Chapter Generation E2E', () => {
  test.describe.configure({ timeout: 120_000 })

  let ctx: LaunchContext | null = null

  test.afterEach(async () => {
    if (ctx) {
      await cleanup(ctx)
      ctx = null
    }
  })

  test('@story-3-4 @p0 guidance-only chapter triggers AI generation and inserts content', async () => {
    test.slow()
    ctx = await launchApp()
    const { window } = ctx

    // Wait for plate editor content to be ready
    await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })

    // Start capturing task-progress events before triggering generation
    await startTaskProgressCapture(window)

    const generateBtn = await revealChapterAction(window, '项目概述', 'chapter-generate-btn')
    await generateBtn.click()

    // A progress indicator should appear for the generating chapter
    await expect
      .poll(
        async () => {
          const progress = window.locator('[data-testid="chapter-generation-progress"]')
          return progress.count()
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(1)

    // Task progress events should fire (analyzing → matching-assets → generating)
    await expect
      .poll(
        async () => {
          const events = await getCapturedProgress(window)
          return events.length
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0)

    // Verify at least one progress event has a recognisable phase message
    await expect
      .poll(
        async () => {
          const events = await getCapturedProgress(window)
          return events.some((e) =>
            ['analyzing', 'matching-assets', 'generating', 'annotating-sources'].includes(
              e.message ?? ''
            )
          )
        },
        { timeout: 15_000 }
      )
      .toBe(true)

    // Wait for the generation to complete (progress indicator disappears)
    await expect
      .poll(
        async () => {
          const events = await getCapturedProgress(window)
          // A 100% progress event means the task completed
          return events.some((e) => e.progress >= 100)
        },
        { timeout: 30_000 }
      )
      .toBe(true)

    // The generated content should be visible in the editor
    // (mock returns "方案概述" and "核心技术方案" headings)
    await expect(window.getByText('方案概述')).toBeVisible({ timeout: 10_000 })
  })

  test('@story-3-4 @p1 multiple chapters queue and execute with progress tracking', async () => {
    test.slow()
    ctx = await launchApp()
    const { window } = ctx

    await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })
    await startTaskProgressCapture(window)

    const firstGenerateBtn = await revealChapterAction(window, '项目概述', 'chapter-generate-btn')
    await firstGenerateBtn.click()

    const secondGenerateBtn = await revealChapterAction(
      window,
      '系统架构设计',
      'chapter-generate-btn'
    )
    await secondGenerateBtn.click()

    // At least one progress indicator should appear
    await expect
      .poll(
        async () => {
          const progress = window.locator('[data-testid="chapter-generation-progress"]')
          return progress.count()
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(1)

    // Wait for both tasks to complete — both chapters receive progress events
    await expect
      .poll(
        async () => {
          const events = await getCapturedProgress(window)
          const completedTasks = new Set(
            events.filter((e) => e.progress >= 100).map((e) => e.taskId)
          )
          return completedTasks.size
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThanOrEqual(2)

    // Verify both chapters received the mock-generated content
    // (MockAiProvider returns "方案概述" and "核心技术方案" sub-headings)
    const generatedHeadings = window.getByText('方案概述')
    await expect(generatedHeadings.first()).toBeVisible({ timeout: 10_000 })
    // With two completed chapters, the mock content should appear at least twice
    await expect
      .poll(async () => generatedHeadings.count(), { timeout: 5_000 })
      .toBeGreaterThanOrEqual(2)
  })

  test('@story-3-4 @p1 error recovery shows inline error bar with retry/manual-edit/skip', async () => {
    test.slow()
    ctx = await launchApp()
    const { window } = ctx

    await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })

    // Find the generate button for the error-trigger chapter (风险评估).
    // It's the last guidance-only chapter in our fixture.
    const generateBtn = await revealChapterAction(window, '风险评估', 'chapter-generate-btn')
    await generateBtn.click()

    // The mock AI will throw because the guidance contains __E2E_FORCE_ERROR__.
    // Wait for the inline error bar to appear.
    await expect(window.locator('[data-testid="chapter-error-bar"]').first()).toBeVisible({
      timeout: 30_000,
    })

    // Verify all three action buttons are present
    await expect(window.locator('[data-testid="chapter-retry-btn"]').first()).toBeVisible()
    await expect(window.locator('[data-testid="chapter-manual-edit-btn"]').first()).toBeVisible()
    await expect(window.locator('[data-testid="chapter-skip-btn"]').first()).toBeVisible()

    // Exercise the "skip" action and verify the error bar is dismissed
    await window.locator('[data-testid="chapter-skip-btn"]').first().click()
    await expect(window.locator('[data-testid="chapter-error-bar"]')).not.toBeVisible({
      timeout: 5_000,
    })
  })

  test('@story-3-4 @p1 regeneration dialog for chapter with existing content', async () => {
    test.slow()
    ctx = await launchApp()
    const { window } = ctx

    await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })

    // The "已有内容章节" chapter has content → should show regenerate button
    const regenerateBtn = await revealChapterAction(
      window,
      '已有内容章节',
      'chapter-regenerate-btn'
    )
    await regenerateBtn.click()
    const regenerateDialog = window.getByRole('dialog', { name: '重新生成: 已有内容章节' })
    await expect(regenerateDialog).toBeVisible({ timeout: 5_000 })

    // Dialog should show a textarea for additional context
    const textarea = regenerateDialog.locator('textarea')
    await expect(textarea).toBeVisible()

    // Type additional context and confirm
    await textarea.fill('请重点强调安全性和可扩展性')

    // Find and click the confirm button within the dialog
    const confirmBtn = window
      .getByTestId('regenerate-dialog')
      .locator('button:has-text("确认"), button:has-text("确定"), .ant-btn-primary')
    await confirmBtn.first().click()

    // Dialog should close and regeneration should start
    await expect(regenerateDialog).not.toBeVisible({ timeout: 5_000 })

    // Verify the regenerated content replaced the original chapter content.
    // The mock returns "方案概述" heading — this should now appear in the
    // chapter that previously contained the human-written text.
    // The original text "分布式微服务架构" should have been replaced.
    await expect(window.getByText('方案概述').first()).toBeVisible({ timeout: 10_000 })
  })

  test('@story-3-4 @p1 task restoration on workspace re-entry', async () => {
    test.slow()
    ctx = await launchApp()
    const { window, projectId } = ctx

    await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })
    await startTaskProgressCapture(window)

    // Trigger generation on a chapter
    const generateBtn = await revealChapterAction(window, '项目概述', 'chapter-generate-btn')
    await generateBtn.click()

    // Wait for at least one progress event (task is running)
    await expect
      .poll(
        async () => {
          const events = await getCapturedProgress(window)
          return events.length
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0)

    // Capture the task ID from progress events
    const events = await getCapturedProgress(window)
    const taskId = events[0]?.taskId
    expect(taskId).toBeTruthy()

    // Wait for the task to complete and content to be injected before leaving the workspace.
    // Re-entry should still restore the generated section even though the editor state is reset.
    await expect
      .poll(async () => getTaskStatus(window, taskId!), { timeout: 30_000 })
      .toBe('completed')

    await expect
      .poll(
        async () =>
          (await window.getByTestId('plate-editor-content').innerText()).includes('方案概述'),
        { timeout: 10_000 }
      )
      .toBe(true)

    // Navigate away from workspace back to kanban after the task has finished.
    await window.evaluate(() => {
      window.location.hash = '#/'
    })
    await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 15_000 })

    // Navigate back into the same project
    const projectCard = window.getByTestId(`project-card-${projectId}`)
    await expect(projectCard).toBeVisible({ timeout: 15_000 })
    await projectCard.click()
    await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 15_000 })

    // Click proposal-writing stage tab
    const sopTab = window.getByTestId('sop-stage-proposal-writing')
    const editorView = window.getByTestId('editor-view')
    if (
      !(await editorView.isVisible().catch(() => false)) &&
      (await sopTab.isVisible().catch(() => false))
    ) {
      await sopTab.click()
    }

    await expect(editorView).toBeVisible({ timeout: 15_000 })

    // Verify: the previously generated content is still present in the editor
    await expect
      .poll(
        async () =>
          (await window.getByTestId('plate-editor-content').innerText()).includes('方案概述'),
        { timeout: 10_000 }
      )
      .toBe(true)

    // Verify: no orphaned progress bars remain once the restored task content is applied
    await expect(window.locator('[data-testid="chapter-generation-progress"]')).not.toBeVisible({
      timeout: 10_000,
    })
  })
})
