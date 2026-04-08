import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
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
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-8-'))
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

// ─── Tests ───────────────────────────────────────────

test.describe('Story 3.8 — Mermaid 架构图草图生成', () => {
  let ctx: LaunchContext
  let project: SeededProject

  test.beforeAll(async () => {
    ctx = await launchStoryApp()

    project = await createProject(ctx.window, 'E2E Mermaid 测试项目')
    advanceToProposalWriting(ctx.userDataPath, project.id)

    await seedProposalFiles(project.rootPath, project.id, '# 方案标题\n\n## 系统架构\n\n方案正文')
    await navigateToEditor(ctx.window, project.id)
  })

  test.afterAll(async () => {
    await ctx?.electronApp?.close()
  })

  test('AC1: insert-mermaid button is visible in toolbar', async () => {
    const btn = ctx.window.getByTestId('insert-mermaid-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
  })

  test('AC1: clicking insert-mermaid inserts a mermaid element in editing mode', async () => {
    const btn = ctx.window.getByTestId('insert-mermaid-btn')
    await btn.click()

    const mermaidElement = ctx.window.getByTestId('mermaid-element').first()
    await expect(mermaidElement).toBeVisible({ timeout: 15_000 })

    // Should start in editing mode with source editor and done button
    const editing = ctx.window.getByTestId('mermaid-editing').first()
    await expect(editing).toBeVisible({ timeout: 10_000 })
    await expect(ctx.window.getByTestId('mermaid-source-editor').first()).toBeVisible()
    await expect(ctx.window.getByTestId('mermaid-done-btn').first()).toBeVisible()
  })

  test('AC2: mermaid source renders SVG preview in editing mode', async () => {
    // The default template should trigger a render after debounce
    const renderer = ctx.window.getByTestId('mermaid-renderer').first()
    await expect(renderer).toBeVisible({ timeout: 10_000 })

    // Wait for mermaid to render (500ms debounce + render time)
    const svgContainer = ctx.window.getByTestId('mermaid-svg-container').first()
    await expect(svgContainer).toBeVisible({ timeout: 10_000 })

    // SVG should eventually contain rendered content
    await ctx.window.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="mermaid-svg-container"]')
        return el && el.innerHTML.includes('svg')
      },
      { timeout: 15_000 }
    )
  })

  test('AC4: clicking done switches to preview mode', async () => {
    const doneBtn = ctx.window.getByTestId('mermaid-done-btn').first()
    await doneBtn.click()

    // Should switch to preview mode
    const preview = ctx.window.getByTestId('mermaid-preview').first()
    await expect(preview).toBeVisible({ timeout: 10_000 })

    // Edit and delete buttons should be visible
    await expect(ctx.window.getByTestId('mermaid-edit-btn').first()).toBeVisible()
    await expect(ctx.window.getByTestId('mermaid-delete-btn').first()).toBeVisible()
  })

  test('AC4: clicking edit returns to editing mode', async () => {
    const editBtn = ctx.window.getByTestId('mermaid-edit-btn').first()
    await editBtn.click()

    const editing = ctx.window.getByTestId('mermaid-editing').first()
    await expect(editing).toBeVisible({ timeout: 10_000 })

    // Return to preview for subsequent tests
    const doneBtn = ctx.window.getByTestId('mermaid-done-btn').first()
    await doneBtn.click()
    await expect(ctx.window.getByTestId('mermaid-preview').first()).toBeVisible({ timeout: 10_000 })
  })

  test('AC5: mermaid block serializes to markdown with comment + fenced code block', async () => {
    // Wait for serialization (debounce + idle callback)
    await ctx.window.waitForTimeout(2000)

    const proposalMd = await readFile(join(project.rootPath, 'proposal.md'), 'utf-8')

    // Should contain mermaid comment (3-field format: id:filename:caption)
    expect(proposalMd).toMatch(/<!-- mermaid:[^:]+:[^:]+\.svg:[^>]* -->/)
    // Should contain mermaid fenced code block
    expect(proposalMd).toContain('```mermaid')
  })

  test('AC6: SVG asset is saved to project assets directory', async () => {
    const assetsDir = join(project.rootPath, 'assets')

    // Find the SVG file in assets/
    const proposalMd = await readFile(join(project.rootPath, 'proposal.md'), 'utf-8')
    const match = proposalMd.match(/<!-- mermaid:[^:]+:([^:]+\.svg):[^>]* -->/)
    expect(match).toBeTruthy()

    const svgFileName = match![1]
    const svgContent = await readFile(join(assetsDir, svgFileName), 'utf-8')
    expect(svgContent).toContain('svg')
  })

  test('AC7: delete button removes mermaid element', async () => {
    const deleteBtn = ctx.window.getByTestId('mermaid-delete-btn').first()
    await deleteBtn.click()

    const confirmDialog = ctx.window.getByRole('dialog', { name: '确认删除' })
    await expect(confirmDialog).toBeVisible({ timeout: 3_000 })

    const okBtn = confirmDialog.getByRole('button', { name: /删\s*除/ })
    await okBtn.click()

    await expect(ctx.window.getByTestId('mermaid-element')).toHaveCount(0, { timeout: 10_000 })
  })

  test('AC5+AC6: mermaid block re-appears after re-open (deserialization)', async () => {
    // Seed a mermaid block via markdown and re-navigate
    const proposalMd = [
      '# 方案标题',
      '',
      '## 系统架构',
      '',
      '<!-- mermaid:e2e-test-id:mermaid-e2e-test.svg: -->',
      '```mermaid',
      'graph TD',
      '  A[系统入口] --> B[业务处理]',
      '```',
      '',
    ].join('\n')
    await writeFile(join(project.rootPath, 'proposal.md'), proposalMd, 'utf-8')

    await navigateToEditor(ctx.window, project.id)

    // The mermaid element should be visible (deserialized from markdown)
    const mermaidElement = ctx.window.getByTestId('mermaid-element').first()
    await expect(mermaidElement).toBeVisible({ timeout: 15_000 })
  })
})
