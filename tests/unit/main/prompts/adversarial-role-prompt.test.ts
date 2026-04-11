import { describe, it, expect } from 'vitest'
import { adversarialRolePrompt } from '@main/prompts/adversarial-role.prompt'

describe('adversarialRolePrompt @story-7-2', () => {
  const baseContext = {
    requirements: '1. 系统支持国密算法\n2. 需要分布式部署',
    scoringCriteria: '- 技术方案（50分，权重0.5）\n- 项目管理（30分，权重0.3）',
  }

  it('includes requirements and scoring criteria in output', () => {
    const result = adversarialRolePrompt(baseContext)
    expect(result).toContain('系统支持国密算法')
    expect(result).toContain('技术方案（50分')
  })

  it('requires strict JSON output format', () => {
    const result = adversarialRolePrompt(baseContext)
    expect(result).toContain('JSON 数组')
    expect(result).toContain('"isComplianceRole"')
    expect(result).toContain('"attackFocus"')
    expect(result).toContain('"intensity"')
  })

  it('instructs for Chinese role content', () => {
    const result = adversarialRolePrompt(baseContext)
    expect(result).toContain('中文')
  })

  it('includes optional context when provided', () => {
    const result = adversarialRolePrompt({
      ...baseContext,
      strategySeeds: '- 数据安全: 强调加密能力',
      proposalType: '技术标',
      mandatoryItems: '- 项目经理需在中标后3日到岗',
    })
    expect(result).toContain('数据安全: 强调加密能力')
    expect(result).toContain('技术标')
    expect(result).toContain('项目经理需在中标后3日到岗')
  })

  it('omits optional sections when not provided', () => {
    const result = adversarialRolePrompt(baseContext)
    expect(result).not.toContain('策略种子')
    expect(result).not.toContain('投标类型')
    expect(result).not.toContain('必响应项')
  })

  it('specifies isComplianceRole constraint — only one true', () => {
    const result = adversarialRolePrompt(baseContext)
    expect(result).toContain('有且仅有一个')
    expect(result).toContain('isComplianceRole')
  })
})
