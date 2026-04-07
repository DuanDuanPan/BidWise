import { test, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

type CapturedAiPrompt = {
  timestamp: string
  model: string
  messages: Array<{ role: string; content: string }>
}

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')
const PROMPT_CAPTURE_FILE = 'e2e-ai-prompts.jsonl'

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
      BIDWISE_E2E_AI_MOCK: 'true',
      BIDWISE_E2E_AI_MOCK_DELAY_MS: '100',
      BIDWISE_E2E_AI_MOCK_CAPTURE_PROMPTS: 'true',
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

async function navigateToEditor(window: Page, projectId: string): Promise<void> {
  const targetHash = `#/project/${projectId}`
  const currentHash = await window.evaluate(() => window.location.hash)

  if (currentHash === targetHash) {
    await window.evaluate(() => {
      window.location.hash = '#/'
    })
    await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 15_000 })
  }

  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)

  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  const editorView = window.getByTestId('editor-view')
  if (!(await editorView.isVisible().catch(() => false))) {
    const sopTab = window.getByTestId('sop-stage-proposal-writing')
    if (await sopTab.isVisible().catch(() => false)) {
      await sopTab.click()
    }
  }

  await expect(editorView).toBeVisible({ timeout: 15_000 })
  await expect(window.getByTestId('plate-editor-content')).toBeVisible({ timeout: 15_000 })
}

async function revealChapterAction(
  window: Page,
  headingTitle: string,
  actionTestId: 'chapter-generate-btn' | 'chapter-regenerate-btn'
): Promise<Locator> {
  const heading = window.getByTestId('editor-view').getByText(headingTitle, { exact: true }).first()
  await expect(heading).toBeVisible({ timeout: 10_000 })
  await heading.hover()

  const action = window.locator(`[data-testid="${actionTestId}"]`).first()
  await expect(action).toBeVisible({ timeout: 10_000 })
  return action
}

async function clickWritingStyleOption(window: Page, label: string): Promise<void> {
  const dropdown = window.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  await expect(dropdown).toBeVisible({ timeout: 10_000 })
  await dropdown.getByText(label, { exact: true }).click()
}

async function readCapturedAiPrompts(userDataPath: string): Promise<CapturedAiPrompt[]> {
  const filePath = join(userDataPath, 'data', 'logs', PROMPT_CAPTURE_FILE)
  let raw: string
  try {
    raw = await readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CapturedAiPrompt)
}

function findCapturedUserPrompt(prompts: CapturedAiPrompt[], chapterTitle: string): string {
  for (let i = prompts.length - 1; i >= 0; i--) {
    const userPrompt = prompts[i].messages.find((m) => m.role === 'user')?.content ?? ''
    if (userPrompt.includes(`## 章节标题：${chapterTitle}`)) return userPrompt
  }
  return ''
}

async function teardown(ctx?: LaunchContext): Promise<void> {
  if (!ctx) return
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
}

// ─── E2E Tests ───────────────────────────────────────────

test.describe('@story-3-6 Writing Style Template E2E', () => {
  test.describe.configure({ timeout: 120_000 })

  let ctx: LaunchContext | undefined
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
    await navigateToEditor(ctx!.window, project.id)
    const selector = ctx!.window.getByTestId('writing-style-selector')
    await expect(selector).toBeVisible({ timeout: 10_000 })
  })

  test('should default to general style', async () => {
    await navigateToEditor(ctx!.window, project.id)
    const selector = ctx!.window.getByTestId('writing-style-selector')
    await expect(selector).toBeVisible({ timeout: 10_000 })
    await expect(ctx!.window.getByText('通用文风')).toBeVisible()
  })

  test('should persist style selection across page reload', async () => {
    await navigateToEditor(ctx!.window, project.id)
    const selector = ctx!.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Change to military style
    await selector.click()
    await clickWritingStyleOption(ctx!.window, '军工文风')
    await expect
      .poll(async () => {
        const res = await ctx!.window.evaluate(
          async ({ pid }) => window.api.documentGetMetadata({ projectId: pid }),
          { pid: project.id }
        )
        return res.success ? res.data.writingStyleId : null
      })
      .toBe('military')

    // Reload page
    await ctx!.window.reload()
    await ctx!.window.waitForLoadState('domcontentloaded')

    // Navigate back to editor
    await navigateToEditor(ctx!.window, project.id)

    // Verify military style is still selected
    await expect(ctx!.window.getByText('军工文风')).toBeVisible({ timeout: 10_000 })
  })

  test('should persist writingStyleId in proposal.meta.json (AC #4)', async () => {
    await navigateToEditor(ctx!.window, project.id)
    const selector = ctx!.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Change to government style
    await selector.click()
    await clickWritingStyleOption(ctx!.window, '政企文风')
    await expect
      .poll(async () => {
        const res = await ctx!.window.evaluate(
          async ({ pid }) => window.api.documentGetMetadata({ projectId: pid }),
          { pid: project.id }
        )
        return res.success ? res.data.writingStyleId : null
      })
      .toBe('government')

    // Read meta file to verify persistence
    const metaPath = join(project.rootPath, 'proposal.meta.json')
    const metaRaw = await readFile(metaPath, 'utf-8')
    const meta = JSON.parse(metaRaw) as ProposalMetadata & { writingStyleId?: string }
    expect(meta.writingStyleId).toBe('government')
  })

  test('chapter generation prompt includes writing style constraints (AC #5)', async () => {
    await navigateToEditor(ctx!.window, project.id)

    // Set military style for the project via IPC
    const updateRes = await ctx!.window.evaluate(
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
    const styleRes = await ctx!.window.evaluate(async () => {
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

    const generateBtn = await revealChapterAction(ctx!.window, '项目概述', 'chapter-generate-btn')
    await generateBtn.click()

    await expect
      .poll(
        async () =>
          findCapturedUserPrompt(await readCapturedAiPrompts(ctx!.userDataPath), '项目概述'),
        { timeout: 30_000 }
      )
      .toContain('## 写作风格要求')

    const prompt = findCapturedUserPrompt(
      await readCapturedAiPrompts(ctx!.userDataPath),
      '项目概述'
    )
    expect(prompt).toContain('文风：军工文风')
    expect(prompt).toContain(style.toneGuidance)
    expect(prompt).toContain('用语规范')
    expect(prompt).toContain(style.vocabularyRules[0])
    expect(prompt).toContain('禁用词（请勿使用以下词语）')
    expect(prompt).toContain(style.forbiddenWords[0])
    expect(prompt).toContain('句式约束')
    expect(prompt).toContain(style.sentencePatterns[0])

    await expect(ctx!.window.getByText('方案概述').first()).toBeVisible({ timeout: 15_000 })
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

    const resetRes = await ctx!.window.evaluate(
      async ({ pid }) =>
        window.api.writingStyleUpdateProject({ projectId: pid, writingStyleId: 'government' }),
      { pid: project.id }
    )
    expect(resetRes.success).toBe(true)

    await navigateToEditor(ctx!.window, project.id)
    const selector = ctx!.window.locator('[data-testid="writing-style-selector"]')
    await expect(selector).toBeVisible({ timeout: 10_000 })

    // Switch to military style
    await selector.click()
    await clickWritingStyleOption(ctx!.window, '军工文风')
    await expect
      .poll(async () => {
        const res = await ctx!.window.evaluate(
          async ({ pid }) => window.api.documentGetMetadata({ projectId: pid }),
          { pid: project.id }
        )
        return res.success ? res.data.writingStyleId : null
      })
      .toBe('military')

    // Verify existing chapter content is unchanged
    const mdContent = await readFile(join(project.rootPath, 'proposal.md'), 'utf-8')
    expect(mdContent).toContain('本项目是一个已有内容的章节。')
  })
})
