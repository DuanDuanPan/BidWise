import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAccess = vi.fn()
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
vi.mock('fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

const mockFindProjectById = vi.fn()
vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindProjectById
  },
}))

const mockFindRequirementsByProject = vi.fn()
vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindRequirementsByProject
  },
}))

const mockFindScoringModelByProject = vi.fn()
vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    findByProject = mockFindScoringModelByProject
  },
}))

const mockFindMandatoryItemsByProject = vi.fn()
vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    findByProject = mockFindMandatoryItemsByProject
  },
}))

const mockReplaceByProject = vi.fn()
const mockFindSeedsByProject = vi.fn()
const mockFindProjectId = vi.fn()
const mockTitleExists = vi.fn()
const mockUpdateSeed = vi.fn()
const mockDeleteSeed = vi.fn()
vi.mock('@main/db/repositories/strategy-seed-repo', () => ({
  StrategySeedRepository: class {
    replaceByProject = mockReplaceByProject
    findByProject = mockFindSeedsByProject
    findProjectId = mockFindProjectId
    titleExists = mockTitleExists
    update = mockUpdateSeed
    delete = mockDeleteSeed
  },
}))

const mockEnqueue = vi.fn()
const mockExecute = vi.fn()
vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

const mockAgentExecute = vi.fn()
const mockGetAgentStatus = vi.fn()
vi.mock('@main/services/agent-orchestrator', () => ({
  agentOrchestrator: {
    execute: (...args: unknown[]) => mockAgentExecute(...args),
    getAgentStatus: (...args: unknown[]) => mockGetAgentStatus(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockUuid = vi.hoisted(() => vi.fn())
vi.mock('uuid', () => ({ v4: () => mockUuid() }))

import { StrategySeedGenerator } from '@main/services/document-parser/strategy-seed-generator'

describe('StrategySeedGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T09:00:00.000Z'))

    mockFindProjectById.mockResolvedValue({ id: 'proj-1', rootPath: '/projects/proj-1' })
    mockFindRequirementsByProject.mockResolvedValue([
      { description: '系统需支持国密算法', sourcePages: [2] },
    ])
    mockFindScoringModelByProject.mockResolvedValue({
      criteria: [{ category: '技术方案', maxScore: 50, weight: 0.5 }],
    })
    mockFindMandatoryItemsByProject.mockResolvedValue([{ content: '项目经理需到岗' }])
    mockFindSeedsByProject.mockResolvedValue([])
    mockFindProjectId.mockResolvedValue('proj-1')
    mockTitleExists.mockResolvedValue(false)
    mockUpdateSeed.mockResolvedValue({
      id: 'seed-1',
      title: '客户担心竞品性能瓶颈',
      reasoning: '更新后的推理',
      suggestion: '更新后的建议',
      sourceExcerpt: '竞品性能问题',
      confidence: 0.88,
      status: 'adjusted',
      createdAt: '2026-04-01T09:00:00.000Z',
      updatedAt: '2026-04-01T09:00:00.000Z',
    })
    mockReadFile.mockRejectedValue(new Error('missing snapshot'))
    mockAccess.mockRejectedValue(new Error('missing snapshot'))
    mockEnqueue.mockResolvedValue('outer-task-1')
    mockExecute.mockResolvedValue(undefined)
    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      progress: 100,
      result: {
        content: JSON.stringify([
          {
            title: '数据安全合规优先级高',
            reasoning: '客户多次强调数据安全与国密算法。',
            suggestion: '突出国密能力和审计闭环。',
            sourceExcerpt: '客户非常关注数据安全合规性。',
            confidence: 0.92,
          },
          {
            title: '数据安全合规优先级高',
            reasoning: '重复标题应被去重。',
            suggestion: '重复记录。',
            sourceExcerpt: '重复记录。',
            confidence: 0.4,
          },
          {
            title: '',
            reasoning: '缺少标题应被过滤。',
            suggestion: '不会被保留。',
            sourceExcerpt: '无标题',
            confidence: 0.3,
          },
          {
            title: '客户担心竞品性能瓶颈',
            reasoning: '客户直接点名竞品性能问题。',
            suggestion: '补充性能压测与容量规划。',
            sourceExcerpt: '客户 CTO 多次提及竞品性能问题。',
            confidence: 0.88,
          },
        ]),
      },
    })
    mockUuid
      .mockReturnValueOnce('seed-1')
      .mockReturnValueOnce('seed-2')
      .mockReturnValueOnce('seed-3')
      .mockReturnValueOnce('seed-4')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deduplicates generated seeds before persisting and snapshotting', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve(undefined)
      }
    )

    const generator = new StrategySeedGenerator()
    await expect(
      generator.generate({
        projectId: 'proj-1',
        sourceMaterial: '客户非常关注数据安全，并对竞品性能问题表示不满。',
      })
    ).resolves.toEqual({ taskId: 'outer-task-1' })

    const ctx = {
      taskId: 'outer-task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)

    expect(mockReplaceByProject).toHaveBeenCalledTimes(1)
    const [projectId, persistedSeeds] = mockReplaceByProject.mock.calls[0] as [
      string,
      Array<{ title: string }>,
    ]
    expect(projectId).toBe('proj-1')
    expect(persistedSeeds).toHaveLength(2)
    expect(persistedSeeds.map((seed) => seed.title)).toEqual([
      '数据安全合规优先级高',
      '客户担心竞品性能瓶颈',
    ])

    const snapshotPayload = JSON.parse(mockWriteFile.mock.calls[0]?.[1] as string) as {
      projectId: string
      sourceMaterial: string
      seeds: Array<{ title: string }>
    }
    expect(mockWriteFile.mock.calls[0]?.[0]).toBe('/projects/proj-1/seed.json')
    expect(snapshotPayload.projectId).toBe('proj-1')
    expect(snapshotPayload.sourceMaterial).toBe('客户非常关注数据安全，并对竞品性能问题表示不满。')
    expect(snapshotPayload.seeds.map((seed) => seed.title)).toEqual([
      '数据安全合规优先级高',
      '客户担心竞品性能瓶颈',
    ])
  })

  it('returns an empty array when a seed snapshot exists but the database has no rows', async () => {
    mockFindSeedsByProject.mockResolvedValue([])
    mockAccess.mockResolvedValue(undefined)

    const generator = new StrategySeedGenerator()
    await expect(generator.getSeeds('proj-1')).resolves.toEqual([])
  })

  it('marks edited seeds as adjusted and preserves source material when syncing the snapshot', async () => {
    mockFindSeedsByProject.mockResolvedValue([
      {
        id: 'seed-1',
        title: '客户担心竞品性能瓶颈',
        reasoning: '更新后的推理',
        suggestion: '更新后的建议',
        sourceExcerpt: '竞品性能问题',
        confidence: 0.88,
        status: 'adjusted',
        createdAt: '2026-04-01T09:00:00.000Z',
        updatedAt: '2026-04-01T09:00:00.000Z',
      },
    ])
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        projectId: 'proj-1',
        sourceMaterial: '既有沟通素材',
        seeds: [],
        generatedAt: '2026-04-01T08:00:00.000Z',
        updatedAt: '2026-04-01T08:00:00.000Z',
      })
    )

    const generator = new StrategySeedGenerator()
    await generator.updateSeed('seed-1', {
      reasoning: '更新后的推理',
      suggestion: '更新后的建议',
    })

    expect(mockUpdateSeed).toHaveBeenCalledWith('seed-1', {
      reasoning: '更新后的推理',
      suggestion: '更新后的建议',
      status: 'adjusted',
    })

    const snapshotPayload = JSON.parse(mockWriteFile.mock.calls[0]?.[1] as string) as {
      sourceMaterial: string
      seeds: Array<{ title: string; status: string }>
    }
    expect(snapshotPayload.sourceMaterial).toBe('既有沟通素材')
    expect(snapshotPayload.seeds).toHaveLength(1)
    expect(snapshotPayload.seeds[0]).toMatchObject({
      title: '客户担心竞品性能瓶颈',
      status: 'adjusted',
    })
  })

  it('rejects duplicate titles before updating an existing seed', async () => {
    mockTitleExists.mockResolvedValue(true)

    const generator = new StrategySeedGenerator()
    await expect(
      generator.updateSeed('seed-1', {
        title: '数据安全合规优先级高',
      })
    ).rejects.toThrow('该策略种子标题已存在: 数据安全合规优先级高')

    expect(mockUpdateSeed).not.toHaveBeenCalled()
  })
})
