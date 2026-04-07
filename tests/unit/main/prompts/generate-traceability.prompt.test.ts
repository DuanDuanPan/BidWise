import { describe, it, expect } from 'vitest'
import { generateTraceabilityPrompt } from '@main/prompts/generate-traceability.prompt'
import type { TraceabilityPromptContext } from '@main/prompts/generate-traceability.prompt'

const baseContext: TraceabilityPromptContext = {
  requirements: [
    {
      id: 'req-1',
      sequenceNumber: 1,
      description: '系统须支持千万级数据处理',
      category: 'technical',
    },
    { id: 'req-2', sequenceNumber: 2, description: '需提供7×24小时运维服务', category: 'service' },
  ],
  sections: [
    { sectionId: 's1', title: '技术方案', level: 2 },
    { sectionId: 's2', title: '服务保障', level: 2 },
  ],
}

describe('generateTraceabilityPrompt @story-2-8', () => {
  it('@p1 should include all requirements in the prompt', () => {
    const prompt = generateTraceabilityPrompt(baseContext)
    expect(prompt).toContain('req-1')
    expect(prompt).toContain('千万级数据处理')
    expect(prompt).toContain('req-2')
    expect(prompt).toContain('7×24小时运维服务')
  })

  it('@p1 should include all sections in the prompt', () => {
    const prompt = generateTraceabilityPrompt(baseContext)
    expect(prompt).toContain('s1')
    expect(prompt).toContain('技术方案')
    expect(prompt).toContain('s2')
    expect(prompt).toContain('服务保障')
  })

  it('@p1 should include JSON output format specification', () => {
    const prompt = generateTraceabilityPrompt(baseContext)
    expect(prompt).toContain('requirementId')
    expect(prompt).toContain('sectionMappings')
    expect(prompt).toContain('coverageStatus')
    expect(prompt).toContain('confidence')
  })

  it('@p2 should include existing manual links when provided', () => {
    const prompt = generateTraceabilityPrompt({
      ...baseContext,
      existingManualLinks: [{ requirementId: 'req-1', sectionId: 's1', coverageStatus: 'covered' }],
    })
    expect(prompt).toContain('手动映射')
    expect(prompt).toContain('req-1')
    expect(prompt).toContain('s1')
  })

  it('@p2 should not include manual links section when empty', () => {
    const prompt = generateTraceabilityPrompt(baseContext)
    expect(prompt).not.toContain('手动映射')
  })

  it('@p2 should specify coverage status enum values', () => {
    const prompt = generateTraceabilityPrompt(baseContext)
    expect(prompt).toContain('covered')
    expect(prompt).toContain('partial')
    expect(prompt).toContain('uncovered')
  })
})
