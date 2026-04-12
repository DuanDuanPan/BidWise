import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Story 7.3 E2E: Adversarial Review Execution — review kickoff,
 * batch result rendering, finding actions, partial-failure retry,
 * and persisted session restore.
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
function buildLineup(projectId: string) {
  return {
    id: `lineup-e2e-7-3-${projectId}`,
    projectId,
    roles: JSON.stringify([
      {
        id: 'role-tech',
        name: '技术专家',
        perspective: '从技术架构角度挑战方案',
        attackFocus: '架构设计、性能瓶颈',
        intensity: 'high',
        sortOrder: 0,
        isProtected: false,
        description: '资深技术架构师',
      },
      {
        id: 'role-compliance',
        name: '合规审查官',
        perspective: '从合规角度审查方案',
        attackFocus: '法规遵从、数据安全',
        intensity: 'medium',
        sortOrder: 1,
        isProtected: true,
        description: '合规专员',
      },
      {
        id: 'role-cost',
        name: '成本分析师',
        perspective: '从成本角度质疑方案',
        attackFocus: '成本估算、ROI',
        intensity: 'low',
        sortOrder: 2,
        isProtected: false,
        description: '财务分析师',
      },
    ]),
    status: 'confirmed',
    generationSource: 'llm',
    warningMessage: null,
    generatedAt: NOW,
    confirmedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildCompletedSession(projectId: string, lineupId: string) {
  return {
    id: `session-e2e-7-3-${projectId}`,
    projectId,
    lineupId,
    status: 'completed',
    roleResults: JSON.stringify([
      { roleId: 'role-tech', roleName: '技术专家', status: 'success', findingCount: 2 },
      { roleId: 'role-compliance', roleName: '合规审查官', status: 'success', findingCount: 1 },
      { roleId: 'role-cost', roleName: '成本分析师', status: 'success', findingCount: 1 },
    ]),
    startedAt: NOW,
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildPartialSession(projectId: string, lineupId: string) {
  return {
    id: `session-partial-e2e-7-3-${projectId}`,
    projectId,
    lineupId,
    status: 'partial',
    roleResults: JSON.stringify([
      { roleId: 'role-tech', roleName: '技术专家', status: 'success', findingCount: 1 },
      {
        roleId: 'role-compliance',
        roleName: '合规审查官',
        status: 'failed',
        findingCount: 0,
        error: 'AI provider timeout after 60s',
      },
      { roleId: 'role-cost', roleName: '成本分析师', status: 'success', findingCount: 1 },
    ]),
    startedAt: NOW,
    completedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildFindings(sessionId: string) {
  return [
    {
      id: `finding-1-${sessionId}`,
      sessionId,
      roleId: 'role-tech',
      roleName: '技术专家',
      severity: 'critical',
      sectionRef: '第3章 系统架构',
      sectionLocator: null,
      content: '方案未说明容灾切换机制，单点故障风险高。',
      suggestion: '增加主备切换与故障恢复方案描述。',
      reasoning: '投标要求明确提出高可用 99.99% SLA。',
      status: 'pending',
      rebuttalReason: null,
      contradictionGroupId: null,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `finding-2-${sessionId}`,
      sessionId,
      roleId: 'role-tech',
      roleName: '技术专家',
      severity: 'major',
      sectionRef: '第5章 性能设计',
      sectionLocator: null,
      content: '并发处理能力未给出量化指标。',
      suggestion: '补充 TPS/QPS 压测数据。',
      reasoning: null,
      status: 'pending',
      rebuttalReason: null,
      contradictionGroupId: 'contradiction-1',
      sortOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `finding-3-${sessionId}`,
      sessionId,
      roleId: 'role-compliance',
      roleName: '合规审查官',
      severity: 'major',
      sectionRef: '第7章 数据安全',
      sectionLocator: null,
      content: '数据加密方案不满足等保三级要求。',
      suggestion: '采用国密 SM4 加密算法替代 AES。',
      reasoning: '等保三级要求使用国产密码算法。',
      status: 'pending',
      rebuttalReason: null,
      contradictionGroupId: 'contradiction-1',
      sortOrder: 2,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: `finding-4-${sessionId}`,
      sessionId,
      roleId: 'role-cost',
      roleName: '成本分析师',
      severity: 'minor',
      sectionRef: '第9章 报价',
      sectionLocator: null,
      content: '运维成本估算偏低，未考虑人员培训费用。',
      suggestion: '补充年度培训费用约 15 万元。',
      reasoning: null,
      status: 'pending',
      rebuttalReason: null,
      contradictionGroupId: null,
      sortOrder: 3,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]
}

// ─── Helpers ───

async function launchApp(existingHome?: string): Promise<LaunchContext> {
  const sandboxHome = existingHome ?? (await mkdtemp(join(tmpdir(), 'bidwise-story-7-3-')))
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

  // Create a project via IPC
  const result = await window.evaluate(async () => {
    const api = (window as unknown as { api: AnyApi }).api
    const res = await api.projectCreate({ name: 'E2E Story 7.3 Review Test' })
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

function seedLineup(db: DatabaseSync, lineup: ReturnType<typeof buildLineup>): void {
  db.prepare('DELETE FROM adversarial_lineups WHERE project_id = ?').run(lineup.projectId)
  db.prepare(
    `INSERT INTO adversarial_lineups
     (id, project_id, roles, status, generation_source, warning_message, generated_at, confirmed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lineup.id,
    lineup.projectId,
    lineup.roles,
    lineup.status,
    lineup.generationSource,
    lineup.warningMessage,
    lineup.generatedAt,
    lineup.confirmedAt,
    lineup.createdAt,
    lineup.updatedAt
  )
}

function seedSession(
  db: DatabaseSync,
  session: ReturnType<typeof buildCompletedSession> | ReturnType<typeof buildPartialSession>
): void {
  db.prepare('DELETE FROM adversarial_review_sessions WHERE project_id = ?').run(session.projectId)
  db.prepare(
    `INSERT INTO adversarial_review_sessions
     (id, project_id, lineup_id, status, role_results, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    session.id,
    session.projectId,
    session.lineupId,
    session.status,
    session.roleResults,
    session.startedAt,
    session.completedAt,
    session.createdAt,
    session.updatedAt
  )
}

function seedFindings(db: DatabaseSync, findings: ReturnType<typeof buildFindings>): void {
  const stmt = db.prepare(
    `INSERT INTO adversarial_findings
     (id, session_id, role_id, role_name, severity, section_ref, section_locator, content, suggestion, reasoning, status, rebuttal_reason, contradiction_group_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const f of findings) {
    stmt.run(
      f.id,
      f.sessionId,
      f.roleId,
      f.roleName,
      f.severity,
      f.sectionRef,
      f.sectionLocator,
      f.content,
      f.suggestion,
      f.reasoning,
      f.status,
      f.rebuttalReason,
      f.contradictionGroupId,
      f.sortOrder,
      f.createdAt,
      f.updatedAt
    )
  }
}

async function navigateToComplianceReview(window: Page, projectId: string): Promise<void> {
  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)
  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })

  const sopTab = window.getByTestId('sop-stage-compliance-review')
  await expect(sopTab).toBeVisible({ timeout: 10_000 })
  await sopTab.click()
}

// ─── Tests ───

test.describe('Story 7.3 Adversarial Review Execution E2E', () => {
  test('@story-7-3 @p0 renders batch review results with correct severity sort order (AC2)', async () => {
    const ctx = await launchApp()
    try {
      // Seed lineup + completed session + findings into DB
      const lineup = buildLineup(ctx.projectId)
      const session = buildCompletedSession(ctx.projectId, lineup.id)
      const findings = buildFindings(session.id)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedLineup(db, lineup)
        seedSession(db, session)
        seedFindings(db, findings)
      } finally {
        db.close()
      }

      // Relaunch to load seeded data
      const reCtx = await launchApp(ctx.sandboxHome)
      // Update projectId reference (same project, new app instance)
      try {
        await navigateToComplianceReview(reCtx.window, ctx.projectId)

        // The review panel should auto-open since session is in terminal state (completed)
        // If not auto-opened, click "查看评审结果" button
        const resultsPanel = reCtx.window.getByTestId('review-panel-results')
        const executionBtn = reCtx.window.getByTestId('review-execution-btn')

        // Wait for either the panel or the button to appear
        await expect(resultsPanel.or(executionBtn)).toBeVisible({ timeout: 30_000 })

        if (await executionBtn.isVisible().catch(() => false)) {
          // Button should say "查看评审结果" for completed session
          await expect(executionBtn).toContainText('查看评审结果')
          await executionBtn.click()
        }

        await expect(resultsPanel).toBeVisible({ timeout: 15_000 })

        // Verify stats bar shows correct counts
        const statsBar = reCtx.window.getByTestId('review-stats-bar')
        await expect(statsBar).toBeVisible()
        await expect(statsBar).toContainText('4 条攻击发现')
        await expect(statsBar).toContainText('critical: 1')
        await expect(statsBar).toContainText('major: 2')
        await expect(statsBar).toContainText('minor: 1')

        // Verify findings are rendered — all 4 cards visible
        for (const f of findings) {
          await expect(reCtx.window.getByTestId(`finding-card-${f.id}`)).toBeVisible()
        }

        // Verify severity sort order: critical first, then major, then minor
        const severities = await reCtx.window
          .locator('[data-finding-severity]')
          .evaluateAll((els) => els.map((el) => el.getAttribute('data-finding-severity')))
        expect(severities).toEqual(['critical', 'major', 'major', 'minor'])

        // Verify contradiction marker is present on the grouped findings
        await expect(reCtx.window.getByText('⚡ 矛盾').first()).toBeVisible()
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-3 @p0 finding actions: accept, reject with rebuttal, needs-decision (AC3)', async () => {
    const ctx = await launchApp()
    try {
      const lineup = buildLineup(ctx.projectId)
      const session = buildCompletedSession(ctx.projectId, lineup.id)
      const findings = buildFindings(session.id)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedLineup(db, lineup)
        seedSession(db, session)
        seedFindings(db, findings)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToComplianceReview(reCtx.window, ctx.projectId)

        // Open results panel
        const resultsPanel = reCtx.window.getByTestId('review-panel-results')
        const executionBtn = reCtx.window.getByTestId('review-execution-btn')
        await expect(resultsPanel.or(executionBtn)).toBeVisible({ timeout: 30_000 })
        if (await executionBtn.isVisible().catch(() => false)) {
          await executionBtn.click()
        }
        await expect(resultsPanel).toBeVisible({ timeout: 15_000 })

        // ── AC3.1: Accept a finding ──
        const criticalCard = reCtx.window.getByTestId(`finding-card-${findings[0].id}`)
        await expect(criticalCard).toBeVisible()
        await criticalCard.getByTestId('finding-action-accept').click()

        // Card should transition to accepted status
        await expect(criticalCard).toHaveAttribute('data-finding-status', 'accepted')

        // ── AC3.2: Reject a finding with rebuttal ──
        const majorCard = reCtx.window.getByTestId(`finding-card-${findings[1].id}`)
        await expect(majorCard).toBeVisible()

        // First click opens the rebuttal textarea
        await majorCard.getByTestId('finding-action-reject').click()
        const rebuttalInput = majorCard.getByTestId('finding-rebuttal-input')
        await expect(rebuttalInput).toBeVisible()

        // Fill rebuttal reason and submit
        await rebuttalInput.fill('已在附件中提供压测报告，TPS 达到 5000。')
        await majorCard.getByTestId('finding-action-reject').click()

        // Card should transition to rejected status
        await expect(majorCard).toHaveAttribute('data-finding-status', 'rejected')

        // ── AC3.3: Needs-decision action ──
        const complianceCard = reCtx.window.getByTestId(`finding-card-${findings[2].id}`)
        await expect(complianceCard).toBeVisible()
        await complianceCard.getByTestId('finding-action-needs-decision').click()

        // Card should transition to needs-decision status
        await expect(complianceCard).toHaveAttribute('data-finding-status', 'needs-decision')

        // Verify the status labels are visible on handled cards
        await expect(criticalCard.getByText('✓ 已接受')).toBeVisible()
        await expect(majorCard.getByText('✗ 已反驳')).toBeVisible()
        await expect(complianceCard.getByText('⏳ 待决策')).toBeVisible()
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-3 @p1 partial failure shows failed role alert with retry button (AC4)', async () => {
    const ctx = await launchApp()
    try {
      const lineup = buildLineup(ctx.projectId)
      const session = buildPartialSession(ctx.projectId, lineup.id)
      // Only seed findings for successful roles (tech + cost)
      const allFindings = buildFindings(session.id)
      const partialFindings = allFindings.filter(
        (f) => f.roleId === 'role-tech' || f.roleId === 'role-cost'
      )

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedLineup(db, lineup)
        seedSession(db, session)
        seedFindings(db, partialFindings)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToComplianceReview(reCtx.window, ctx.projectId)

        // Open results panel
        const resultsPanel = reCtx.window.getByTestId('review-panel-results')
        const executionBtn = reCtx.window.getByTestId('review-execution-btn')
        await expect(resultsPanel.or(executionBtn)).toBeVisible({ timeout: 30_000 })
        if (await executionBtn.isVisible().catch(() => false)) {
          await executionBtn.click()
        }
        await expect(resultsPanel).toBeVisible({ timeout: 15_000 })

        // Verify failed role alert for compliance reviewer
        const failedAlert = reCtx.window.getByTestId('failed-role-alert-role-compliance')
        await expect(failedAlert).toBeVisible()
        await expect(failedAlert).toContainText('合规审查官')
        await expect(failedAlert).toContainText('评审失败')

        // Verify retry button is present
        const retryBtn = failedAlert.getByTestId('failed-role-retry-btn')
        await expect(retryBtn).toBeVisible()
        await expect(retryBtn).toContainText('重试')

        // Verify successful role findings are still displayed
        for (const f of partialFindings) {
          await expect(reCtx.window.getByTestId(`finding-card-${f.id}`)).toBeVisible()
        }

        // Stats bar should only count findings from successful roles
        const statsBar = reCtx.window.getByTestId('review-stats-bar')
        await expect(statsBar).toContainText(`${partialFindings.length} 条攻击发现`)
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-3 @p0 persisted session restores findings and user actions on relaunch (AC5)', async () => {
    const ctx = await launchApp()
    try {
      const lineup = buildLineup(ctx.projectId)
      const session = buildCompletedSession(ctx.projectId, lineup.id)
      const findings = buildFindings(session.id)
      // Pre-set some findings as already handled to test action state restore
      findings[0].status = 'accepted'
      findings[1].status = 'rejected'
      findings[1].rebuttalReason = '已有压测数据支撑'

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedLineup(db, lineup)
        seedSession(db, session)
        seedFindings(db, findings)
      } finally {
        db.close()
      }

      // First launch — verify session loads
      const firstCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToComplianceReview(firstCtx.window, ctx.projectId)

        const resultsPanel = firstCtx.window.getByTestId('review-panel-results')
        const executionBtn = firstCtx.window.getByTestId('review-execution-btn')
        await expect(resultsPanel.or(executionBtn)).toBeVisible({ timeout: 30_000 })
        if (await executionBtn.isVisible().catch(() => false)) {
          await executionBtn.click()
        }
        await expect(resultsPanel).toBeVisible({ timeout: 15_000 })

        // Verify pre-set statuses are rendered
        await expect(firstCtx.window.getByTestId(`finding-card-${findings[0].id}`)).toHaveAttribute(
          'data-finding-status',
          'accepted'
        )
        await expect(firstCtx.window.getByTestId(`finding-card-${findings[1].id}`)).toHaveAttribute(
          'data-finding-status',
          'rejected'
        )

        // Perform a new action — mark finding-3 as needs-decision
        const pendingCard = firstCtx.window.getByTestId(`finding-card-${findings[2].id}`)
        await expect(pendingCard).toHaveAttribute('data-finding-status', 'pending')
        await pendingCard.getByTestId('finding-action-needs-decision').click()
        await expect(pendingCard).toHaveAttribute('data-finding-status', 'needs-decision')
      } finally {
        await closeApp(firstCtx)
      }

      // Second launch — verify persistence across restart
      const secondCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToComplianceReview(secondCtx.window, ctx.projectId)

        const resultsPanel = secondCtx.window.getByTestId('review-panel-results')
        const executionBtn = secondCtx.window.getByTestId('review-execution-btn')
        await expect(resultsPanel.or(executionBtn)).toBeVisible({ timeout: 30_000 })
        if (await executionBtn.isVisible().catch(() => false)) {
          await executionBtn.click()
        }
        await expect(resultsPanel).toBeVisible({ timeout: 15_000 })

        // All three handled statuses should be persisted
        await expect(
          secondCtx.window.getByTestId(`finding-card-${findings[0].id}`)
        ).toHaveAttribute('data-finding-status', 'accepted')
        await expect(
          secondCtx.window.getByTestId(`finding-card-${findings[1].id}`)
        ).toHaveAttribute('data-finding-status', 'rejected')
        await expect(
          secondCtx.window.getByTestId(`finding-card-${findings[2].id}`)
        ).toHaveAttribute('data-finding-status', 'needs-decision')

        // Finding-4 should still be pending
        await expect(
          secondCtx.window.getByTestId(`finding-card-${findings[3].id}`)
        ).toHaveAttribute('data-finding-status', 'pending')
      } finally {
        await closeApp(secondCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })

  test('@story-7-3 @p0 confirmed lineup shows execution trigger button (AC1)', async () => {
    const ctx = await launchApp()
    try {
      const lineup = buildLineup(ctx.projectId)

      await closeApp(ctx)

      const db = openDb(ctx.userDataPath)
      try {
        seedLineup(db, lineup)
      } finally {
        db.close()
      }

      const reCtx = await launchApp(ctx.sandboxHome)
      try {
        await navigateToComplianceReview(reCtx.window, ctx.projectId)

        // The execution trigger button should be visible with confirmed lineup
        const executionBtn = reCtx.window.getByTestId('review-execution-btn')
        await expect(executionBtn).toBeVisible({ timeout: 30_000 })
        await expect(executionBtn).toContainText('启动对抗评审')
      } finally {
        await closeApp(reCtx)
      }
    } finally {
      await cleanupHome(ctx.sandboxHome)
    }
  })
})
