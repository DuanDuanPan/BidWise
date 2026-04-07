import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
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
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-7-'))
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

test.describe('Story 3.7 — draw.io 架构图内嵌编辑', () => {
  let ctx: LaunchContext
  let project: SeededProject

  test.beforeAll(async () => {
    ctx = await launchStoryApp()

    project = await createProject(ctx.window, 'E2E draw.io 测试项目')
    advanceToProposalWriting(ctx.userDataPath, project.id)

    await seedProposalFiles(project.rootPath, project.id, '# 方案标题\n\n## 系统架构\n\n方案正文')
    await navigateToEditor(ctx.window, project.id)
  })

  test.afterAll(async () => {
    await ctx?.electronApp?.close()
  })

  test('AC1: insert-drawio button is visible in toolbar', async () => {
    const btn = ctx.window.getByTestId('insert-drawio-btn')
    await expect(btn).toBeVisible({ timeout: 10_000 })
  })

  test('AC1: clicking insert-drawio inserts a drawio element', async () => {
    // Click the insert button
    const btn = ctx.window.getByTestId('insert-drawio-btn')
    await btn.click()

    // Verify a drawio element appeared in the editor
    const drawioElement = ctx.window.getByTestId('drawio-element').first()
    await expect(drawioElement).toBeVisible({ timeout: 15_000 })
  })

  test('AC8: delete button removes drawio element in preview mode', async () => {
    // Seed a drawio element that will load in preview mode:
    // 1. Write asset files to disk so lazy-load succeeds
    const assetsDir = join(project.rootPath, 'assets')
    await mkdir(assetsDir, { recursive: true })
    const seedDiagramId = randomUUID()
    const seedFileName = `diagram-del-test.drawio`
    const seedXml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
    // Minimal 1x1 transparent PNG
    const seedPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg=='

    await writeFile(join(assetsDir, seedFileName), seedXml, 'utf-8')
    await writeFile(join(assetsDir, 'diagram-del-test.png'), Buffer.from(seedPngBase64, 'base64'))

    // 2. Seed proposal.md with the drawio markdown block
    const proposalMd = `# 方案标题\n\n## 系统架构\n\n<!-- drawio:${seedDiagramId}:${seedFileName} -->\n![测试图](assets/diagram-del-test.png)\n`
    await writeFile(join(project.rootPath, 'proposal.md'), proposalMd, 'utf-8')

    // 3. Navigate to editor — element deserializes and lazy-loads xml → preview mode
    await navigateToEditor(ctx.window, project.id)

    // 4. Wait for the element to appear in preview mode (after lazy-load)
    const preview = ctx.window.getByTestId('drawio-preview').first()
    await expect(preview).toBeVisible({ timeout: 15_000 })

    // 5. Click delete
    const deleteBtn = ctx.window.getByTestId('drawio-delete-btn').first()
    await deleteBtn.click()

    // 6. Verify element is removed
    await expect(ctx.window.getByTestId('drawio-element')).toHaveCount(0, { timeout: 10_000 })
  })

  test('AC5: drawio block serializes to markdown with comment + image', async () => {
    // Insert a drawio element
    const btn = ctx.window.getByTestId('insert-drawio-btn')
    await btn.click()
    await expect(ctx.window.getByTestId('drawio-element').first()).toBeVisible({ timeout: 15_000 })

    // Wait for serialization (debounce + idle callback)
    await ctx.window.waitForTimeout(2000)

    // Read the proposal.md file to verify serialization
    const proposalMd = await readFile(join(project.rootPath, 'proposal.md'), 'utf-8')

    // Should contain drawio comment
    expect(proposalMd).toMatch(/<!-- drawio:[^:]+:[^>]+\.drawio -->/)
    // Should contain image reference
    expect(proposalMd).toMatch(/!\[.*\]\(assets\/.*\.png\)/)
  })

  test('AC7: CSP allows embed.diagrams.net iframe', async () => {
    // Verify the CSP meta tag includes frame-src for draw.io
    const csp = await ctx.window.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      return meta?.getAttribute('content') ?? ''
    })

    expect(csp).toContain('frame-src https://embed.diagrams.net')
  })

  test('AC6: drawio block re-appears after re-open', async () => {
    // Re-navigate to the editor to test deserialization
    await navigateToEditor(ctx.window, project.id)

    // The drawio element should still be visible after re-opening
    const drawioElement = ctx.window.getByTestId('drawio-element').first()
    await expect(drawioElement).toBeVisible({ timeout: 15_000 })
  })
})
