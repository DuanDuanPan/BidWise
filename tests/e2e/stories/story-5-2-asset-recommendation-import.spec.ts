import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = Record<string, (...args: any[]) => any>

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

type LaunchContext = {
  electronApp: ElectronApplication
  window: Page
  testHome: string
  dbPath: string
  projectId: string
  projectRootPath: string
}

// ─── Seed data ────────────────────────────────────────────

const SEED_ASSETS = [
  {
    id: 'rec-asset-1',
    title: '微服务架构部署方案',
    summary: '分布式微服务系统的部署与运维最佳实践',
    content:
      '本文档详细介绍了微服务架构的容器化部署方案，包括Kubernetes编排、服务网格、流量治理等核心环节。',
    assetType: 'text',
    sourceProject: '项目Alpha',
  },
  {
    id: 'rec-asset-2',
    title: '企业级安全加密体系设计',
    summary: '企业级数据安全加密与访问控制设计方案',
    content: '安全加密方案覆盖传输层加密、存储加密与密钥管理三大领域，满足等保三级合规要求。',
    assetType: 'text',
    sourceProject: '项目Beta',
  },
  {
    id: 'rec-asset-3',
    title: '高并发性能优化案例',
    summary: '金融系统千万级并发优化实践总结',
    content: '某银行核心交易系统从单体迁移到微服务后的性能优化经验总结，实现TPS提升10倍。',
    assetType: 'case',
    sourceProject: '项目Gamma',
  },
]

/**
 * Proposal content designed so that section "系统架构设计" contains keywords
 * (微服务架构, 高并发, 安全, 加密) that match all three seeded assets via FTS trigram search,
 * while being sufficiently different to avoid overlap exclusion.
 */
const PROPOSAL_MD = `# 技术方案

## 系统架构设计

我们采用微服务架构进行系统设计，实现服务拆分与独立部署。系统支持高并发场景下的弹性扩展，核心交易处理能力满足金融级别要求。

安全体系方面采用数据加密与访问控制相结合的策略，确保传输层安全。核心模块包括用户管理、订单处理与数据分析，各服务通过API网关统一对外暴露。

## 项目实施计划

分三阶段实施：需求确认、开发交付、验收上线。
`

// ─── Helpers ──────────────────────────────────────────────

function seedAssets(dbPath: string): void {
  const db = new Database(dbPath)
  const now = new Date().toISOString()

  const insertAsset = db.prepare(`
    INSERT INTO assets (id, project_id, title, summary, content, asset_type, source_project, source_section, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const a of SEED_ASSETS) {
    insertAsset.run(
      a.id,
      null,
      a.title,
      a.summary,
      a.content,
      a.assetType,
      a.sourceProject,
      null,
      now,
      now
    )
  }

  // Tags
  db.prepare(`INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`).run(
    'rec-tag-1',
    '微服务',
    '微服务',
    now
  )
  db.prepare(`INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`).run(
    'rec-tag-2',
    '安全',
    '安全',
    now
  )
  db.prepare(`INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`).run(
    'rec-tag-3',
    '性能',
    '性能',
    now
  )

  // Tag links
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run(
    'rec-asset-1',
    'rec-tag-1'
  )
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run(
    'rec-asset-2',
    'rec-tag-2'
  )
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run(
    'rec-asset-3',
    'rec-tag-1'
  )
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run(
    'rec-asset-3',
    'rec-tag-3'
  )

  db.close()
}

async function launchApp(): Promise<LaunchContext> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-5-2-'))
  const electronApp = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      HOME: testHome,
      USERPROFILE: testHome,
      APPDATA: join(testHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(testHome, 'AppData', 'Local'),
      XDG_CONFIG_HOME: join(testHome, '.config'),
      XDG_DATA_HOME: join(testHome, '.local', 'share'),
      BIDWISE_USER_DATA_DIR: join(testHome, 'bidwise-data'),
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window).toHaveTitle('BidWise')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  const dbPath = join(testHome, 'bidwise-data', 'data', 'db', 'bidwise.sqlite')

  // Create project via IPC
  const project = await window.evaluate(async () => {
    const api = (window as unknown as { api: AnyApi }).api
    const createRes = await api.projectCreate({
      name: 'E2E-资产推荐-5-2',
      proposalType: 'presale-technical',
    })
    if (!createRes.success) throw new Error(createRes.error.message)

    const getRes = await api.projectGet(createRes.data.id)
    if (!getRes.success || !getRes.data.rootPath)
      throw new Error(getRes.success ? '项目根目录不存在' : getRes.error.message)

    return { id: getRes.data.id as string, rootPath: getRes.data.rootPath as string }
  })

  // Seed assets into DB (FTS triggers auto-populate the index)
  seedAssets(dbPath)

  // Write proposal to project root
  mkdirSync(project.rootPath, { recursive: true })
  writeFileSync(join(project.rootPath, 'proposal.md'), PROPOSAL_MD, 'utf-8')

  // Advance project to proposal-writing stage
  const db = new Database(dbPath)
  db.prepare("UPDATE projects SET sop_stage = 'proposal-writing' WHERE id = ?").run(project.id)
  db.close()

  return {
    electronApp,
    window,
    testHome,
    dbPath,
    projectId: project.id,
    projectRootPath: project.rootPath,
  }
}

async function closeAndCleanup(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
  rmSync(ctx.testHome, { recursive: true, force: true })
}

async function navigateToEditor(ctx: LaunchContext): Promise<void> {
  await ctx.window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, ctx.projectId)

  await expect(ctx.window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })
  await expect(ctx.window.getByTestId('editor-view')).toBeVisible({ timeout: 30_000 })
}

// ─── Tests ────────────────────────────────────────────────

test.describe('Story 5.2: Asset Recommendation & One-Click Import', () => {
  test.describe.configure({ timeout: 120_000 })

  let ctx: LaunchContext

  test.beforeAll(async () => {
    ctx = await launchApp()

    // Ensure wide viewport so the annotation panel renders in expanded mode
    await ctx.window.evaluate(() => window.resizeTo(1600, 900))
    await ctx.window.waitForTimeout(500)

    await navigateToEditor(ctx)

    // Wait for editor content to render, then click inside the first section
    // to trigger useCurrentSection detection → recommendation fetch
    const editorContent = ctx.window.locator('[data-testid="plate-editor-content"]')
    await expect(editorContent).toBeVisible({ timeout: 15_000 })
    await ctx.window.getByText('我们采用微服务架构').first().click()
  })

  test.afterAll(async () => {
    if (ctx) await closeAndCleanup(ctx)
  })

  test('@story-5-2 @p0 recommendation panel shows matching asset cards', async () => {
    const panel = ctx.window.getByTestId('recommendation-panel')
    await expect(panel).toBeVisible({ timeout: 20_000 })

    // Wait for at least one recommendation card to appear
    const cards = ctx.window.getByTestId('recommendation-card')
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })

    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Verify card structure: title truncated, match score %, action buttons
    const firstCard = cards.first()
    await expect(firstCard.getByText(/\d+%/)).toBeVisible()
    await expect(firstCard.locator('button', { hasText: '插入' })).toBeVisible()
    await expect(firstCard.locator('button', { hasText: '忽略' })).toBeVisible()
    await expect(firstCard.locator('button', { hasText: '查看详情' })).toBeVisible()
  })

  test('@story-5-2 @p1 detail drawer opens with asset content and closes', async () => {
    const cards = ctx.window.getByTestId('recommendation-card')
    await expect(cards.first()).toBeVisible({ timeout: 5_000 })

    // Open the detail drawer
    await cards.first().locator('button', { hasText: '查看详情' }).click()

    const drawer = ctx.window.locator('.ant-drawer').filter({ hasText: '资产详情' })
    await expect(drawer).toBeVisible({ timeout: 5_000 })

    // Verify drawer shows asset title and full content section
    await expect(drawer.getByText('正文内容')).toBeVisible({ timeout: 5_000 })
    await expect(drawer.locator('button', { hasText: '插入到编辑器' })).toBeVisible()
    await expect(drawer.locator('button', { hasText: '关闭' })).toBeVisible()

    // Close the drawer
    await drawer.locator('button', { hasText: '关闭' }).click()
    await expect(drawer).not.toBeVisible({ timeout: 5_000 })
  })

  test('@story-5-2 @p1 insert marks card as accepted with 已插入 badge', async () => {
    const cards = ctx.window.getByTestId('recommendation-card')
    await expect(cards.first()).toBeVisible({ timeout: 5_000 })

    // Click insert on the first card
    await cards.first().locator('button', { hasText: '插入' }).click()

    // Card should now show 已插入 tag and hide action buttons
    await expect(cards.first().getByText('已插入')).toBeVisible({ timeout: 5_000 })
    await expect(cards.first().locator('button', { hasText: '插入' })).not.toBeVisible()
    await expect(cards.first().locator('button', { hasText: '忽略' })).not.toBeVisible()
  })

  test('@story-5-2 @p1 ignore removes card from recommendation list', async () => {
    const cards = ctx.window.getByTestId('recommendation-card')
    const initialCount = await cards.count()

    // Find a card that still has the ignore button (not accepted)
    const ignorableCards = cards.filter({
      has: ctx.window.locator('button', { hasText: '忽略' }),
    })
    const ignorableCount = await ignorableCards.count()

    if (ignorableCount === 0) {
      // All cards were accepted or only one card was returned — skip
      test.skip()
      return
    }

    await ignorableCards.first().locator('button', { hasText: '忽略' }).click()
    await ctx.window.waitForTimeout(300)

    // One fewer card should remain
    const newCount = await cards.count()
    expect(newCount).toBe(initialCount - 1)
  })

  test('@story-5-2 @p0 one-click import dialog saves selected text as asset', async () => {
    // Triple-click a paragraph inside the editor to select it
    const editorContent = ctx.window.locator('[data-testid="plate-editor-content"]')
    await editorContent.getByText('我们采用微服务架构').first().click({ clickCount: 3 })
    await ctx.window.waitForTimeout(300)

    // Import button should be enabled now that text is selected
    const importBtn = ctx.window.getByTestId('import-asset-btn')
    await expect(importBtn).toBeEnabled({ timeout: 3_000 })

    // Click the import button (onMouseDown=preventDefault preserves selection)
    await importBtn.click()

    // Import dialog should open with pre-filled content
    const dialog = ctx.window.locator('.ant-modal-content').filter({ hasText: '一键入库' })
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Verify form fields are pre-populated
    const titleInput = dialog.locator('input').first()
    await expect(titleInput).not.toHaveValue('')

    const contentArea = dialog.locator('textarea')
    await expect(contentArea).not.toHaveValue('')

    // Submit the form
    const submitBtn = dialog.locator('.ant-modal-footer button.ant-btn-primary')
    await submitBtn.click()

    // Dialog should close and success toast should appear
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })
    await expect(ctx.window.getByText('资产已入库')).toBeVisible({ timeout: 5_000 })
  })
})
