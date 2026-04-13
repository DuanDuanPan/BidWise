import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
vi.mock('fs/promises', () => ({
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

const mockReplaceByProject = vi.fn()
vi.mock('@main/db/repositories/mandatory-item-repo', () => ({
  MandatoryItemRepository: class {
    replaceByProject = mockReplaceByProject
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

import { MandatoryItemDetector } from '@main/services/document-parser/mandatory-item-detector'
import type { ParsedTender } from '@shared/analysis-types'

const mockTender: ParsedTender = {
  meta: {
    originalFileName: 'test.pdf',
    format: 'pdf',
    fileSize: 1024,
    pageCount: 10,
    importedAt: '2026-03-31T00:00:00.000Z',
  },
  sections: [{ id: 's1', title: '总则', content: '内容', pageStart: 1, pageEnd: 2, level: 1 }],
  rawText: '投标文件须加盖公章\n提供授权书',
  totalPages: 10,
  hasScannedContent: false,
}

const explicitMarkedTender: ParsedTender = {
  meta: {
    originalFileName: 'starred.docx',
    format: 'docx',
    fileSize: 2048,
    pageCount: 60,
    importedAt: '2026-04-13T00:00:00.000Z',
  },
  sections: [
    {
      id: 's-53',
      title: '十一、技术支持资料',
      content:
        '1、第五章 供货要求-*8.2.2.7 自动生成模块 工业 APP 能与协同设计管理系统、NX、AMEsim、超算平台集成使用。 技术支持资料：',
      pageStart: 53,
      pageEnd: 53,
      level: 1,
    },
    {
      id: 's-43',
      title: '十一、技术支持资料',
      content:
        '2、第五章 供货要求-*8.5.1 需要支持招标方现有服务器环境 投标方需要支持银河麒麟 V10 SP3、达梦安全数据库 V8.2、TongWeb V7.0。 技术支持资料：',
      pageStart: 43,
      pageEnd: 43,
      level: 1,
    },
  ],
  rawText: `十一、技术支持资料
（投标人需将加注星号“*”的重要技术条款或技术参数的技术支持资料集中在此章节中列出。）

1、第五章 供货要求-*8.2.2.7 自动生成模块
工业 APP 能与协同设计管理系统、NX、AMEsim、超算平台集成使用。
技术支持资料：

2、第五章 供货要求-*8.5.1 需要支持招标方现有服务器环境
投标方需要支持银河麒麟 V10 SP3、达梦安全数据库 V8.2、TongWeb V7.0。
技术支持资料：`,
  totalPages: 60,
  hasScannedContent: false,
}

describe('MandatoryItemDetector', () => {
  let detector: MandatoryItemDetector

  beforeEach(() => {
    vi.clearAllMocks()

    detector = new MandatoryItemDetector()
    mockFindProjectById.mockResolvedValue({ id: 'proj-1', rootPath: '/projects/proj-1' })
    mockFindRequirementsByProject.mockResolvedValue([
      { id: 'req-1', description: '投标文件须加盖公章' },
    ])
    mockReadFile.mockResolvedValue(JSON.stringify(mockTender))
    mockWriteFile.mockResolvedValue(undefined)
    mockReplaceByProject.mockResolvedValue(undefined)
    mockEnqueue.mockResolvedValue('task-1')
    mockExecute.mockResolvedValue({})
    mockUuid
      .mockReturnValueOnce('item-1')
      .mockReturnValueOnce('item-2')
      .mockReturnValueOnce('item-3')
  })

  it('deduplicates LLM items before both DB replacement and snapshot writing', async () => {
    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementation(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await detector.detect({ projectId: 'proj-1' })

    mockAgentExecute.mockResolvedValue({ taskId: 'inner-task-1' })
    mockGetAgentStatus.mockResolvedValue({
      status: 'completed',
      result: {
        content: JSON.stringify([
          {
            content: '投标文件须加盖公章',
            sourceText: '投标文件须加盖公章，否则按无效标处理。',
            sourcePages: [2],
            confidence: 0.91,
          },
          {
            content: '投标文件须加盖公章',
            sourceText: '投标文件须加盖公章，否则按无效标处理。',
            sourcePages: [2],
            confidence: 0.42,
          },
          {
            content: '提供授权书',
            sourceText: '法定代表人授权书原件。',
            sourcePages: [3],
            confidence: 0.88,
          },
        ]),
      },
      progress: 100,
    })

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)

    expect(mockAgentExecute).toHaveBeenCalledTimes(1)
    expect(mockReplaceByProject).toHaveBeenCalledTimes(1)
    const [projectId, persistedItems] = mockReplaceByProject.mock.calls[0] as [
      string,
      Array<{ content: string; linkedRequirementId: string | null }>,
    ]
    expect(projectId).toBe('proj-1')
    expect(persistedItems).toHaveLength(2)
    expect(persistedItems.map((item) => item.content)).toEqual(['投标文件须加盖公章', '提供授权书'])
    expect(persistedItems[0]?.linkedRequirementId).toBe('req-1')

    const snapshotCall = mockWriteFile.mock.calls.find(
      ([filePath]) => filePath === '/projects/proj-1/tender/mandatory-items.json'
    )

    expect(snapshotCall).toBeTruthy()
    const snapshot = JSON.parse(snapshotCall![1] as string) as {
      projectId: string
      items: Array<{ content: string; linkedRequirementId: string | null }>
    }
    expect(snapshot.projectId).toBe('proj-1')
    expect(snapshot.items).toHaveLength(2)
    expect(snapshot.items.map((item) => item.content)).toEqual(['投标文件须加盖公章', '提供授权书'])
    expect(snapshot.items[0]?.linkedRequirementId).toBe('req-1')
  })

  it('prefers deterministic explicit * items and skips AI when star-marked technical clauses exist', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(explicitMarkedTender))

    let capturedExecutor: ((ctx: unknown) => Promise<unknown>) | null = null
    mockExecute.mockImplementationOnce(
      (_taskId: string, executor: (ctx: unknown) => Promise<unknown>) => {
        capturedExecutor = executor
        return Promise.resolve({})
      }
    )

    await detector.detect({ projectId: 'proj-1' })

    const ctx = {
      taskId: 'task-1',
      input: { projectId: 'proj-1', rootPath: '/projects/proj-1' },
      signal: new AbortController().signal,
      updateProgress: vi.fn(),
      setCheckpoint: vi.fn(),
    }

    await capturedExecutor!(ctx)

    expect(mockAgentExecute).not.toHaveBeenCalled()
    expect(mockGetAgentStatus).not.toHaveBeenCalled()
    expect(mockReplaceByProject).toHaveBeenCalledTimes(1)

    const [, persistedItems] = mockReplaceByProject.mock.calls[0] as [
      string,
      Array<{ content: string; sourcePages: number[]; sourceText: string }>,
    ]

    expect(persistedItems).toHaveLength(2)
    expect(persistedItems.map((item) => item.content)).toEqual([
      '*8.2.2.7 自动生成模块',
      '*8.5.1 需要支持招标方现有服务器环境',
    ])
    expect(persistedItems.map((item) => item.sourcePages)).toEqual([[53], [43]])
    expect(persistedItems[0]?.sourceText).toContain('工业 APP 能与协同设计管理系统')
    expect(persistedItems[1]?.sourceText).toContain('银河麒麟 V10 SP3')
    expect(persistedItems[0]?.sourceText).not.toContain('投标人需将加注星号')
  })
})
