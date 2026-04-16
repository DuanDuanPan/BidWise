import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSkillLoaderGetSkill = vi.hoisted(() => vi.fn())
const mockSkillExecutorExpandPrompt = vi.hoisted(() => vi.fn())
const mockSkillExecutorBuildMessages = vi.hoisted(() => vi.fn())
const mockSaveAiDiagramAsset = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ assetPath: '/tmp/test.svg' })
)

vi.mock('@main/services/skill-engine', () => ({
  skillLoader: { getSkill: (...args: unknown[]) => mockSkillLoaderGetSkill(...args) },
  skillExecutor: {
    expandPrompt: (...args: unknown[]) => mockSkillExecutorExpandPrompt(...args),
    buildMessages: (...args: unknown[]) => mockSkillExecutorBuildMessages(...args),
  },
}))

vi.mock('@main/services/ai-diagram-asset-service', () => ({
  aiDiagramAssetService: {
    saveAiDiagramAsset: (...args: unknown[]) => mockSaveAiDiagramAsset(...args),
  },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock child_process.execFile — Node callback style (cmd, args, opts, callback)
vi.mock('child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb?: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      // Support both 3-arg (cmd, args, cb) and 4-arg (cmd, args, opts, cb) forms
      const callback = typeof _opts === 'function' ? (_opts as typeof cb) : cb
      if (callback) callback(null, 'ok', '')
    }
  ),
}))

// Mock fs operations for temp file handling
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('mock style reference content'),
}))

// Mock sharp for export validation fallback
vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    png: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
    }),
  }),
}))

const { generateSkillDiagram } = await import('@main/services/skill-diagram-generation-service')

// ─── Helpers ──────────────────────────────────────────────────────────────

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect x="10" y="10" width="100" height="50"/></svg>'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSkill() {
  return {
    name: 'fireworks-tech-graph',
    dirPath: '/mock/skills/fireworks-tech-graph',
    frontmatter: {
      name: 'fireworks-tech-graph',
      description: 'Technical diagram skill',
      arguments: ['$style', '$diagramType'],
      maxTokens: 16384,
    },
    body: 'mock skill body',
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeAiResponse(content: string) {
  return {
    content,
    usage: { promptTokens: 100, completionTokens: 200 },
    latencyMs: 500,
    model: 'mock',
    provider: 'mock',
    finishReason: 'stop',
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeInput() {
  return {
    diagramId: 'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
    title: '系统架构图',
    description: '展示三层架构',
    style: 'flat-icon' as const,
    diagramType: 'architecture' as const,
    chapterTitle: '技术架构设计',
    chapterMarkdown: '系统采用三层架构',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('skill-diagram-generation-service @story-3-10', () => {
  let mockAiProxy: { call: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSkillLoaderGetSkill.mockReturnValue(makeSkill())
    mockSkillExecutorExpandPrompt.mockResolvedValue('expanded prompt body')
    mockSkillExecutorBuildMessages.mockReturnValue([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user prompt' },
    ])
    mockAiProxy = { call: vi.fn().mockResolvedValue(makeAiResponse(VALID_SVG)) }
  })

  it('@p0 should return failure when skill is not loaded', async () => {
    mockSkillLoaderGetSkill.mockReturnValue(undefined)

    const result = await generateSkillDiagram({
      input: makeInput(),
      projectId: 'proj-1',
      aiProxy: mockAiProxy,
      signal: new AbortController().signal,
      usage: { promptTokens: 0, completionTokens: 0 },
    })

    expect(result.kind).toBe('failure')
    expect(result.markdown).toContain('图表生成失败')
    expect(result.error).toContain('not loaded')
    expect(mockAiProxy.call).not.toHaveBeenCalled()
  })

  it('@p0 should generate diagram successfully on first attempt', async () => {
    const result = await generateSkillDiagram({
      input: makeInput(),
      projectId: 'proj-1',
      aiProxy: mockAiProxy,
      signal: new AbortController().signal,
      usage: { promptTokens: 0, completionTokens: 0 },
    })

    expect(result.kind).toBe('success')
    expect(result.markdown).toContain('<!-- ai-diagram:')
    expect(result.markdown).toContain('ai-diagram-aaaabbbb.svg')
    expect(result.markdown).toContain('![系统架构图]')
    expect(result.repairAttempts).toBe(0)
    expect(mockSaveAiDiagramAsset).toHaveBeenCalledOnce()
    expect(mockSkillExecutorExpandPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'fireworks-tech-graph' }),
      'flat-icon architecture',
      undefined,
      expect.any(Object)
    )
  })

  it('@p0 should return failure when SVG extraction fails on all attempts', async () => {
    mockAiProxy.call.mockResolvedValue(makeAiResponse('Not an SVG at all'))

    const result = await generateSkillDiagram({
      input: makeInput(),
      projectId: 'proj-1',
      aiProxy: mockAiProxy,
      signal: new AbortController().signal,
      usage: { promptTokens: 0, completionTokens: 0 },
    })

    expect(result.kind).toBe('failure')
    expect(result.markdown).toContain('图表生成失败')
    expect(result.repairAttempts).toBe(3)
    // 1 initial + 3 repair = 4 calls
    expect(mockAiProxy.call).toHaveBeenCalledTimes(4)
  })

  it('@p1 should accumulate token usage across attempts', async () => {
    const usage = { promptTokens: 0, completionTokens: 0 }

    await generateSkillDiagram({
      input: makeInput(),
      projectId: 'proj-1',
      aiProxy: mockAiProxy,
      signal: new AbortController().signal,
      usage,
    })

    expect(usage.promptTokens).toBe(100)
    expect(usage.completionTokens).toBe(200)
  })

  it('@p1 should not save asset when generation fails', async () => {
    mockAiProxy.call.mockResolvedValue(makeAiResponse('no svg here'))

    await generateSkillDiagram({
      input: makeInput(),
      projectId: 'proj-1',
      aiProxy: mockAiProxy,
      signal: new AbortController().signal,
      usage: { promptTokens: 0, completionTokens: 0 },
    })

    expect(mockSaveAiDiagramAsset).not.toHaveBeenCalled()
  })
})
