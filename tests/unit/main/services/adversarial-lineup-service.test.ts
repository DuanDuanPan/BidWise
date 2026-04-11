import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindProjectById,
  mockFindRequirementsByProject,
  mockFindScoringModelByProject,
  mockFindMandatoryItemsByProject,
  mockFindSeedsByProject,
  mockLineupSave,
  mockEnqueue,
  mockExecute,
  mockAgentExecute,
  mockGetAgentStatus,
} = vi.hoisted(() => ({
  mockFindProjectById: vi.fn(),
  mockFindRequirementsByProject: vi.fn(),
  mockFindScoringModelByProject: vi.fn(),
  mockFindMandatoryItemsByProject: vi.fn(),
  mockFindSeedsByProject: vi.fn(),
  mockLineupSave: vi.fn(),
  mockEnqueue: vi.fn(),
  mockExecute: vi.fn(),
  mockAgentExecute: vi.fn(),
  mockGetAgentStatus: vi.fn(),
}))

vi.mock('@main/db/repositories/project-repo', () => ({
  ProjectRepository: class {
    findById = mockFindProjectById
  },
}))

vi.mock('@main/db/repositories/requirement-repo', () => ({
  RequirementRepository: class {
    findByProject = mockFindRequirementsByProject
  },
}))

vi.mock('@main/db/repositories/scoring-model-repo', () => ({
  ScoringModelRepository: class {
    findByProject = mockFindScoringModelByProject
  },
}))

vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    findByProject = mockFindMandatoryItemsByProject
  },
}))

vi.mock('@main/db/repositories/strategy-seed-repo', () => ({
  StrategySeedRepository: class {
    findByProject = mockFindSeedsByProject
  },
}))

vi.mock('@main/db/repositories/adversarial-lineup-repo', () => ({
  AdversarialLineupRepository: class {
    save = mockLineupSave
    findByProjectId = vi.fn()
    update = vi.fn()
  },
}))

vi.mock('@main/services/task-queue', () => ({
  taskQueue: {
    enqueue: (...args: unknown[]) => mockEnqueue(...args),
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}))

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

import { adversarialLineupService } from '@main/services/adversarial-lineup-service'

describe('adversarialLineupService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFindProjectById.mockResolvedValue({
      id: 'proj-1',
      rootPath: '/projects/proj-1',
      proposalType: '政府采购',
    })
    mockFindRequirementsByProject.mockResolvedValue([
      { description: '系统应支持国产数据库' },
      { description: '系统应支持双活容灾' },
    ])
    mockFindScoringModelByProject.mockResolvedValue({
      criteria: [{ category: '技术方案', maxScore: 50, weight: 0.5 }],
    })
    mockFindMandatoryItemsByProject.mockResolvedValue([])
    mockFindSeedsByProject.mockResolvedValue([])
    mockEnqueue.mockResolvedValue('task-1')
    mockExecute.mockResolvedValue(undefined)
    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
  })

  it('aborts before persisting a lineup when cancellation happens during inner polling', async () => {
    mockExecute.mockImplementation(async (_taskId, executor) => executor)

    const controller = new AbortController()
    mockGetAgentStatus.mockImplementation(async () => {
      controller.abort(new Error('Task cancelled'))
      return {
        status: 'completed',
        progress: 100,
        result: {
          content: JSON.stringify([
            {
              name: '攻击角色 A',
              perspective: '从稳定性角度挑错',
              attackFocus: ['稳定性'],
              intensity: 'medium',
            },
          ]),
        },
      }
    })

    await adversarialLineupService.generate({ projectId: 'proj-1' })
    const executor = mockExecute.mock.calls[0]?.[1] as
      | ((ctx: {
          taskId: string
          input: unknown
          signal: AbortSignal
          updateProgress: (progress: number, message?: string) => void
          setCheckpoint: (data: unknown) => Promise<void>
          checkpoint?: unknown
        }) => Promise<unknown>)
      | undefined

    expect(executor).toBeTypeOf('function')

    await expect(
      executor!({
        taskId: 'task-1',
        input: { projectId: 'proj-1' },
        signal: controller.signal,
        updateProgress: vi.fn(),
        setCheckpoint: vi.fn().mockResolvedValue(undefined),
        checkpoint: undefined,
      })
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(mockLineupSave).not.toHaveBeenCalled()
  })
})
