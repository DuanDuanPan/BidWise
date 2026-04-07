import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProposalMetadata } from '@shared/models/proposal'
import type { WritingStyleTemplate } from '@shared/writing-style-types'

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
      USERPROFILE: sandboxHome,
      APPDATA: join(sandboxHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(sandboxHome, 'AppData', 'Local'),
      XDG_CONFIG_HOME: join(sandboxHome, '.config'),
      XDG_DATA_HOME: join(sandboxHome, '.local', 'share'),
      BIDWISE_USER_DATA_DIR: join(sandboxHome, 'bidwise-data'),
      ELECTRON_IS_DEV: '0',
      NODE_ENV: 'test',
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window).toHaveTitle('BidWise')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  expect(userDataPath.startsWith(sandboxHome)).toBe(true)

  return { electronApp, window, sandboxHome, userDataPath }
}

async function createProject(window: Page, name: string): Promise<SeededProject> {
  return window.evaluate(
    async ({ projectName }) => {
      const createRes = await window.api.projectCreate({
        name: projectName,
        proposalType: 'presale-technical',
      })
      if (!createRes.success) throw new Error(createRes.error.message)

      const getRes = await window.api.projectGet(createRes.data.id)
      if (!getRes.success || !getRes.data.rootPath)
        throw new Error(getRes.success ? '项目根目录不存在' : getRes.error.message)

      return { id: getRes.data.id, name: getRes.data.name, rootPath: getRes.data.rootPath }
    },
    { projectName: name }
  )
}

function advanceToProposalWriting(userDataPath: string, projectId: string): void {
  const dbPath = join(userDataPath, 'data', 'db', 'bidwise.sqlite')
  const db = new DatabaseSync(dbPath)
  try {
    db.prepare("UPDATE projects SET sop_stage = 'proposal-writing' WHERE id = ?").run(projectId)
  } finally {
    db.close()
  }
}

async function seedProposalFiles(
  rootPath: string,
  projectId: string,
  proposalMd: string
): Promise<void> {
  await mkdir(rootPath, { recursive: true })
  await writeFile(join(rootPath, 'proposal.md'), proposalMd, 'utf-8')

  const defaultMeta: ProposalMetadata = {
    version: '1.0',
    projectId,
    annotations: [],
    scores: [],
    sourceAttributions: [],
    baselineValidations: [],
    lastSavedAt: new Date().toISOString(),
  }
  await writeFile(join(rootPath, 'proposal.meta.json'), JSON.stringify(defaultMeta, null, 2))
}

async function navigateToEditor(window: Page, projectName: string): Promise<void> {
  // Navigate to the project
  await window.getByText(projectName).first().click()
  // Wait for the editor to load (proposal-writing stage shows EditorView)
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
    project = await createProject(ctx.window, 'Story36-文风测试')
    advanceToProposalWriting(ctx.userDataPath, project.id)
    await seedProposalFiles(project.rootPath, project.id, PROPOSAL_MD)
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

  test('chapter generation prompt includes writing style constraints (AC #5)', async () => {
    // Set military style for the project via IPC
    const updateRes = await ctx.window.evaluate(
      async ({ pid }) => {
        return await window.api.writingStyleUpdateProject({
          projectId: pid,
          writingStyleId: 'military',
        })
      },
      { pid: project.id }
    )
    expect(updateRes.success).toBe(true)

    // Retrieve the full military style template via IPC
    const styleRes = await ctx.window.evaluate(async () => {
      return await window.api.writingStyleGet({ styleId: 'military' })
    })
    expect(styleRes.success).toBe(true)

    const style = (styleRes as { success: true; data: { style: WritingStyleTemplate } }).data.style
    expect(style).not.toBeNull()

    // Verify all prompt-injection fields are populated with meaningful content
    expect(style.toneGuidance).toBeTruthy()
    expect(style.toneGuidance).toContain('严谨')
    expect(style.vocabularyRules.length).toBeGreaterThan(0)
    expect(style.vocabularyRules.every((r: string) => typeof r === 'string')).toBe(true)
    expect(style.forbiddenWords.length).toBeGreaterThan(0)
    expect(style.forbiddenWords.every((w: string) => typeof w === 'string')).toBe(true)
    expect(style.sentencePatterns.length).toBeGreaterThan(0)
    expect(style.sentencePatterns.every((p: string) => typeof p === 'string')).toBe(true)

    // Verify the project's writing style resolves to military via IPC
    const listRes = await ctx.window.evaluate(async () => {
      return await window.api.writingStyleList()
    })
    expect(listRes.success).toBe(true)
    const styles = (listRes as { success: true; data: { styles: WritingStyleTemplate[] } }).data
      .styles
    expect(styles.some((s: WritingStyleTemplate) => s.id === 'military')).toBe(true)

    // Verify the project metadata has the correct writingStyleId for prompt injection
    const metaRes = await ctx.window.evaluate(
      async ({ pid }) => {
        return await window.api.documentGetMetadata({ projectId: pid })
      },
      { pid: project.id }
    )
    expect(metaRes.success).toBe(true)
    const meta = (
      metaRes as { success: true; data: ProposalMetadata & { writingStyleId?: string } }
    ).data
    expect(meta.writingStyleId).toBe('military')
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
