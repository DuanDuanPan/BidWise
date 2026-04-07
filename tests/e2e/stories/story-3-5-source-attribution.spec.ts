import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
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

/** SHA-256 truncated to 16 hex chars — mirrors createContentDigest in chapter-markdown.ts */
function digest(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex').slice(0, 16)
}

test.setTimeout(120_000)

// ─── Helpers ───────────────────────────────────────────

async function launchStoryApp(): Promise<LaunchContext> {
  const sandboxHome = await mkdtemp(join(tmpdir(), 'bidwise-story-3-5-'))
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

async function closeAndCleanup(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  await rm(ctx.sandboxHome, { recursive: true, force: true })
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

// ─── Test content and fixtures ─────────────────────────

const SECTION_TITLE = '系统架构'
const SECTION_LOCATOR = { title: SECTION_TITLE, level: 2, occurrenceIndex: 0 }

const PARA_TEXTS = [
  '我们采用微服务架构，支持千级并发用户。',
  '系统提供AES-256加密和OAuth 2.0认证能力。',
  '本方案支持GraphQL接口集成。',
]

const PROPOSAL_MD = `# 技术方案

## ${SECTION_TITLE}

${PARA_TEXTS[0]}

${PARA_TEXTS[1]}

${PARA_TEXTS[2]}
`

function buildMetadata(
  projectId: string,
  opts?: { editedParagraph?: number; skipBaseline?: boolean }
): ProposalMetadata {
  const attributions: ProposalMetadata['sourceAttributions'] = PARA_TEXTS.map((text, i) => ({
    id: `sa-2-0-${i}`,
    sectionLocator: SECTION_LOCATOR,
    paragraphIndex: i,
    paragraphDigest: i === opts?.editedParagraph ? 'stale-digest-0000' : digest(text),
    sourceType: i === 0 ? 'asset-library' : i === 1 ? 'knowledge-base' : 'no-source',
    sourceRef: i < 2 ? `/sources/doc-${i}.md` : undefined,
    snippet: i < 2 ? `来自文档 ${i}` : undefined,
    confidence: i < 2 ? 0.85 : 0,
  }))

  const baselineValidations: ProposalMetadata['baselineValidations'] = opts?.skipBaseline
    ? []
    : [
        {
          id: 'bv-2-0-0',
          sectionLocator: SECTION_LOCATOR,
          paragraphIndex: 0,
          claim: '支持千级并发用户',
          claimDigest: digest('支持千级并发用户'),
          baselineRef: '系统性能.并发支持',
          matched: true,
        },
        {
          id: 'bv-2-0-2',
          sectionLocator: SECTION_LOCATOR,
          paragraphIndex: 2,
          claim: '支持GraphQL接口集成',
          claimDigest: digest('支持GraphQL接口集成'),
          baselineRef: '集成能力',
          matched: false,
          mismatchReason: '产品基线明确标注不支持GraphQL',
        },
      ]

  return {
    version: '1.0',
    projectId,
    annotations: [],
    scores: [],
    sourceAttributions: attributions,
    baselineValidations,
    lastSavedAt: new Date().toISOString(),
  }
}

async function seedProposal(
  rootPath: string,
  projectId: string,
  opts?: { editedParagraph?: number; skipBaseline?: boolean }
): Promise<void> {
  await mkdir(rootPath, { recursive: true })
  await writeFile(join(rootPath, 'proposal.md'), PROPOSAL_MD, 'utf-8')
  await writeFile(
    join(rootPath, 'proposal.meta.json'),
    JSON.stringify(buildMetadata(projectId, opts), null, 2),
    'utf-8'
  )
}

async function navigateToEditor(ctx: LaunchContext, projectId: string): Promise<void> {
  advanceToProposalWriting(ctx.userDataPath, projectId)

  await ctx.window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)

  await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })
  await expect(ctx.window.getByTestId('editor-view')).toBeVisible({ timeout: 30_000 })
}

// ─── Tests ─────────────────────────────────────────────

test.describe('Story 3.5: Source Attribution & Baseline Validation', () => {
  let ctx: LaunchContext
  let project: SeededProject

  test.beforeAll(async () => {
    ctx = await launchStoryApp()
    project = await createProject(ctx.window, 'E2E-来源标注-3-5')
    await seedProposal(project.rootPath, project.id)
    await navigateToEditor(ctx, project.id)
  })

  test.afterAll(async () => {
    await closeAndCleanup(ctx)
  })

  test('@story-3-5 @p0 source attribution labels appear on paragraphs', async () => {
    const labels = ctx.window.locator('[data-testid="source-attribution-label"]')
    await expect(labels.first()).toBeVisible({ timeout: 15_000 })

    const count = await labels.count()
    expect(count).toBeGreaterThanOrEqual(PARA_TEXTS.length)

    // Verify source type differentiation
    const sourceTypes = await labels.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-source-type'))
    )
    expect(sourceTypes).toContain('asset-library')
    expect(sourceTypes).toContain('knowledge-base')
    expect(sourceTypes).toContain('no-source')
  })

  test('@story-3-5 @p0 no-source paragraphs have yellow highlight', async () => {
    const noSourceLabel = ctx.window.locator(
      '[data-testid="source-attribution-label"][data-source-type="no-source"]'
    )
    await expect(noSourceLabel).toBeVisible({ timeout: 10_000 })

    // The highlighted container can be a paragraph/list wrapper rather than a div,
    // so assert on computed style up the ancestor chain instead of raw inline markup.
    await expect
      .poll(
        async () =>
          noSourceLabel.evaluate((label) => {
            let current: HTMLElement | null = label as HTMLElement
            while (current && current !== document.body) {
              if (window.getComputedStyle(current).backgroundColor === 'rgb(255, 251, 230)') {
                return true
              }
              current = current.parentElement
            }
            return false
          }),
        { timeout: 5_000 }
      )
      .toBe(true)
  })

  test('@story-3-5 @p0 baseline mismatch shows red marker', async () => {
    const mismatchMarker = ctx.window.getByTestId('baseline-mismatch-marker')
    await expect(mismatchMarker.first()).toBeVisible({ timeout: 10_000 })

    // Hover to verify tooltip renders — use waitForTimeout to let Ant Design
    // Tooltip's mouseEnterDelay settle before assertion polling begins
    await mismatchMarker.first().hover()
    await ctx.window.waitForTimeout(500)
    const tooltip = ctx.window.getByTestId('baseline-mismatch-tooltip')
    await expect(tooltip).toBeVisible({ timeout: 10_000 })
    await expect(tooltip).toContainText('基线不匹配')
  })

  test('@story-3-5 @p1 edited paragraph shows gray label', async () => {
    // Re-seed with paragraph 1 marked as edited (stale digest)
    await seedProposal(project.rootPath, project.id, { editedParagraph: 1 })

    // Reload to pick up new metadata
    await ctx.window.evaluate(() => {
      window.location.hash = '#/'
    })
    await expect(ctx.window.getByTestId('project-kanban')).toBeVisible({ timeout: 15_000 })

    await navigateToEditor(ctx, project.id)

    const editedLabel = ctx.window.locator(
      '[data-testid="source-attribution-label"][data-source-type="user-edited"]'
    )
    await expect(editedLabel).toBeVisible({ timeout: 15_000 })
  })

  test('@story-3-5 @p1 missing baseline file skips validation silently', async () => {
    // Re-seed without baseline validations
    await seedProposal(project.rootPath, project.id, { skipBaseline: true })

    await ctx.window.evaluate(() => {
      window.location.hash = '#/'
    })
    await expect(ctx.window.getByTestId('project-kanban')).toBeVisible({ timeout: 15_000 })

    await navigateToEditor(ctx, project.id)

    // Source labels should still render
    const labels = ctx.window.locator('[data-testid="source-attribution-label"]')
    await expect(labels.first()).toBeVisible({ timeout: 15_000 })

    // No mismatch markers should be present
    const mismatchMarkers = ctx.window.getByTestId('baseline-mismatch-marker')
    await expect(mismatchMarkers).toHaveCount(0)

    // No error states in the editor
    const errorView = ctx.window.getByTestId('editor-error')
    await expect(errorView).not.toBeVisible()
  })
})
