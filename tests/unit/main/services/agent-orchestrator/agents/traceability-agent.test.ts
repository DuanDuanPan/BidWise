import { describe, it, expect, vi } from 'vitest'
import { traceabilityAgentHandler } from '@main/services/agent-orchestrator/agents/traceability-agent'

const mockGenerateTraceabilityPrompt = vi.fn().mockReturnValue('mocked traceability prompt')
const mockThrowIfAborted = vi.fn()

vi.mock('@main/prompts/generate-traceability.prompt', () => ({
  generateTraceabilityPrompt: (...args: unknown[]) => mockGenerateTraceabilityPrompt(...args),
}))

vi.mock('@main/utils/abort', () => ({
  throwIfAborted: (...args: unknown[]) => mockThrowIfAborted(...args),
}))

describe('traceabilityAgentHandler @story-2-8', () => {
  it('@p1 should return AiRequestParams with low temperature', async () => {
    const controller = new AbortController()
    const result = await traceabilityAgentHandler(
      {
        requirements: [{ id: 'r1', sequenceNumber: 1, description: 'test', category: 'technical' }],
        sections: [{ sectionId: 's1', title: '技术方案', level: 2 }],
      },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[1].role).toBe('user')
    expect(result.temperature).toBe(0.2)
    expect(result.maxTokens).toBe(8192)
  })

  it('@p1 should pass context to prompt generator', async () => {
    const controller = new AbortController()
    const requirements = [{ id: 'r1', sequenceNumber: 1, description: 'test', category: 'technical' }]
    const sections = [{ sectionId: 's1', title: '技术方案', level: 2 }]
    const existingManualLinks = [
      { requirementId: 'r1', sectionId: 's1', coverageStatus: 'covered' },
    ]

    await traceabilityAgentHandler(
      { requirements, sections, existingManualLinks },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(mockGenerateTraceabilityPrompt).toHaveBeenCalledWith({
      requirements,
      sections,
      existingManualLinks,
    })
  })

  it('@p2 should call throwIfAborted before processing', async () => {
    const controller = new AbortController()
    await traceabilityAgentHandler(
      {
        requirements: [],
        sections: [],
      },
      { signal: controller.signal, updateProgress: vi.fn() }
    )

    expect(mockThrowIfAborted).toHaveBeenCalledWith(controller.signal, 'Traceability agent cancelled')
  })
})
