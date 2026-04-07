import { describe, it, expect } from 'vitest'
import { classifyCertaintyPrompt } from '@main/prompts/classify-certainty.prompt'
import type { ClassifyCertaintyPromptContext } from '@main/prompts/classify-certainty.prompt'
import type {
  RequirementItem,
  ScoringModel,
  MandatoryItem,
  TenderSection,
} from '@shared/analysis-types'

describe('classifyCertaintyPrompt', () => {
  const mockRequirements: RequirementItem[] = [
    {
      id: 'req-001',
      sequenceNumber: 1,
      description: '系统须支持99.9%高可用架构，采用双活部署模式',
      sourcePages: [8, 9],
      category: 'technical',
      priority: 'high',
      status: 'confirmed',
    },
    {
      id: 'req-002',
      sequenceNumber: 2,
      description: '系统应具备良好的可扩展性，满足未来业务发展需要',
      sourcePages: [12],
      category: 'technical',
      priority: 'medium',
      status: 'extracted',
    },
    {
      id: 'req-003',
      sequenceNumber: 3,
      description: '投标人须在中标后30日内完成项目启动会',
      sourcePages: [25],
      category: 'implementation',
      priority: 'low',
      status: 'confirmed',
    },
  ]

  const mockScoringModel: ScoringModel = {
    projectId: 'proj-001',
    totalScore: 100,
    criteria: [
      {
        id: 'sc-001',
        category: '技术方案',
        maxScore: 40,
        weight: 0.4,
        subItems: [],
        reasoning: '技术架构合理性',
        status: 'confirmed',
      },
      {
        id: 'sc-002',
        category: '项目经验',
        maxScore: 30,
        weight: 0.3,
        subItems: [],
        reasoning: '类似项目案例',
        status: 'confirmed',
      },
      {
        id: 'sc-003',
        category: '服务保障',
        maxScore: 10,
        weight: 0.1,
        subItems: [],
        reasoning: '售后服务承诺',
        status: 'confirmed',
      },
    ],
    extractedAt: '2026-04-01T10:00:00.000Z',
    confirmedAt: '2026-04-01T12:00:00.000Z',
    version: 1,
  }

  const mockMandatoryItems: MandatoryItem[] = [
    {
      id: 'mand-001',
      content: '投标人须具有等保三级认证',
      sourceText: '投标人须具有信息系统安全等级保护三级认证',
      sourcePages: [3, 4],
      confidence: 0.95,
      status: 'confirmed',
      linkedRequirementId: null,
      detectedAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
    {
      id: 'mand-002',
      content: '必须提供投标保证金50万元',
      sourceText: '投标保证金：人民币伍拾万元整',
      sourcePages: [5],
      confidence: 0.98,
      status: 'confirmed',
      linkedRequirementId: null,
      detectedAt: '2026-04-01T10:00:00.000Z',
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
  ]

  const mockTenderSections: TenderSection[] = [
    {
      id: 'sec-001',
      title: '投标须知',
      content: '投标须知内容',
      pageStart: 1,
      pageEnd: 5,
      level: 1,
    },
    {
      id: 'sec-002',
      title: '技术要求',
      content: '技术要求内容',
      pageStart: 6,
      pageEnd: 20,
      level: 1,
    },
    {
      id: 'sec-003',
      title: '商务条款',
      content: '商务条款内容',
      pageStart: 21,
      pageEnd: 30,
      level: 1,
    },
  ]

  const baseContext: ClassifyCertaintyPromptContext = {
    requirements: mockRequirements,
    scoringModel: mockScoringModel,
    mandatoryItems: mockMandatoryItems,
    tenderSections: mockTenderSections,
  }

  it('should contain key instructions for three-color certainty classification', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('clear')
    expect(prompt).toContain('ambiguous')
    expect(prompt).toContain('risky')
    expect(prompt).toContain('明确')
    expect(prompt).toContain('模糊')
    expect(prompt).toContain('风险')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('requirementId')
    expect(prompt).toContain('certaintyLevel')
  })

  it('should include all requirements in the prompt with correct format', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('req-001')
    expect(prompt).toContain('req-002')
    expect(prompt).toContain('req-003')
    expect(prompt).toContain('99.9%高可用架构')
    expect(prompt).toContain('良好的可扩展性')
    expect(prompt).toContain('30日内完成项目启动会')
    expect(prompt).toContain('共 3 条')
  })

  it('should include scoring model context when scoringModel is provided', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('评分模型参考')
    expect(prompt).toContain('技术方案')
    expect(prompt).toContain('40分')
    expect(prompt).toContain('40%')
    expect(prompt).toContain('项目经验')
    expect(prompt).toContain('100')
  })

  it('should omit scoring context when scoringModel is null', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      scoringModel: null,
    })
    expect(prompt).not.toContain('评分模型参考')
    expect(prompt).not.toContain('高权重评分类别')
  })

  it('should omit scoring context when scoringModel has empty criteria', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      scoringModel: {
        ...mockScoringModel,
        criteria: [],
      },
    })
    expect(prompt).not.toContain('评分模型参考')
  })

  it('should include mandatory items context when mandatoryItems is provided', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('必响应项参考')
    expect(prompt).toContain('等保三级认证')
    expect(prompt).toContain('投标保证金50万元')
  })

  it('should omit mandatory context when mandatoryItems is null', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      mandatoryItems: null,
    })
    expect(prompt).not.toContain('必响应项参考')
    expect(prompt).not.toContain('等保三级认证')
  })

  it('should omit mandatory context when mandatoryItems is empty array', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      mandatoryItems: [],
    })
    expect(prompt).not.toContain('必响应项参考')
  })

  it('should include tender section structure when tenderSections is provided', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('招标文件结构')
    expect(prompt).toContain('投标须知')
    expect(prompt).toContain('技术要求')
    expect(prompt).toContain('商务条款')
  })

  it('should omit section context when tenderSections is null', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      tenderSections: null,
    })
    expect(prompt).not.toContain('招标文件结构')
    expect(prompt).not.toContain('投标须知')
  })

  it('should omit section context when tenderSections is empty array', () => {
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      tenderSections: [],
    })
    expect(prompt).not.toContain('招标文件结构')
  })

  it('should generate correct prompt with all optional contexts omitted', () => {
    const minimalContext: ClassifyCertaintyPromptContext = {
      requirements: mockRequirements,
      scoringModel: null,
      mandatoryItems: null,
      tenderSections: null,
    }
    const prompt = classifyCertaintyPrompt(minimalContext)

    // Core instructions should still be present
    expect(prompt).toContain('clear')
    expect(prompt).toContain('ambiguous')
    expect(prompt).toContain('risky')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('requirementId')

    // Requirements should still be included
    expect(prompt).toContain('req-001')
    expect(prompt).toContain('req-002')
    expect(prompt).toContain('req-003')

    // Optional sections should all be absent
    expect(prompt).not.toContain('评分模型参考')
    expect(prompt).not.toContain('必响应项参考')
    expect(prompt).not.toContain('招标文件结构')
  })

  it('should only include high-weight scoring criteria in scoring context', () => {
    const lowWeightOnly: ScoringModel = {
      ...mockScoringModel,
      criteria: [
        {
          id: 'sc-low',
          category: '其他加分项',
          maxScore: 5,
          weight: 0.05,
          subItems: [],
          reasoning: '额外加分',
          status: 'confirmed',
        },
      ],
    }
    const prompt = classifyCertaintyPrompt({
      ...baseContext,
      scoringModel: lowWeightOnly,
    })
    // The section is present because criteria.length > 0
    expect(prompt).toContain('评分模型参考')
    // But the low-weight item should not appear in the high-weight list
    expect(prompt).toContain('无高权重项')
  })

  it('should include reason and suggestion fields in output schema', () => {
    const prompt = classifyCertaintyPrompt(baseContext)
    expect(prompt).toContain('reason')
    expect(prompt).toContain('suggestion')
  })
})
