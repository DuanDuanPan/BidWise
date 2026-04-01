import { describe, it, expect } from 'vitest'
import { generateSeedPrompt } from '@main/prompts/generate-seed.prompt'
import type { GenerateSeedPromptContext } from '@main/prompts/generate-seed.prompt'

describe('generateSeedPrompt', () => {
  const baseContext: GenerateSeedPromptContext = {
    sourceMaterial: '客户在会议中多次强调数据安全是核心关注点，并要求支持国密算法。',
  }

  it('should contain key analysis dimensions', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('客户痛点')
    expect(prompt).toContain('决策者偏好')
    expect(prompt).toContain('竞争差异化')
    expect(prompt).toContain('隐含约束')
    expect(prompt).toContain('成功标准')
  })

  it('should contain JSON output schema fields', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('title')
    expect(prompt).toContain('reasoning')
    expect(prompt).toContain('suggestion')
    expect(prompt).toContain('sourceExcerpt')
    expect(prompt).toContain('confidence')
  })

  it('should include the source material', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('数据安全是核心关注点')
    expect(prompt).toContain('国密算法')
  })

  it('should show placeholder when no requirements provided', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('尚未提取需求条目')
  })

  it('should show placeholder when no scoring model provided', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('尚未提取评分模型')
  })

  it('should show placeholder when no mandatory items provided', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('尚未识别必响应项')
  })

  it('should include existing requirements when provided', () => {
    const prompt = generateSeedPrompt({
      ...baseContext,
      existingRequirements: [
        { description: '系统须支持千万级数据处理', sourcePages: [10, 11] },
        { description: '响应时间不超过3秒', sourcePages: [15] },
      ],
    })
    expect(prompt).toContain('系统须支持千万级数据处理')
    expect(prompt).toContain('响应时间不超过3秒')
    expect(prompt).not.toContain('尚未提取需求条目')
  })

  it('should include scoring model when provided', () => {
    const prompt = generateSeedPrompt({
      ...baseContext,
      scoringModel: {
        criteria: [
          { category: '技术方案', maxScore: 40, weight: 0.4 },
          { category: '项目经验', maxScore: 30, weight: 0.3 },
        ],
      },
    })
    expect(prompt).toContain('技术方案')
    expect(prompt).toContain('满分 40')
    expect(prompt).toContain('权重 0.4')
    expect(prompt).not.toContain('尚未提取评分模型')
  })

  it('should include mandatory items when provided', () => {
    const prompt = generateSeedPrompt({
      ...baseContext,
      mandatoryItems: [{ content: '必须提供资质证书' }, { content: '投标保证金50万元' }],
    })
    expect(prompt).toContain('必须提供资质证书')
    expect(prompt).toContain('投标保证金50万元')
    expect(prompt).not.toContain('尚未识别必响应项')
  })

  it('should request 3-10 seeds and allow empty array', () => {
    const prompt = generateSeedPrompt(baseContext)
    expect(prompt).toContain('3-10')
    expect(prompt).toContain('[]')
  })
})
