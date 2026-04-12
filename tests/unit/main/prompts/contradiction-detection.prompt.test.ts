import { describe, expect, it } from 'vitest'
import { buildContradictionDetectionPrompt } from '@main/prompts/contradiction-detection.prompt'

describe('buildContradictionDetectionPrompt', () => {
  it('should include all finding summaries in prompt', () => {
    const { prompt } = buildContradictionDetectionPrompt({
      findings: [
        {
          id: 'f1',
          roleId: 'r1',
          roleName: '技术专家',
          content: '需要微服务架构',
          sectionRef: '第3章',
        },
        {
          id: 'f2',
          roleId: 'r2',
          roleName: '运维专家',
          content: '运维复杂度太高',
          sectionRef: '第3章',
        },
      ],
    })

    expect(prompt).toContain('f1')
    expect(prompt).toContain('f2')
    expect(prompt).toContain('技术专家')
    expect(prompt).toContain('运维专家')
    expect(prompt).toContain('需要微服务架构')
    expect(prompt).toContain('运维复杂度太高')
  })

  it('should handle findings with null sectionRef', () => {
    const { prompt } = buildContradictionDetectionPrompt({
      findings: [
        { id: 'f1', roleId: 'r1', roleName: '合规', content: '缺少资质', sectionRef: null },
      ],
    })

    expect(prompt).toContain('无')
  })

  it('should set temperature to 0.3 for precise judgment', () => {
    const { temperature } = buildContradictionDetectionPrompt({ findings: [] })
    expect(temperature).toBe(0.3)
  })

  it('should set maxTokens to 2048', () => {
    const { maxTokens } = buildContradictionDetectionPrompt({ findings: [] })
    expect(maxTokens).toBe(2048)
  })

  it('should require JSON array output format', () => {
    const { prompt } = buildContradictionDetectionPrompt({ findings: [] })
    expect(prompt).toContain('findingIdA')
    expect(prompt).toContain('findingIdB')
    expect(prompt).toContain('contradictionReason')
    expect(prompt).toContain('JSON 数组')
  })

  it('should specify empty array for no contradictions', () => {
    const { prompt } = buildContradictionDetectionPrompt({ findings: [] })
    expect(prompt).toContain('空数组')
  })
})
