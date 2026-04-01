/**
 * Strategy seed generation prompt template (Story 2.7)
 *
 * Insight-first strategy: extract hidden customer needs from communication materials.
 */

export interface GenerateSeedPromptContext {
  sourceMaterial: string
  existingRequirements?: Array<{ description: string; sourcePages: number[] }>
  scoringModel?: {
    criteria: Array<{ category: string; maxScore: number; weight: number }>
  }
  mandatoryItems?: Array<{ content: string }>
}

export function generateSeedPrompt(context: GenerateSeedPromptContext): string {
  const requirementsSummary =
    context.existingRequirements && context.existingRequirements.length > 0
      ? context.existingRequirements.map((r, i) => `${i + 1}. ${r.description}`).join('\n')
      : '（尚未提取需求条目）'

  const scoringModelSummary =
    context.scoringModel && context.scoringModel.criteria.length > 0
      ? context.scoringModel.criteria
          .map((c) => `- ${c.category}（满分 ${c.maxScore}，权重 ${c.weight}）`)
          .join('\n')
      : '（尚未提取评分模型）'

  const mandatoryItemsSummary =
    context.mandatoryItems && context.mandatoryItems.length > 0
      ? context.mandatoryItems.map((m, i) => `${i + 1}. ${m.content}`).join('\n')
      : '（尚未识别必响应项）'

  return `你是一位资深售前工程师，擅长从客户沟通中捕捉隐性需求。你的任务是分析以下客户沟通素材，提取招标文件之外的**策略种子**——即客户真正在意但不一定写在招标文件中的 20%。

## 分析维度

请从以下维度深入分析沟通素材：

1. **客户痛点**：客户反复提及或强调的问题、挑战、不满
2. **决策者偏好**：关键决策人的个人倾向、关注焦点、过往经验影响
3. **竞争差异化**：客户提及的竞品优劣、对比维度、替换意愿
4. **隐含约束**：未明确写入招标文件但沟通中透露的限制条件
5. **成功标准**：客户对"项目成功"的定义，可能超出合同交付范围
6. **高权重评分项关注**：评分模型中高权重项背后的深层关注

## 交叉参考

请结合以下已有分析结果，确保策略种子不与已提取的需求重复，而是补充招标文件未覆盖的隐性信息：

### 已提取需求条目
${requirementsSummary}

### 评分模型
${scoringModelSummary}

### 必响应项
${mandatoryItemsSummary}

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "title": "策略种子标题（10-30字）",
    "reasoning": "分析推理过程（50-200字）——为什么这是一个隐性需求",
    "suggestion": "投标策略建议（50-200字）——方案中如何体现和回应",
    "sourceExcerpt": "原文摘录（支撑该判断的沟通素材原文片段）",
    "confidence": 0.85
  }
]
\`\`\`

字段说明：
- **title**：精简的策略种子标题（10-30字）
- **reasoning**：分析推理过程，解释为什么认为这是客户的隐性需求（50-200字）
- **suggestion**：投标方案中如何体现和回应这个隐性需求（50-200字）
- **sourceExcerpt**：支撑判断的沟通素材原文片段
- **confidence**：置信度 0-1（0.9+ 非常确定，0.7-0.9 较确定，0.5-0.7 推测性）

请生成 3-10 个策略种子。如果沟通素材中没有明显的隐性需求线索，可以返回少于 3 个甚至空数组 \`[]\`。

## 客户沟通素材

${context.sourceMaterial}`
}
