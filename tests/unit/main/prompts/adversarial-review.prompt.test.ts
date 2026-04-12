import { describe, expect, it } from 'vitest'
import { buildAdversarialReviewPrompt } from '@main/prompts/adversarial-review.prompt'

describe('buildAdversarialReviewPrompt', () => {
  const baseContext = {
    roleName: '技术专家',
    rolePerspective: '从技术架构角度审查方案',
    attackFocus: ['高可用设计', '性能指标', '技术选型'],
    intensity: 'medium' as const,
    roleDescription: '技术审查角色',
    proposalContent: '# 方案概述\n这是一个测试方案...',
  }

  it('should include role name and perspective in prompt', () => {
    const { prompt } = buildAdversarialReviewPrompt(baseContext)
    expect(prompt).toContain('技术专家')
    expect(prompt).toContain('从技术架构角度审查方案')
  })

  it('should include all attack focus items', () => {
    const { prompt } = buildAdversarialReviewPrompt(baseContext)
    expect(prompt).toContain('高可用设计')
    expect(prompt).toContain('性能指标')
    expect(prompt).toContain('技术选型')
  })

  it('should include proposal content', () => {
    const { prompt } = buildAdversarialReviewPrompt(baseContext)
    expect(prompt).toContain('方案概述')
    expect(prompt).toContain('测试方案')
  })

  it('should map high intensity to temperature 0.8', () => {
    const { temperature } = buildAdversarialReviewPrompt({ ...baseContext, intensity: 'high' })
    expect(temperature).toBe(0.8)
  })

  it('should map medium intensity to temperature 0.6', () => {
    const { temperature } = buildAdversarialReviewPrompt({ ...baseContext, intensity: 'medium' })
    expect(temperature).toBe(0.6)
  })

  it('should map low intensity to temperature 0.4', () => {
    const { temperature } = buildAdversarialReviewPrompt({ ...baseContext, intensity: 'low' })
    expect(temperature).toBe(0.4)
  })

  it('should set maxTokens to 4096', () => {
    const { maxTokens } = buildAdversarialReviewPrompt(baseContext)
    expect(maxTokens).toBe(4096)
  })

  it('should include scoring criteria when provided', () => {
    const { prompt } = buildAdversarialReviewPrompt({
      ...baseContext,
      scoringCriteria: '- 技术方案（40分，权重0.4）',
    })
    expect(prompt).toContain('评分标准')
    expect(prompt).toContain('技术方案（40分，权重0.4）')
  })

  it('should include mandatory items when provided', () => {
    const { prompt } = buildAdversarialReviewPrompt({
      ...baseContext,
      mandatoryItems: '- 投标保证金\n- 资质证明',
    })
    expect(prompt).toContain('必响应项')
    expect(prompt).toContain('投标保证金')
  })

  it('should include JSON output format specification', () => {
    const { prompt } = buildAdversarialReviewPrompt(baseContext)
    expect(prompt).toContain('severity')
    expect(prompt).toContain('sectionRef')
    expect(prompt).toContain('content')
    expect(prompt).toContain('suggestion')
    expect(prompt).toContain('reasoning')
    expect(prompt).toContain('JSON 数组')
  })

  it('should include intensity instruction in prompt', () => {
    const { prompt: highPrompt } = buildAdversarialReviewPrompt({
      ...baseContext,
      intensity: 'high',
    })
    expect(highPrompt).toContain('最严格')

    const { prompt: lowPrompt } = buildAdversarialReviewPrompt({
      ...baseContext,
      intensity: 'low',
    })
    expect(lowPrompt).toContain('仅关注关键性问题')
  })
})
