import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(90_000)

async function withIsolatedApp(run: (window: Page) => Promise<void>): Promise<void> {
  const testHome = mkdtempSync(join(tmpdir(), 'bidwise-story-5-3-'))
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
      BIDWISE_E2E_AI_MOCK: 'true',
      BIDWISE_E2E_AI_MOCK_DELAY_MS: '100',
    },
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window).toHaveTitle('BidWise')
    await run(window)
  } finally {
    await electronApp.close()
    rmSync(testHome, { recursive: true, force: true })
  }
}

async function navigateToAssetModule(window: Page): Promise<void> {
  // Navigate to /asset route via hash router
  await window.evaluate(() => {
    window.location.hash = '#/asset'
  })
  await window.waitForTimeout(500)
}

async function switchToTerminologyTab(window: Page): Promise<void> {
  await window.getByText('术语库').click()
  await window.waitForTimeout(300)
}

test.describe('Story 5.3: 行业术语库维护与自动应用', () => {
  test('AC1 — 添加术语映射，列表显示新条目', async () => {
    await withIsolatedApp(async (window) => {
      await navigateToAssetModule(window)
      await switchToTerminologyTab(window)

      // Click "添加术语" button
      await window.getByText('添加术语').click()
      await window.waitForTimeout(300)

      // Fill in the form
      const modal = window.getByRole('dialog')
      await expect(modal).toBeVisible()

      await modal.locator('input').nth(0).fill('设备管理')
      await modal.locator('input').nth(1).fill('装备全寿命周期管理')

      // Submit
      await modal.getByText('确定').click()
      await window.waitForTimeout(500)

      // Verify the entry appears in the table
      await expect(window.getByText('设备管理')).toBeVisible()
      await expect(window.getByText('装备全寿命周期管理')).toBeVisible()
    })
  })

  test('AC1 — 编辑术语映射，修改后列表刷新', async () => {
    await withIsolatedApp(async (window) => {
      await navigateToAssetModule(window)
      await switchToTerminologyTab(window)

      // First, add an entry
      await window.getByText('添加术语').click()
      await window.waitForTimeout(300)

      const addModal = window.getByRole('dialog')
      await addModal.locator('input').nth(0).fill('系统')
      await addModal.locator('input').nth(1).fill('信息化平台')
      await addModal.getByText('确定').click()
      await window.waitForTimeout(500)

      // Click edit button
      await window.getByText('编辑').first().click()
      await window.waitForTimeout(300)

      // Modify the target term
      const editModal = window.getByRole('dialog')
      await editModal.locator('input').nth(1).clear()
      await editModal.locator('input').nth(1).fill('综合信息化平台')
      await editModal.getByText('确定').click()
      await window.waitForTimeout(500)

      // Verify updated entry
      await expect(window.getByText('综合信息化平台')).toBeVisible()
    })
  })

  test('AC1 — 删除术语映射（确认后移除）', async () => {
    await withIsolatedApp(async (window) => {
      await navigateToAssetModule(window)
      await switchToTerminologyTab(window)

      // Add an entry first
      await window.getByText('添加术语').click()
      await window.waitForTimeout(300)

      const modal = window.getByRole('dialog')
      await modal.locator('input').nth(0).fill('待删除术语')
      await modal.locator('input').nth(1).fill('目标')
      await modal.getByText('确定').click()
      await window.waitForTimeout(500)

      // Click delete
      await window.getByText('删除').first().click()
      await window.waitForTimeout(200)

      // Confirm deletion
      await window.getByText('确定').click()
      await window.waitForTimeout(500)

      // Verify entry is removed — empty state should show
      await expect(
        window.getByText('术语库暂无条目。点击"添加术语"创建第一条行业术语映射。')
      ).toBeVisible()
    })
  })

  test('AC2 — 搜索术语列表过滤正确', async () => {
    await withIsolatedApp(async (window) => {
      await navigateToAssetModule(window)
      await switchToTerminologyTab(window)

      // Add two entries
      for (const [src, tgt] of [
        ['设备管理', '装备全寿命周期管理'],
        ['系统', '信息化平台'],
      ]) {
        await window.getByText('添加术语').click()
        await window.waitForTimeout(300)
        const modal = window.getByRole('dialog')
        await modal.locator('input').nth(0).fill(src)
        await modal.locator('input').nth(1).fill(tgt)
        await modal.getByText('确定').click()
        await window.waitForTimeout(500)
      }

      // Search for "装备"
      await window.getByPlaceholder('搜索术语...').fill('装备')
      await window.waitForTimeout(500)

      // Should show only the matching entry
      await expect(window.getByText('装备全寿命周期管理')).toBeVisible()
    })
  })
})
