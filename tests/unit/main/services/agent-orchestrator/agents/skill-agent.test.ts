import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ErrorCode } from '@shared/constants'

// ─── Mocks ───

vi.mock('electron', () => ({
  app: { getAppPath: () => '/mock-app', getPath: () => '/mock-user-data' },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

vi.mock('@main/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockGetSkill = vi.fn()
const mockExpandPrompt = vi.fn()
const mockBuildMessages = vi.fn()

vi.mock('@main/services/skill-engine', () => ({
  skillLoader: {
    getSkill: (...args: unknown[]) => mockGetSkill(...args),
  },
  skillExecutor: {
    expandPrompt: (...args: unknown[]) => mockExpandPrompt(...args),
    buildMessages: (...args: unknown[]) => mockBuildMessages(...args),
  },
}))

import { skillAgentHandler } from '@main/services/agent-orchestrator/agents/skill-agent'
import type { ParsedSkill } from '@main/services/skill-engine/types'

const mockSkill: ParsedSkill = {
  name: 'test-skill',
  dirPath: '/skills/test-skill',
  frontmatter: {
    name: 'test-skill',
    description: 'A test skill',
  },
  body: 'Prompt body',
}

const baseOptions = {
  signal: new AbortController().signal,
  updateProgress: vi.fn(),
}

describe('skillAgentHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSkill.mockReturnValue(mockSkill)
    mockExpandPrompt.mockResolvedValue('Expanded prompt')
    mockBuildMessages.mockReturnValue([
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Expanded prompt' },
    ])
  })

  it('should return AiRequestParams for a valid skill', async () => {
    const result = await skillAgentHandler({ skillName: 'test-skill', args: 'my-arg' }, baseOptions)

    expect(mockGetSkill).toHaveBeenCalledWith('test-skill')
    expect(mockExpandPrompt).toHaveBeenCalledWith(
      mockSkill,
      'my-arg',
      undefined,
      baseOptions.signal
    )
    expect(result).toEqual({
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Expanded prompt' },
      ],
      model: undefined,
      maxTokens: 8192,
      temperature: 0.3,
    })
  })

  it('should throw SKILL_NOT_FOUND for unknown skill', async () => {
    mockGetSkill.mockReturnValue(undefined)

    await expect(skillAgentHandler({ skillName: 'nonexistent' }, baseOptions)).rejects.toThrow(
      expect.objectContaining({ code: ErrorCode.SKILL_NOT_FOUND })
    )
  })

  it('should throw on abort', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      skillAgentHandler({ skillName: 'test-skill' }, { ...baseOptions, signal: controller.signal })
    ).rejects.toThrow()
  })

  it('should pass frontmatter model when specified', async () => {
    const skillWithModel: ParsedSkill = {
      ...mockSkill,
      frontmatter: { ...mockSkill.frontmatter, model: 'claude-sonnet-4-5' },
    }
    mockGetSkill.mockReturnValue(skillWithModel)

    const result = await skillAgentHandler({ skillName: 'test-skill' }, baseOptions)

    expect(result.model).toBe('claude-sonnet-4-5')
  })

  it('should use default maxTokens and temperature when not specified', async () => {
    const result = await skillAgentHandler({ skillName: 'test-skill' }, baseOptions)

    expect(result.maxTokens).toBe(8192)
    expect(result.temperature).toBe(0.3)
  })

  it('should use frontmatter maxTokens and temperature when specified', async () => {
    const customSkill: ParsedSkill = {
      ...mockSkill,
      frontmatter: {
        ...mockSkill.frontmatter,
        maxTokens: 16384,
        temperature: 0.7,
      },
    }
    mockGetSkill.mockReturnValue(customSkill)

    const result = await skillAgentHandler({ skillName: 'test-skill' }, baseOptions)

    expect(result.maxTokens).toBe(16384)
    expect(result.temperature).toBe(0.7)
  })
})
