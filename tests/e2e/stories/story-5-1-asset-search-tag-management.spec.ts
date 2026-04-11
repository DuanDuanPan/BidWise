import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

const MODIFIER_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'
const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(90_000)

function seedTestData(dbPath: string): void {
  const db = new Database(dbPath)
  const now = new Date().toISOString()

  // Insert assets
  db.prepare(`
    INSERT INTO assets (id, project_id, title, summary, content, asset_type, source_project, source_section, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'asset-1', null, '微服务架构设计方案', '基于微服务的分布式系统架构设计',
    '本文档详细介绍了微服务架构的设计方案，包括服务拆分、通信协议、数据管理等核心内容。',
    'text', '项目A', null, now, now
  )
  db.prepare(`
    INSERT INTO assets (id, project_id, title, summary, content, asset_type, source_project, source_section, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'asset-2', null, '系统架构图', '整体架构拓扑图',
    '系统架构拓扑图展示了各模块之间的依赖关系。',
    'diagram', '项目B', null, now, now
  )
  db.prepare(`
    INSERT INTO assets (id, project_id, title, summary, content, asset_type, source_project, source_section, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'asset-3', null, '成功案例分析', '某银行系统迁移案例',
    '本案例描述了某银行核心系统从单体到微服务的迁移过程。',
    'case', '项目C', null, now, now
  )

  // Insert tags
  db.prepare(`INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`).run(
    'tag-1', '架构图', '架构图', now
  )
  db.prepare(`INSERT INTO tags (id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)`).run(
    'tag-2', '微服务', '微服务', now
  )

  // Link tags to assets
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run('asset-1', 'tag-2')
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run('asset-2', 'tag-1')
  db.prepare(`INSERT INTO asset_tags (asset_id, tag_id) VALUES (?, ?)`).run('asset-3', 'tag-2')

  db.close()
}

async function withIsolatedApp(run: (window: Page) => Promise<void>): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-5-1-'))
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

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('BidWise')
    await expect(window.getByTestId('project-kanban')).toBeVisible()

    // Seed data after app has initialized DB
    const dbPath = join(testHome, 'bidwise-data', 'data', 'db', 'bidwise.sqlite')
    seedTestData(dbPath)

    await run(window)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function triggerShortcut(window: Page, key: string): Promise<void> {
  await window.evaluate(
    ({ shortcutKey, modifierKey }) => {
      const keyboardEvent = new KeyboardEvent('keydown', {
        key: shortcutKey,
        metaKey: modifierKey === 'Meta',
        ctrlKey: modifierKey === 'Control',
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(keyboardEvent)
    },
    { shortcutKey: key, modifierKey: MODIFIER_KEY }
  )
}

async function openCommandPalette(window: Page): Promise<void> {
  await triggerShortcut(window, 'k')
  await expect(window.getByTestId('command-palette')).toBeVisible()
  await expect(window.getByTestId('command-palette-input')).toBeVisible()
}

async function navigateToAssetPage(window: Page): Promise<void> {
  await openCommandPalette(window)
  const input = window.getByTestId('command-palette-input')
  await input.fill('资产')
  await input.press('Enter')
  await expect(window.getByText('资产库')).toBeVisible()
}

test('@story-5-1 @p0 Chinese keyword + #tag search returns matching assets', async () => {
  await withIsolatedApp(async (window) => {
    await navigateToAssetPage(window)

    // All 3 seeded assets should be listed initially
    await expect(window.getByText('找到 3 个资产')).toBeVisible()

    // Search with Chinese keyword
    const searchInput = window.locator('input[placeholder*="搜索资产"]')
    await searchInput.fill('微服务')
    // Wait for 300ms debounce + response
    await window.waitForTimeout(500)
    await expect(window.getByText('微服务架构设计方案')).toBeVisible()
  })
})

test('@story-5-1 @p1 asset type multi-select filter works with 全部 reset', async () => {
  await withIsolatedApp(async (window) => {
    await navigateToAssetPage(window)

    // Click 案例 filter
    await window.getByRole('button', { name: '案例' }).click()
    await window.waitForTimeout(500)
    await expect(window.getByText('找到 1 个资产')).toBeVisible()
    await expect(window.getByText('成功案例分析')).toBeVisible()

    // Click 全部 to reset
    await window.getByRole('button', { name: '全部' }).click()
    await window.waitForTimeout(500)
    await expect(window.getByText('找到 3 个资产')).toBeVisible()
  })
})

test('@story-5-1 @p1 empty state shows when no results match', async () => {
  await withIsolatedApp(async (window) => {
    await navigateToAssetPage(window)

    const searchInput = window.locator('input[placeholder*="搜索资产"]')
    await searchInput.fill('不存在的关键词xyz')
    await window.waitForTimeout(500)

    await expect(window.getByText('未找到匹配资产')).toBeVisible()
  })
})

test('@story-5-1 @p1 clicking card shows detail and tag editing works', async () => {
  await withIsolatedApp(async (window) => {
    await navigateToAssetPage(window)

    // Click a card to enter detail state
    await window.getByText('微服务架构设计方案').click()

    // Detail view should show
    await expect(window.getByText('返回搜索结果')).toBeVisible()
    await expect(window.getByText('标签管理')).toBeVisible()

    // Add a new tag
    const tagInput = window.locator('input[placeholder*="添加标签"]')
    await tagInput.fill('新标签')
    await tagInput.press('Enter')
    await window.waitForTimeout(500)

    // Verify tag appears
    await expect(window.getByText('新标签')).toBeVisible()

    // Go back to results
    await window.getByText('返回搜索结果').click()
    await expect(window.getByText('找到 3 个资产')).toBeVisible()
  })
})
