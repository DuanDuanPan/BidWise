import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

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

type SeedRecord = {
  id: string
  title: string
  reasoning: string
  suggestion: string
  sourceExcerpt: string
  confidence: number
  status: 'pending' | 'confirmed' | 'adjusted'
  createdAt: string
  updatedAt: string
}

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')
const ANALYSIS_TIMESTAMP = '2026-04-01T09:00:00.000Z'
const SEEDED_SOURCE_MATERIAL =
  '客户会议纪要：客户高度关注数据安全合规，并对上一家供应商的性能稳定性表示不满。'

test.setTimeout(120_000)

async function launchStoryApp(existingHome?: string): Promise<LaunchContext> {
  const sandboxHome = existingHome ?? (await mkdtemp(join(tmpdir(), 'bidwise-story-2-7-')))
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
    },
  })

  const window = await electronApp.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await expect(window).toHaveTitle('BidWise')
  await expect(window.getByTestId('project-kanban')).toBeVisible({ timeout: 30_000 })

  const userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))

  return { electronApp, window, sandboxHome, userDataPath }
}

async function closeStoryApp(ctx: LaunchContext): Promise<void> {
  await ctx.electronApp.close()
}

async function cleanupStoryHome(sandboxHome: string): Promise<void> {
  await rm(sandboxHome, { recursive: true, force: true })
}

async function createProject(window: Page, name: string): Promise<SeededProject> {
  return window.evaluate(
    async ({ projectName }) => {
      const createResponse = await window.api.projectCreate({
        name: projectName,
        proposalType: 'presale-technical',
      })
      if (!createResponse.success) {
        throw new Error(createResponse.error.message)
      }

      const getResponse = await window.api.projectGet(createResponse.data.id)
      if (!getResponse.success || !getResponse.data.rootPath) {
        throw new Error(getResponse.success ? '项目根目录不存在' : getResponse.error.message)
      }

      return {
        id: getResponse.data.id,
        name: getResponse.data.name,
        rootPath: getResponse.data.rootPath,
      }
    },
    { projectName: name }
  )
}

async function navigateToProject(window: Page, projectId: string): Promise<void> {
  await window.evaluate((id) => {
    window.location.hash = `#/project/${id}`
  }, projectId)

  await expect(window.getByTestId('project-workspace')).toBeVisible({ timeout: 30_000 })
  await expect(window.getByTestId('analysis-view')).toBeVisible({ timeout: 30_000 })
}

function buildSeededAnalysis(projectId: string): {
  parsedTender: Record<string, unknown>
  requirements: Array<{
    id: string
    sequenceNumber: number
    description: string
    sourcePages: number[]
    category: string
    priority: string
    status: string
  }>
  scoringModel: Record<string, unknown>
  mandatoryItems: Array<{
    id: string
    content: string
    sourceText: string
    sourcePages: number[]
    confidence: number
    status: string
    linkedRequirementId: string | null
    detectedAt: string
    updatedAt: string
  }>
} {
  const parsedTender = {
    meta: {
      originalFileName: 'story-2-7-sample.pdf',
      format: 'pdf',
      fileSize: 4096,
      pageCount: 5,
      importedAt: ANALYSIS_TIMESTAMP,
    },
    sections: [
      {
        id: 'section-1',
        title: '需求摘要',
        content: '系统需满足数据安全、性能稳定和快速交付等要求。',
        pageStart: 1,
        pageEnd: 3,
        level: 1,
      },
    ],
    rawText: '系统需满足数据安全、性能稳定和快速交付等要求。',
    totalPages: 5,
    hasScannedContent: false,
  }

  const requirements = [
    {
      id: `${projectId}-req-story-2-7-1`,
      sequenceNumber: 1,
      description: '平台需支持国密算法与审计留痕。',
      sourcePages: [2],
      category: 'technical',
      priority: 'high',
      status: 'confirmed',
    },
    {
      id: `${projectId}-req-story-2-7-2`,
      sequenceNumber: 2,
      description: '实施方案需覆盖三个月内上线的排期保障。',
      sourcePages: [4],
      category: 'implementation',
      priority: 'high',
      status: 'confirmed',
    },
  ]

  const scoringModel = {
    projectId,
    totalScore: 100,
    criteria: [
      {
        id: `${projectId}-criterion-story-2-7-1`,
        category: '技术方案',
        maxScore: 50,
        weight: 0.5,
        subItems: [],
        reasoning: '客户更看重方案在安全与性能上的落地能力。',
        status: 'confirmed',
      },
      {
        id: `${projectId}-criterion-story-2-7-2`,
        category: '实施保障',
        maxScore: 30,
        weight: 0.3,
        subItems: [],
        reasoning: '交付周期和实施把控能力是决策重点。',
        status: 'confirmed',
      },
      {
        id: `${projectId}-criterion-story-2-7-3`,
        category: '服务能力',
        maxScore: 20,
        weight: 0.2,
        subItems: [],
        reasoning: '服务保障影响客户的长期合作信心。',
        status: 'confirmed',
      },
    ],
    extractedAt: ANALYSIS_TIMESTAMP,
    confirmedAt: ANALYSIS_TIMESTAMP,
    version: 1,
  }

  const mandatoryItems = [
    {
      id: `${projectId}-mandatory-story-2-7-1`,
      content: '需提供项目经理到岗承诺',
      sourceText: '项目经理必须在中标后 3 日内到岗。',
      sourcePages: [4],
      confidence: 0.93,
      status: 'confirmed',
      linkedRequirementId: `${projectId}-req-story-2-7-2`,
      detectedAt: ANALYSIS_TIMESTAMP,
      updatedAt: ANALYSIS_TIMESTAMP,
    },
  ]

  return { parsedTender, requirements, scoringModel, mandatoryItems }
}

async function seedAnalysisContext(userDataPath: string, project: SeededProject): Promise<void> {
  const { parsedTender, requirements, scoringModel, mandatoryItems } = buildSeededAnalysis(
    project.id
  )
  const tenderDir = join(project.rootPath, 'tender')
  await mkdir(tenderDir, { recursive: true })
  await writeFile(
    join(tenderDir, 'tender-parsed.json'),
    JSON.stringify(parsedTender, null, 2),
    'utf-8'
  )
  await writeFile(
    join(tenderDir, 'scoring-model.json'),
    JSON.stringify(scoringModel, null, 2),
    'utf-8'
  )
  await writeFile(
    join(tenderDir, 'mandatory-items.json'),
    JSON.stringify(
      {
        projectId: project.id,
        items: mandatoryItems,
        detectedAt: ANALYSIS_TIMESTAMP,
      },
      null,
      2
    ),
    'utf-8'
  )

  const dbPath = join(userDataPath, 'data', 'db', 'bidwise.sqlite')
  const db = new DatabaseSync(dbPath)

  try {
    db.prepare('DELETE FROM requirements WHERE project_id = ?').run(project.id)
    db.prepare('DELETE FROM scoring_models WHERE project_id = ?').run(project.id)
    db.prepare('DELETE FROM mandatory_items WHERE project_id = ?').run(project.id)
    db.prepare('DELETE FROM strategy_seeds WHERE project_id = ?').run(project.id)

    const insertRequirement = db.prepare(`
      INSERT INTO requirements (
        id, project_id, sequence_number, description, source_pages, category, priority, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const requirement of requirements) {
      insertRequirement.run(
        requirement.id,
        project.id,
        requirement.sequenceNumber,
        requirement.description,
        JSON.stringify(requirement.sourcePages),
        requirement.category,
        requirement.priority,
        requirement.status,
        ANALYSIS_TIMESTAMP,
        ANALYSIS_TIMESTAMP
      )
    }

    db.prepare(
      `
      INSERT INTO scoring_models (
        id, project_id, total_score, criteria, extracted_at, confirmed_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      `${project.id}-scoring-model-story-2-7`,
      project.id,
      scoringModel.totalScore,
      JSON.stringify(scoringModel.criteria),
      scoringModel.extractedAt,
      scoringModel.confirmedAt,
      scoringModel.version,
      ANALYSIS_TIMESTAMP,
      ANALYSIS_TIMESTAMP
    )

    const insertMandatory = db.prepare(`
      INSERT INTO mandatory_items (
        id, project_id, content, source_text, source_pages, confidence, status, linked_requirement_id, detected_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const item of mandatoryItems) {
      insertMandatory.run(
        item.id,
        project.id,
        item.content,
        item.sourceText,
        JSON.stringify(item.sourcePages),
        item.confidence,
        item.status,
        item.linkedRequirementId,
        item.detectedAt,
        item.updatedAt
      )
    }
  } finally {
    db.close()
  }
}

async function seedStrategySeeds(
  userDataPath: string,
  project: SeededProject,
  seeds: SeedRecord[],
  sourceMaterial = SEEDED_SOURCE_MATERIAL
): Promise<void> {
  const dbPath = join(userDataPath, 'data', 'db', 'bidwise.sqlite')
  const db = new DatabaseSync(dbPath)

  try {
    db.prepare('DELETE FROM strategy_seeds WHERE project_id = ?').run(project.id)

    const insertSeed = db.prepare(`
      INSERT INTO strategy_seeds (
        id, project_id, title, reasoning, suggestion, source_excerpt, confidence, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const seed of seeds) {
      insertSeed.run(
        seed.id,
        project.id,
        seed.title,
        seed.reasoning,
        seed.suggestion,
        seed.sourceExcerpt,
        seed.confidence,
        seed.status,
        seed.createdAt,
        seed.updatedAt
      )
    }
  } finally {
    db.close()
  }

  await writeFile(
    join(project.rootPath, 'seed.json'),
    JSON.stringify(
      {
        projectId: project.id,
        sourceMaterial,
        seeds,
        generatedAt: ANALYSIS_TIMESTAMP,
        updatedAt: ANALYSIS_TIMESTAMP,
      },
      null,
      2
    ),
    'utf-8'
  )
}

function buildSeedRecords(projectId: string): SeedRecord[] {
  return [
    {
      id: `${projectId}-seed-story-2-7-1`,
      title: '数据安全合规优先级高',
      reasoning: '客户多次强调数据安全与国密算法，说明合规能力是决策底线。',
      suggestion: '在解决方案中突出国密能力、审计闭环与安全治理机制。',
      sourceExcerpt: '客户非常关注数据安全合规性，希望系统支持国密算法加密。',
      confidence: 0.92,
      status: 'pending',
      createdAt: ANALYSIS_TIMESTAMP,
      updatedAt: ANALYSIS_TIMESTAMP,
    },
    {
      id: `${projectId}-seed-story-2-7-2`,
      title: '客户担心竞品性能瓶颈',
      reasoning: '客户主动提及竞品性能问题，说明性能稳定性会直接影响最终评估。',
      suggestion: '在方案中加入性能压测结果和容量规划，弱化竞品风险印象。',
      sourceExcerpt: '客户 CTO 多次提及之前使用竞品 A 的体验不佳，主要是性能问题。',
      confidence: 0.88,
      status: 'pending',
      createdAt: ANALYSIS_TIMESTAMP,
      updatedAt: ANALYSIS_TIMESTAMP,
    },
  ]
}

test('@story-2-7 @p0 displays the strategy-seed empty state and opens the generation entry point', async () => {
  const initialCtx = await launchStoryApp()
  const project = await createProject(initialCtx.window, `Story 2-7 Empty ${Date.now()}`)

  await closeStoryApp(initialCtx)
  await seedAnalysisContext(initialCtx.userDataPath, project)

  const relaunchedCtx = await launchStoryApp(initialCtx.sandboxHome)

  try {
    await navigateToProject(relaunchedCtx.window, project.id)

    const seedTab = relaunchedCtx.window.getByRole('tab', { name: /策略种子/ })
    await expect(seedTab).toBeVisible()
    await seedTab.click()

    await expect(relaunchedCtx.window.getByTestId('seed-list')).toBeVisible()
    await expect(relaunchedCtx.window.getByTestId('seed-generate')).toBeVisible()

    await relaunchedCtx.window.getByTestId('seed-generate').click()
    const materialDialog = relaunchedCtx.window.getByRole('dialog', { name: '上传客户沟通素材' })
    await expect(materialDialog.getByTestId('material-textarea')).toBeVisible()

    await materialDialog.getByRole('button', { name: /取\s*消/ }).click()
    await expect(materialDialog).toHaveCount(0)
  } finally {
    await closeStoryApp(relaunchedCtx)
    await cleanupStoryHome(initialCtx.sandboxHome)
  }
})

test('@story-2-7 @p1 seed tab remains non-blocking when no strategy seeds have been generated yet', async () => {
  const initialCtx = await launchStoryApp()
  const project = await createProject(initialCtx.window, `Story 2-7 Continue ${Date.now()}`)

  await closeStoryApp(initialCtx)
  await seedAnalysisContext(initialCtx.userDataPath, project)

  const relaunchedCtx = await launchStoryApp(initialCtx.sandboxHome)

  try {
    await navigateToProject(relaunchedCtx.window, project.id)

    await relaunchedCtx.window.getByRole('tab', { name: /策略种子/ }).click()
    await expect(relaunchedCtx.window.getByTestId('seed-list')).toBeVisible()
    await expect(relaunchedCtx.window.getByTestId('seed-generate')).toBeVisible()

    await relaunchedCtx.window.getByRole('tab', { name: /需求清单/ }).click()
    await expect(relaunchedCtx.window.getByTestId('requirements-list')).toBeVisible()

    await relaunchedCtx.window.getByRole('tab', { name: '评分模型' }).click()
    await expect(relaunchedCtx.window.getByTestId('scoring-model-editor')).toBeVisible()
  } finally {
    await closeStoryApp(relaunchedCtx)
    await cleanupStoryHome(initialCtx.sandboxHome)
  }
})

test('@story-2-7 @p1 supports confirm, edit, delete, and persistence for generated strategy seeds', async () => {
  const initialCtx = await launchStoryApp()
  const project = await createProject(initialCtx.window, `Story 2-7 CRUD ${Date.now()}`)
  const seededSeeds = buildSeedRecords(project.id)
  let interactiveCtx: LaunchContext | null = null
  let persistedCtx: LaunchContext | null = null

  try {
    await closeStoryApp(initialCtx)
    await seedAnalysisContext(initialCtx.userDataPath, project)
    await seedStrategySeeds(initialCtx.userDataPath, project, seededSeeds)

    interactiveCtx = await launchStoryApp(initialCtx.sandboxHome)
    await navigateToProject(interactiveCtx.window, project.id)
    await interactiveCtx.window.getByRole('tab', { name: /策略种子/ }).click()

    await expect(interactiveCtx.window.getByTestId('seed-summary')).toContainText('共 2 个策略种子')

    const confirmCard = interactiveCtx.window
      .getByTestId('seed-card')
      .filter({ hasText: seededSeeds[0].title })
    await confirmCard.getByTestId('seed-confirm').click()
    await expect(confirmCard.getByText('已确认')).toBeVisible()

    const editCard = interactiveCtx.window.getByTestId('seed-card').nth(1)
    await expect(editCard).toContainText(seededSeeds[1].title)
    await editCard.getByTestId('seed-edit').click()
    await editCard.locator('input').fill('客户高度关注性能稳定性')
    await editCard
      .locator('textarea')
      .nth(0)
      .fill('客户直接点名竞品性能问题，意味着稳定性是影响方案得分的隐性门槛。')
    await editCard
      .locator('textarea')
      .nth(1)
      .fill('在方案中加入性能压测基线、容量规划和故障演练证明，主动回应客户顾虑。')
    await editCard.getByRole('button', { name: '保存' }).click()

    const adjustedCard = interactiveCtx.window
      .getByTestId('seed-card')
      .filter({ hasText: '客户高度关注性能稳定性' })
    await expect(adjustedCard.getByText('已调整')).toBeVisible()

    await confirmCard.getByTestId('seed-delete').click()
    const popconfirm = interactiveCtx.window.locator('.ant-popconfirm')
    await expect(popconfirm).toBeVisible()
    await popconfirm.getByRole('button', { name: /删\s*除/ }).click()

    await expect(
      interactiveCtx.window.getByTestId('seed-card').filter({ hasText: seededSeeds[0].title })
    ).toHaveCount(0)
    await expect(interactiveCtx.window.getByTestId('seed-summary')).toContainText('共 1 个策略种子')
    await closeStoryApp(interactiveCtx)
    interactiveCtx = null

    const dbPath = join(initialCtx.userDataPath, 'data', 'db', 'bidwise.sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })

    try {
      const persistedRows = db
        .prepare(
          'SELECT title, status FROM strategy_seeds WHERE project_id = ? ORDER BY created_at ASC'
        )
        .all(project.id) as Array<{ title: string; status: string }>

      expect(persistedRows).toEqual([
        {
          title: '客户高度关注性能稳定性',
          status: 'adjusted',
        },
      ])
    } finally {
      db.close()
    }

    const snapshot = JSON.parse(await readFile(join(project.rootPath, 'seed.json'), 'utf-8')) as {
      seeds: Array<{ title: string; status: string }>
      sourceMaterial: string
    }
    expect(snapshot.sourceMaterial).toBe(SEEDED_SOURCE_MATERIAL)
    expect(snapshot.seeds).toHaveLength(1)
    expect(snapshot.seeds[0]).toMatchObject({
      title: '客户高度关注性能稳定性',
      status: 'adjusted',
    })

    persistedCtx = await launchStoryApp(initialCtx.sandboxHome)
    await navigateToProject(persistedCtx.window, project.id)
    await persistedCtx.window.getByRole('tab', { name: /策略种子/ }).click()

    await expect(persistedCtx.window.getByText('客户高度关注性能稳定性')).toBeVisible()
    await expect(persistedCtx.window.getByText(seededSeeds[0].title)).toHaveCount(0)
    await expect(persistedCtx.window.getByTestId('seed-summary')).toContainText('共 1 个策略种子')
  } finally {
    if (interactiveCtx) {
      await closeStoryApp(interactiveCtx)
    }
    if (persistedCtx) {
      await closeStoryApp(persistedCtx)
    }
    await cleanupStoryHome(initialCtx.sandboxHome)
  }
})
