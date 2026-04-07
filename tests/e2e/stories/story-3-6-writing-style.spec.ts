import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProposalMetadata } from '@shared/models/proposal'

type LaunchContext = {
  electronApp: ElectronApplication
  window: Page
  sandboxHome: string
  userDataPath: string
}

type SeededProject = {
  id: string
  name: string
  rootPath: string
}

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(120_000)

// ─── Helpers ───────────────────────────────────────────

async function launchStoryApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-6-'))
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: sandboxHome,
      ELECTRON_IS_DEV: '0',
      NODE_ENV: 'test',
    },
  })
  const window = await electronApp.firstWindow()
  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  return { electronApp, window, sandboxHome, userDataPath }
}

async function seedProject(ctx: LaunchContext, proposalMd: string): Promise<SeededProject> {
  const dbPath = join(ctx.userDataPath, 'data', 'bidwise.db')
  const db = new DatabaseSync(dbPath)
  const rows = db.prepare('SELECT id, name, root_path FROM projects LIMIT 1').all() as {
    id: string
    name: string
    root_path: string
  }[]
  if (rows.length === 0) throw new Error('No seeded project found')
  const project = { id: rows[0].id, name: rows[0].name, rootPath: rows[0].root_path }
  db.close()

  const projectDir = project.rootPath
  await mkdir(projectDir, { recursive: true })
  await writeFile(join(projectDir, 'proposal.md'), proposalMd, 'utf-8')

  const defaultMeta: ProposalMetadata = {
    version: '1.0',
    projectId: project.id,
    annotations: [],
    scores: [],
    sourceAttributions: [],
    baselineValidations: [],
    lastSavedAt: new Date().toISOString(),
  }
  await writeFile(join(projectDir, 'proposal.meta.json'), JSON.stringify(defaultMeta, null, 2))

  return project
}

async function navigateToEditor(window: Page, projectName: string): Promise<void> {
  // Navigate to the project
  await window.getByText(projectName).first().click()
  // Navigate to the editor/solution design stage
  await window
    .getByText(/方案设计|Solution/i)
    .first()
    .click()
  await window.waitForTimeout(1000)
}

async function teardown(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
}

// ─── E2E Tests ───────────────────────────────────────────

test.describe('@story-3-6 Writing Style Template E2E', () => {
  let ctx: LaunchContext
  let project: SeededProject

  const PROPOSAL_MD = `# 投标技术方案

## 项目概述

> 请介绍项目背景和目标

## 系统架构设计

> 请设计系统整体架构
`

  test.beforeAll(async () => {
    ctx = await launchStoryApp()
    project = await seedProject(ctx, PROPOSAL_MD)
  })

  test.afterAll(async () => {
    await teardown(ctx)
  })

  test('should display writing style selector in editor toolbar', async () => {
    await navigateToEditor(ctx.window, project.name)
    const selector = ctx.window.getByTestId('writing-style-selector')
    await expect(selector).toBeVisible({ timeout: 10_000 })
  })

  test('should default to general style', async () => {
    await navigateToEditor(ctx.window, project.name)
    const selector = ctx.window.getByTestId('writing-style-selector')
    await expect(selector).toBeVisible({ timeout: 10_000 })
    await expect(ctx.window.getByText('通用文风')).toBeVisible()
  })

  test('should persist style selection across page reload', async () => {
    await navigateToEditor(ctx.window, project.name)
    const selector = ctx.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Change to military style
    await selector.click()
    await ctx.window.getByText('军工文风').click()
    await ctx.window.waitForTimeout(500)

    // Reload page
    await ctx.window.reload()
    await ctx.window.waitForTimeout(2000)

    // Navigate back to editor
    await navigateToEditor(ctx.window, project.name)

    // Verify military style is still selected
    await expect(ctx.window.getByText('军工文风')).toBeVisible({ timeout: 10_000 })
  })

  test('should persist writingStyleId in proposal.meta.json (AC #4)', async () => {
    await navigateToEditor(ctx.window, project.name)
    const selector = ctx.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Change to government style
    await selector.click()
    await ctx.window.getByText('政企文风').click()
    await ctx.window.waitForTimeout(1000)

    // Read meta file to verify persistence
    const { readFile } = await import('node:fs/promises')
    const metaPath = join(project.rootPath, 'proposal.meta.json')
    const metaRaw = await readFile(metaPath, 'utf-8')
    const meta = JSON.parse(metaRaw) as ProposalMetadata & { writingStyleId?: string }
    expect(meta.writingStyleId).toBe('government')
  })

  test('should not auto-rewrite existing chapter content on style switch (AC #7)', async () => {
    // Write proposal with existing content in a chapter
    const proposalWithContent = `# 投标技术方案

## 项目概述

本项目是一个已有内容的章节。

## 系统架构设计

> 请设计系统整体架构
`
    await writeFile(join(project.rootPath, 'proposal.md'), proposalWithContent, 'utf-8')

    await navigateToEditor(ctx.window, project.name)
    const selector = ctx.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Switch to military style
    await selector.click()
    await ctx.window.getByText('军工文风').click()
    await ctx.window.waitForTimeout(1000)

    // Verify existing chapter content is unchanged
    const { readFile } = await import('node:fs/promises')
    const mdContent = await readFile(join(project.rootPath, 'proposal.md'), 'utf-8')
    expect(mdContent).toContain('本项目是一个已有内容的章节。')
  })
})
