import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Story 7.5 E2E: Pre-Review Attack Checklist — panel rendering,
 * severity sort, item status tracking, progress bar, fallback
 * warning, and persistence across restart.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApi = Record<string, (...args: any[]) => any>

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

type LaunchContext = {
  electronApp: ElectronApplication
  window: Page
  sandboxHome: string
  userDataPath: string
  projectId: string
}

test.setTimeout(120_000)

// ─── Test data builders ───

const NOW = '2026-04-12T09:00:00.000Z'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildChecklist(
  projectId: string,
  overrides?: { generationSource?: string; warningMessage?: string | null }
) {
  return {
    id: `checklist-e2e-7-5-${projectId}`,
    projectId,
    status: 'generated',
    generationSource: overrides?.generationSource ?? 'llm',
    warningMessage: overrides?.warningMessage ?? null,
    generatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildItems(checklistId: string) {
  return [
    {
      id: `item-1-${checklistId}`,
      checklistId,
      category: '技术方案',
      attackAngle: '方案未说明容灾切换机制，单点故障风险高，投标要求明确提出高可用 99.99% SLA。',
      severity: 'critical',
      defenseSuggestion: '增加主备切换与故障恢复方案描述，引用历史项目的可用性数据。',
      targetSection: '第3章 系统架构',
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `item-2-${checklistId}`,
      checklistId,
      category: '性能设计',
      attackAngle: '并发处理能力未给出量化指标，缺少压测数据支撑。',
      severity: 'major',
      defenseSuggestion: '补充 TPS/QPS 压测数据，附上第三方测试报告。',
      targetSection: '第5章 性能设计',
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `item-3-${checklistId}`,
      checklistId,
      category: '合规性',
      attackAngle: '数据加密方案不满足等保三级要求，未采用国密算法。',
      severity: 'major',
      defenseSuggestion: '采用国密 SM4 加密算法替代 AES，并出具合规证明。',
      targetSection: '第7章 数据安全',
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `item-4-${checklistId}`,
      checklistId,
      category: '成本控制',
      attackAngle: '运维成本估算偏低，未考虑人员培训费用。',
      severity: 'minor',
      defenseSuggestion: '补充年度培训费用约 15 万元，细化运维人力成本。',
      targetSection: '第9章 报价',
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 3,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `item-5-${checklistId}`,
      checklistId,
      category: '实施计划',
      attackAngle: '实施周期过于乐观，未预留风险缓冲时间。',
      severity: 'minor',
      defenseSuggestion: '增加 15% 风险缓冲期，标注里程碑交付条件。',
      targetSection: null,
      targetSectionLocator: null,
      status: 'unaddressed',
      sortOrder: 4,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]
}

// ─── Helpers ───

async function launchApp(existingHome?: string): Promise<LaunchContext> {
  const sandboxHome = existingHome ?? (await mkdtemp(join(tmpdir(), 'bidwise-story-7-5-')))
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

  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: AnyApi }).api
    const res = await api.projectCreate({ name: 'E2E Story 7.5 Attack Checklist Test' })
    if (!res.success) throw new Error(res.error.message)
    return res.data.id as string
  })

  return { electronApp, window, sandboxHome, userDataPath, projectId: result }
}

async function closeApp(ctx: { electronApp: ElectronApplication }): Promise<void> {
  await ctx.electronApp.close()
}

async function cleanupHome(sandboxHome: string): Promise<void> {
  await rm(sandboxHome, { recursive: true, force: true })
}

function openDb(userDataPath: string): DatabaseSync {
  const dbPath = join(userDataPath, 'data', 'db', 'bidwise.sqlite')
  return new DatabaseSync(dbPath)
}

function seedChecklist(db: DatabaseSync, checklist: ReturnType<typeof buildChecklist>): void {
  db.prepare('DELETE FROM attack_checklists WHERE project_id = ?').run(checklist.projectId)
  db.prepare(
    `INSERT INTO attack_checklists
     (id, project_id, status, generation_source, warning_message, generated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    checklist.id,
    checklist.projectId,
    checklist.status,
    checklist.generationSource,
    checklist.warningMessage,
    checklist.generatedAt,
    checklist.createdAt,
    checklist.updatedAt
  )
}

function seedItems(db: DatabaseSync, items: ReturnType<typeof buildItems>): void {
  const stmt = db.prepare(
    `INSERT INTO attack_checklist_items
     (id, checklist_id, category, attack_angle, severity, defense_suggestion, target_section, target_section_locator, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const item of items) {
    stmt.run(
      item.id,
      item.checklistId,
      item.category,
      item.attackAngle,
      item.severity,
      item.defenseSuggestion,
      item.targetSection,
      item.targetSectionLocator,
      item.status,
      item.sortOrder,
      item.createdAt,
      item.updatedAt
    )
  }
}

async function navigateToProposalWriting(window: Page, projectId: string): Promise<void> {
  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)
  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  const sopTab = window.getByTestId('sop-stage-proposal-writing')
  if (await sopTab.isVisible().catch(() => false)) {
    await sopTab.click()
  }
}

// ─── Tests ───

test.describe('Story 7.5 Pre-Review Attack Checklist E2E', () => {
  test('@story-7-5 @p0 renders attack checklist panel with severity-sorted items and progress bar (AC2, AC4)', async () => {
    const ctx = await launchApp()
    try {
      const checklist = buildChecklist(ctx.projectId)
      const items = buildItems(checklist.id)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedChecklist(db, checklist)
        seedItems(db, items)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToProposalWriting(reCtx.window, ctx.projectId)

        // Panel should be visible in proposal-writing stage (expanded by default)
        const panel = reCtx.window.getByTestId('attack-checklist-panel')
        await expect(panel).toBeVisible({ timeout: 30_000 })

        // Header should show badge with 0/5 (none addressed)
        const badge = reCtx.window.getByTestId('checklist-badge')
        await expect(badge).toBeVisible()
        await expect(badge).toContainText('0/5')

        // Progress bar should be visible showing 0%
        const progressBar = reCtx.window.getByTestId('progress-bar')
        await expect(progressBar).toBeVisible()

        // Progress text: "已防御 0 / 共 5 条"
        await expect(panel).toContainText('已防御 0 / 共 5 条')

        // All 5 item cards should be visible
        const itemCards = reCtx.window.locator('[data-testid="attack-checklist-item-card"]')
        await expect(itemCards).toHaveCount(5)

        // Verify severity sort: critical first, then major×2, then minor×2
        const severities = await itemCards.evaluateAll((els) =>
          els.map((el) => {
            const badge = el.querySelector('[data-testid="severity-badge"]')
            return badge?.textContent?.trim() ?? ''
          })
        )
        expect(severities).toEqual(['严重', '重要', '重要', '轻微', '轻微'])

        // First item should show target section link
        const firstCard = itemCards.first()
        await expect(firstCard.getByTestId('target-section-link')).toContainText('第3章 系统架构')

        // Click first item to expand — verify defense suggestion appears
        await firstCard.click()
        await expect(firstCard.getByTestId('defense-suggestion')).toBeVisible()
        await expect(firstCard.getByTestId('defense-suggestion')).toContainText('增加主备切换')
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-5 @p0 item status tracking: address and dismiss update badge and visibility (AC3)', async () => {
    const ctx = await launchApp()
    try {
      const checklist = buildChecklist(ctx.projectId)
      const items = buildItems(checklist.id)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedChecklist(db, checklist)
        seedItems(db, items)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToProposalWriting(reCtx.window, ctx.projectId)

        const panel = reCtx.window.getByTestId('attack-checklist-panel')
        await expect(panel).toBeVisible({ timeout: 30_000 })

        // ── Mark first item (critical) as addressed ──
        const firstCard = reCtx.window.locator('[data-testid="attack-checklist-item-card"]').first()
        await expect(firstCard).toHaveAttribute('data-status', 'unaddressed')

        // Click address button (stop propagation prevents expand)
        await firstCard.getByTestId('address-button').click()

        // Card should now show addressed status
        await expect(firstCard).toHaveAttribute('data-status', 'addressed')
        await expect(firstCard.getByTestId('addressed-label')).toBeVisible()

        // Badge should update to 1/5
        await expect(reCtx.window.getByTestId('checklist-badge')).toContainText('1/5')

        // Progress text should update
        await expect(panel).toContainText('已防御 1 / 共 5 条')

        // ── Dismiss last item (minor) ──
        // The last visible unaddressed card — item-5 (实施计划)
        const lastCard = reCtx.window
          .locator('[data-testid="attack-checklist-item-card"][data-status="unaddressed"]')
          .last()
        await lastCard.getByTestId('dismiss-button').click()

        // Dismissed item should disappear from default view
        await expect(lastCard).toHaveAttribute('data-status', 'dismissed')
        // After dismiss, it hides; visible items should be 4 (1 addressed + 3 unaddressed)
        const visibleCards = reCtx.window.locator('[data-testid="attack-checklist-item-card"]')
        await expect(visibleCards).toHaveCount(4)

        // Badge should show 1/4 (dismissed excluded from total)
        await expect(reCtx.window.getByTestId('checklist-badge')).toContainText('1/4')

        // ── Toggle "show all" to reveal dismissed item ──
        const showAllSwitch = reCtx.window.getByTestId('show-all-switch')
        await showAllSwitch.click()

        // Now all 5 items should be visible again
        await expect(visibleCards).toHaveCount(5)

        // Dismissed item should have dismissed-label
        const dismissedCard = reCtx.window.locator(
          '[data-testid="attack-checklist-item-card"][data-status="dismissed"]'
        )
        await expect(dismissedCard).toHaveCount(1)
        await expect(dismissedCard.getByTestId('dismissed-label')).toBeVisible()
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-5 @p0 persisted checklist and item statuses restore on relaunch (AC5)', async () => {
    const ctx = await launchApp()
    try {
      const checklist = buildChecklist(ctx.projectId)
      const items = buildItems(checklist.id)
      // Pre-set some statuses for persistence verification
      items[0].status = 'addressed'
      items[4].status = 'dismissed'

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedChecklist(db, checklist)
        seedItems(db, items)
      } finally {
        db.close()
      }

      // First launch — verify seeded statuses and perform an action
      const firstCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToProposalWriting(firstCtx.window, ctx.projectId)

        const panel = firstCtx.window.getByTestId('attack-checklist-panel')
        await expect(panel).toBeVisible({ timeout: 30_000 })

        // Addressed item should have correct status
        const addressedCard = firstCtx.window.locator(
          `[data-testid="attack-checklist-item-card"][data-item-id="${items[0].id}"]`
        )
        await expect(addressedCard).toHaveAttribute('data-status', 'addressed')

        // Badge shows 1/4 (1 addressed, 1 dismissed excluded from total)
        await expect(firstCtx.window.getByTestId('checklist-badge')).toContainText('1/4')

        // Address another item to test that new actions also persist
        const unaddressedCard = firstCtx.window.locator(
          `[data-testid="attack-checklist-item-card"][data-item-id="${items[1].id}"]`
        )
        await expect(unaddressedCard).toHaveAttribute('data-status', 'unaddressed')
        await unaddressedCard.getByTestId('address-button').click()
        await expect(unaddressedCard).toHaveAttribute('data-status', 'addressed')

        // Badge should now be 2/4
        await expect(firstCtx.window.getByTestId('checklist-badge')).toContainText('2/4')
      } finally {
        await closeApp(firstCtx)
      }

      // Second launch — verify all statuses persisted
      const secondCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToProposalWriting(secondCtx.window, ctx.projectId)

        const panel = secondCtx.window.getByTestId('attack-checklist-panel')
        await expect(panel).toBeVisible({ timeout: 30_000 })

        // Both addressed items should still be addressed
        await expect(
          secondCtx.window.locator(
            `[data-testid="attack-checklist-item-card"][data-item-id="${items[0].id}"]`
          )
        ).toHaveAttribute('data-status', 'addressed')
        await expect(
          secondCtx.window.locator(
            `[data-testid="attack-checklist-item-card"][data-item-id="${items[1].id}"]`
          )
        ).toHaveAttribute('data-status', 'addressed')

        // Remaining items should still be unaddressed
        await expect(
          secondCtx.window.locator(
            `[data-testid="attack-checklist-item-card"][data-item-id="${items[2].id}"]`
          )
        ).toHaveAttribute('data-status', 'unaddressed')

        // Badge still 2/4
        await expect(secondCtx.window.getByTestId('checklist-badge')).toContainText('2/4')

        // Toggle show-all to verify dismissed item persisted
        await secondCtx.window.getByTestId('show-all-switch').click()
        await expect(
          secondCtx.window.locator(
            `[data-testid="attack-checklist-item-card"][data-item-id="${items[4].id}"]`
          )
        ).toHaveAttribute('data-status', 'dismissed')
      } finally {
        await closeApp(secondCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-5 @p1 fallback checklist shows warning alert (AC1 fallback)', async () => {
    const ctx = await launchApp()
    try {
      const checklist = buildChecklist(ctx.projectId, {
        generationSource: 'fallback',
        warningMessage: 'AI 生成失败，已使用通用攻击清单',
      })
      const items = buildItems(checklist.id)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedChecklist(db, checklist)
        seedItems(db, items)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToProposalWriting(reCtx.window, ctx.projectId)

        const panel = reCtx.window.getByTestId('attack-checklist-panel')
        await expect(panel).toBeVisible({ timeout: 30_000 })

        // Fallback warning should be displayed
        const warning = reCtx.window.getByTestId('fallback-warning')
        await expect(warning).toBeVisible()
        await expect(warning).toContainText('AI 生成失败，已使用通用攻击清单')

        // Items should still render
        const itemCards = reCtx.window.locator('[data-testid="attack-checklist-item-card"]')
        await expect(itemCards).toHaveCount(5)
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-5 @p1 empty state shows guidance text and generate button (AC2 empty)', async () => {
    const ctx = await launchApp()
    try {
      // Don't seed any checklist — navigate to proposal-writing with no data
      await navigateToProposalWriting(ctx.window, ctx.projectId)

      const panel = ctx.window.getByTestId('attack-checklist-panel')
      await expect(panel).toBeVisible({ timeout: 30_000 })

      // Empty state should show guidance text
      const emptyState = ctx.window.getByTestId('checklist-empty')
      await expect(emptyState).toBeVisible()
      await expect(emptyState).toContainText('尚未生成攻击清单')
      await expect(emptyState).toContainText('让 AI 帮您提前发现方案薄弱点')

      // Generate button should be present
      const generateBtn = ctx.window.getByTestId('generate-checklist-button')
      await expect(generateBtn).toBeVisible()
      await expect(generateBtn).toContainText('生成攻击清单')
    } finally {
      await closeApp(ctx)
      await cleanupHome(ctx.sandboxHome)
    }
  })
})
