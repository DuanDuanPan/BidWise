import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockGenerateSkillDiagram = vi.fn()

vi.mock('@main/services/skill-diagram-generation-service', () => ({
  generateSkillDiagram: (...args: unknown[]) => mockGenerateSkillDiagram(...args),
}))

import { skillDiagramAgentHandler } from '@main/services/agent-orchestrator/agents/skill-diagram-agent'

describe('skillDiagramAgentHandler', () => {
  const baseContext = {
    projectId: 'proj-1',
    diagramId: '12345678-abcd-efgh-ijkl-1234567890ab',
    assetFileName: 'ai-diagram-12345678.svg',
    prompt: '系统集成架构图，展示平台、数据中台、门户系统与外部系统',
    title: '系统集成架构图',
    style: 'flat-icon' as const,
    diagramType: 'architecture' as const,
  }

  const baseOptions = {
    signal: new AbortController().signal,
    updateProgress: vi.fn(),
    aiProxy: { call: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateSkillDiagram.mockResolvedValue({
      kind: 'success',
      markdown:
        '<!-- ai-diagram:test:ai-diagram-12345678.svg -->\n![系统集成架构图](assets/ai-diagram-12345678.svg)',
      assetFileName: 'ai-diagram-12345678.svg',
      svgContent: '<svg>validated</svg>',
      repairAttempts: 1,
    })
  })

  it('should return a direct agent result with persisted svg metadata', async () => {
    const result = await skillDiagramAgentHandler(baseContext, baseOptions)

    expect(mockGenerateSkillDiagram).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          diagramId: baseContext.diagramId,
          title: baseContext.title,
          description: baseContext.prompt,
          style: baseContext.style,
          diagramType: baseContext.diagramType,
          assetFileName: baseContext.assetFileName,
        }),
        projectId: baseContext.projectId,
      })
    )

    expect(result).toMatchObject({ kind: 'result' })
    if ('kind' in result && result.kind === 'result') {
      const parsed = JSON.parse(result.value.content) as {
        diagramId: string
        assetFileName: string
        prompt: string
        title: string
        svgContent: string
        repairAttempts: number
      }
      expect(parsed).toEqual({
        diagramId: baseContext.diagramId,
        assetFileName: baseContext.assetFileName,
        prompt: baseContext.prompt,
        title: baseContext.title,
        style: baseContext.style,
        diagramType: baseContext.diagramType,
        svgContent: '<svg>validated</svg>',
        repairAttempts: 1,
      })
    }
  })

  it('should throw when ai proxy is unavailable', async () => {
    await expect(
      skillDiagramAgentHandler(baseContext, { ...baseOptions, aiProxy: undefined })
    ).rejects.toThrow('AI proxy 不可用')
  })

  it('should throw when enhanced diagram generation fails', async () => {
    mockGenerateSkillDiagram.mockResolvedValueOnce({
      kind: 'failure',
      markdown: '> [图表生成失败] 系统集成架构图（skill）: SVG validation failed',
      error: 'SVG validation failed',
      repairAttempts: 3,
    })

    await expect(skillDiagramAgentHandler(baseContext, baseOptions)).rejects.toThrow(
      'SVG validation failed'
    )
  })
})
