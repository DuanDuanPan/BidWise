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

const APP_ENTRY = resolve(__dirname, '../../../out/main/index.js')

test.setTimeout(90_000)

async function launchStoryApp(existingHome?: string): Promise<LaunchContext> {
  const sandboxHome = existingHome ?? (await mkdtemp(join(tmpdir(), 'bidwise-story-2-5-')))
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
} {
  const extractedAt = '2026-03-22T09:00:00.000Z'

  const parsedTender = {
    meta: {
      originalFileName: 'story-2-5-sample.pdf',
      format: 'pdf',
      fileSize: 4096,
      pageCount: 6,
      importedAt: extractedAt,
    },
    sections: [
      {
        id: 'section-1',
        title: '技术要求',
        content: '系统应支持分布式部署、容灾与日志审计。',
        pageStart: 1,
        pageEnd: 3,
        level: 1,
      },
      {
        id: 'section-2',
        title: '评分标准',
        content: '技术方案 60 分，实施方案 20 分，服务保障 20 分。',
        pageStart: 4,
        pageEnd: 6,
        level: 1,
      },
    ],
    rawText:
      '技术要求：系统应支持分布式部署、容灾与日志审计。评分标准：技术方案60分，实施方案20分，服务保障20分。',
    totalPages: 6,
    hasScannedContent: false,
  }

  const requirements = [
    {
      id: 'req-story-2-5-1',
      sequenceNumber: 1,
      description: '系统应支持分布式部署与跨节点容灾。',
      sourcePages: [2, 3],
      category: 'technical',
      priority: 'high',
      status: 'extracted',
    },
    {
      id: 'req-story-2-5-2',
      sequenceNumber: 2,
      description: '投标方案需提供实施计划与服务保障说明。',
      sourcePages: [4, 5],
      category: 'service',
      priority: 'medium',
      status: 'extracted',
    },
  ]

  const scoringModel = {
    projectId,
    totalScore: 100,
    criteria: [
      {
        id: 'criterion-story-2-5-1',
        category: '技术方案',
        maxScore: 60,
        weight: 0.6,
        subItems: [
          {
            id: 'subcriterion-story-2-5-1',
            name: '系统架构设计',
            maxScore: 15,
            description: '评估分布式架构与高可用设计是否完整。',
            sourcePages: [4],
          },
        ],
        reasoning: '评分标准明确要求重点考察架构设计与技术先进性。',
        status: 'extracted',
      },
      {
        id: 'criterion-story-2-5-2',
        category: '实施方案',
        maxScore: 20,
        weight: 0.2,
        subItems: [],
        reasoning: '实施计划与项目组织能力单独计分。',
        status: 'extracted',
      },
      {
        id: 'criterion-story-2-5-3',
        category: '服务保障',
        maxScore: 20,
        weight: 0.2,
        subItems: [],
        reasoning: '售后服务承诺与运维保障共计 20 分。',
        status: 'extracted',
      },
    ],
    extractedAt,
    confirmedAt: null,
    version: 1,
  }

  return { parsedTender, requirements, scoringModel }
}

async function seedExtractedAnalysis(userDataPath: string, project: SeededProject): Promise<void> {
  const { parsedTender, requirements, scoringModel } = buildSeededAnalysis(project.id)
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

  const dbPath = join(userDataPath, 'data', 'db', 'bidwise.sqlite')
  const db = new DatabaseSync(dbPath)
  const now = '2026-03-22T09:00:00.000Z'

  try {
    db.prepare('DELETE FROM requirements WHERE project_id = ?').run(project.id)
    db.prepare('DELETE FROM scoring_models WHERE project_id = ?').run(project.id)

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
        now,
        now
      )
    }

    db.prepare(
      `
      INSERT INTO scoring_models (
        id, project_id, total_score, criteria, extracted_at, confirmed_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      'scoring-model-story-2-5',
      project.id,
      100,
      JSON.stringify(scoringModel.criteria),
      scoringModel.extractedAt,
      null,
      1,
      now,
      now
    )
  } finally {
    db.close()
  }
}

test('@story-2-5 @p0 loads extracted requirements and scoring data, supports edits, and persists confirmation', async () => {
  const initialCtx = await launchStoryApp()
  const runId = Date.now().toString()
  const project = await createProject(initialCtx.window, `Story 2-5 QA ${runId}`)

  await closeStoryApp(initialCtx)
  await seedExtractedAnalysis(initialCtx.userDataPath, project)

  const relaunchedCtx = await launchStoryApp(initialCtx.sandboxHome)

  try {
    await navigateToProject(relaunchedCtx.window, project.id)

    await expect(relaunchedCtx.window.getByTestId('tender-result-summary')).toBeVisible()
    await expect(relaunchedCtx.window.getByText('story-2-5-sample.pdf')).toBeVisible()
    await expect(relaunchedCtx.window.getByRole('tab', { name: '需求清单 (2)' })).toBeVisible()
    await expect(relaunchedCtx.window.getByTestId('requirements-list')).toBeVisible()
    await expect(relaunchedCtx.window.getByText('系统应支持分布式部署与跨节点容灾。')).toBeVisible()

    const updatedRequirementDescription = '系统应支持分布式部署、容灾切换与审计追踪。'
    await relaunchedCtx.window.getByTestId('desc-req-story-2-5-1').dblclick()
    await expect(relaunchedCtx.window.getByTestId('edit-desc-req-story-2-5-1')).toBeVisible()
    await relaunchedCtx.window
      .getByTestId('edit-desc-req-story-2-5-1')
      .fill(updatedRequirementDescription)
    await relaunchedCtx.window.getByTestId('edit-desc-req-story-2-5-1').blur()
    await expect(relaunchedCtx.window.getByText(updatedRequirementDescription)).toBeVisible()

    await relaunchedCtx.window.getByRole('tab', { name: '评分模型' }).click()
    await expect(relaunchedCtx.window.getByTestId('scoring-model-editor')).toBeVisible()
    await expect(relaunchedCtx.window.getByText('技术方案')).toBeVisible()

    const updatedReasoning = '人工复核后确认技术方案应突出容灾切换、审计能力与架构成熟度。'
    await relaunchedCtx.window
      .getByTestId('reasoning-input-criterion-story-2-5-1')
      .fill(updatedReasoning)
    await relaunchedCtx.window.getByTestId('reasoning-input-criterion-story-2-5-1').blur()
    await expect(
      relaunchedCtx.window.getByTestId('reasoning-input-criterion-story-2-5-1')
    ).toHaveValue(updatedReasoning)

    await relaunchedCtx.window.getByTestId('confirm-btn').click()
    await expect(relaunchedCtx.window.getByTestId('confirmed-btn')).toBeVisible()
  } finally {
    await closeStoryApp(relaunchedCtx)
  }

  const dbPath = join(initialCtx.userDataPath, 'data', 'db', 'bidwise.sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })

  try {
    const savedRequirement = db
      .prepare('SELECT description, status FROM requirements WHERE id = ?')
      .get('req-story-2-5-1') as { description: string; status: string }
    expect(savedRequirement.description).toBe('系统应支持分布式部署、容灾切换与审计追踪。')
    expect(savedRequirement.status).toBe('modified')

    const savedScoringModel = db
      .prepare(
        'SELECT confirmed_at AS confirmedAt, criteria FROM scoring_models WHERE project_id = ?'
      )
      .get(project.id) as { confirmedAt: string | null; criteria: string }
    expect(savedScoringModel.confirmedAt).toBeTruthy()

    const savedCriteria = JSON.parse(savedScoringModel.criteria) as Array<{
      id: string
      reasoning: string
      status: string
    }>
    expect(
      savedCriteria.find((criterion) => criterion.id === 'criterion-story-2-5-1')?.reasoning
    ).toBe('人工复核后确认技术方案应突出容灾切换、审计能力与架构成熟度。')
    expect(savedCriteria.every((criterion) => criterion.status === 'confirmed')).toBe(true)
  } finally {
    db.close()
  }

  const scoringModelContent = await readFile(
    join(project.rootPath, 'tender', 'scoring-model.json'),
    'utf-8'
  )
  const scoringModelFile = JSON.parse(scoringModelContent) as {
    confirmedAt: string | null
    criteria: Array<{ id: string; reasoning: string; status: string }>
  }

  expect(scoringModelFile.confirmedAt).toBeTruthy()
  expect(
    scoringModelFile.criteria.find((criterion) => criterion.id === 'criterion-story-2-5-1')
      ?.reasoning
  ).toBe('人工复核后确认技术方案应突出容灾切换、审计能力与架构成熟度。')
  expect(scoringModelFile.criteria.every((criterion) => criterion.status === 'confirmed')).toBe(
    true
  )

  await cleanupStoryHome(initialCtx.sandboxHome)
})
