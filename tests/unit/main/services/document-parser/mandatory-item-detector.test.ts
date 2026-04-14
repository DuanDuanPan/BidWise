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

const bareStarTender: ParsedTender = {
  meta: {
    originalFileName: 'bare-star.docx',
    format: 'docx',
    fileSize: 4096,
    pageCount: 80,
    importedAt: '2026-04-14T00:00:00.000Z',
  },
  sections: [
    {
      id: 's-tech',
      title: '供货要求',
      content: `（1）关键特性联合计算及优化模块：
★支持涡轮泵、推力室大喷管、减压阀、单机产品等进行关键特性进行联合计算，根据联合计算结果进行性能分析、组合件性能偏差影响分析，支持自动最优选择设计，并支持人为修改，调整偏差与实际试车复现结果小于3%
（2）试车数据处理模块：
★支持对试车数据调用，进行分段、平均、连接、平移等处理，支持组合件性能偏差分析、历史数据包络分析，参数数量不少于100个，包络范围不少于1000次`,
      pageStart: 40,
      pageEnd: 42,
      level: 1,
    },
    {
      id: 's-response',
      title: '技术支持资料',
      content: `1.1.2关键特性联合计算及优化模块
★（1）支持涡轮泵、推力室大喷管、减压阀、单机产品等进行关键特性进行联合计算，根据联合计算结果进行性能分析、组合件性能偏差影响分析，支持自动最优选择设计，并支持人为修改，调整偏差与实际试车复现结果小于3%
1.1.3试车数据处理模块
★（1）支持对试车数据调用，进行分段、平均、连接、平移等处理，支持组合件性能偏差分析、历史数据包络分析，参数数量不少于100个，包络范围不少于1000次`,
      pageStart: 50,
      pageEnd: 52,
      level: 1,
    },
  ],
  rawText: `投标文件应当对招标文件中带*或★号的实质性要求和条件作出满足性响应。

注：招标文件中标注星号（"*或★"）的技术指标为关键技术指标。

（1）关键特性联合计算及优化模块：
★支持涡轮泵、推力室大喷管、减压阀、单机产品等进行关键特性进行联合计算，根据联合计算结果进行性能分析、组合件性能偏差影响分析，支持自动最优选择设计，并支持人为修改，调整偏差与实际试车复现结果小于3%
（2）试车数据处理模块：
★支持对试车数据调用，进行分段、平均、连接、平移等处理，支持组合件性能偏差分析、历史数据包络分析，参数数量不少于100个，包络范围不少于1000次
（3）飞行数据处理模块：
★支持飞行结果与关键特性联合计算结果自动比较，支持飞行性能偏差分析、历史数据包络分析，支持的飞行数据时长不小于2h、偏差分析因素不少于20项。

1.1.2关键特性联合计算及优化模块
★（1）支持涡轮泵、推力室大喷管、减压阀、单机产品等进行关键特性进行联合计算
1.1.3试车数据处理模块
★（1）支持对试车数据调用，进行分段、平均、连接、平移等处理`,
  totalPages: 80,
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

  it('extracts bare ★ items without dotted clause numbers (★支持... and ★（1）支持...)', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(bareStarTender))

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
    expect(mockReplaceByProject).toHaveBeenCalledTimes(1)

    const [, persistedItems] = mockReplaceByProject.mock.calls[0] as [
      string,
      Array<{ content: string; sourcePages: number[]; sourceText: string }>,
    ]

    // Should find bare star items — exact count depends on dedup, but must be > 0
    expect(persistedItems.length).toBeGreaterThanOrEqual(3)

    // All content entries should start with ★
    for (const item of persistedItems) {
      expect(item.content).toMatch(/^★/)
    }

    // Should contain the key technical descriptions
    const allContent = persistedItems.map((item) => item.content).join(' ')
    expect(allContent).toContain('支持涡轮泵')
    expect(allContent).toContain('试车数据')
    expect(allContent).toContain('飞行')

    // sourceText should contain substantive technical content
    expect(persistedItems[0]?.sourceText).toContain('联合计算')

    // Noise lines should NOT appear as items
    const noiseContent = persistedItems.find((item) =>
      /加注星号|标注星号|带\*或★/.test(item.content)
    )
    expect(noiseContent).toBeUndefined()
  })
})
