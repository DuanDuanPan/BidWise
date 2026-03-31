/**
 * Detect mandatory response items (*项) prompt template (Story 2.6)
 *
 * Recall-first strategy: false positives acceptable, misses are NOT.
 */

export interface DetectMandatoryContext {
  sections: Array<{ title: string; content: string; pageStart: number; pageEnd: number }>
  rawText: string
  totalPages: number
  hasScannedContent?: boolean
  existingRequirements: Array<{ description: string; sourcePages: number[] }>
}

export function detectMandatoryPrompt(context: DetectMandatoryContext): string {
  const sectionsSummary = context.sections
    .map((s) => `[页${s.pageStart}-${s.pageEnd}] ${s.title}`)
    .join('\n')

  const requirementsSummary =
    context.existingRequirements.length > 0
      ? context.existingRequirements
          .map((r, i) => `${i + 1}. ${r.description} (页${r.sourcePages.join(',')})`)
          .join('\n')
      : '（尚未提取需求条目）'

  const scannedNote = context.hasScannedContent
    ? '\n注意：该文件包含扫描件内容，部分文字可能存在 OCR 识别误差，请结合上下文推断。'
    : ''

  return `你是一位资深售前工程师，专精招标文件合规分析。你的任务是从招标文件中识别所有**必须响应的条目（*项）**。

## 核心原则

**召回率必须为 100%——宁可多标，绝不遗漏。**

漏标一条*项可能导致废标，而多标几条只需人工复核驳回。因此：
- 任何疑似*项都必须标出
- 即使只有 50% 把握也要列入，并给出较低的 confidence 分数
- 涵盖所有类型的强制要求，不仅限于技术要求

## 识别范围

请扫描招标文件全文，识别以下所有类型的强制响应条目：

1. **资质要求**：营业执照、资质证书、认证要求、人员资质等
2. **技术硬性指标**：必须满足的技术参数、性能指标、兼容性要求等
3. **格式/文件要求**：投标文件格式、份数、装订、签章、密封等
4. **保证金/费用**：投标保证金、履约保证金及其提交方式和时限
5. **响应时限**：投标截止时间、澄清截止时间、有效期等
6. **服务承诺**：必须承诺的响应时间、驻场要求、培训要求等
7. **废标条款**：文件中明确列出的会导致废标/无效的情形
8. **偏离限制**：不允许偏离的条款、负偏离限制等
9. **其他强制条款**：任何使用"必须"、"应当"、"不得"、"否则"等强制性语言的条款

## 识别信号词

重点关注包含以下关键词的段落：
- 强制性：必须、应当、须、需要、要求、不得、不允许、严禁
- 后果性：否则、废标、无效、不予受理、取消资格、视为放弃
- 条件性：必备条件、前置条件、准入条件、资格要求
- 响应性：必须响应、应予响应、*项、实质性响应

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "content": "投标人必须具有有效的营业执照",
    "sourceText": "投标人必须具有有效的营业执照，且注册资金不低于500万元人民币，否则视为不合格投标",
    "sourcePages": [5],
    "confidence": 0.95
  }
]
\`\`\`

字段说明：
- **content**：精简的*项描述（一句话概括）
- **sourceText**：原文摘录（包含上下文的完整句子或段落）
- **sourcePages**：出现页码数组
- **confidence**：置信度 0-1（0.9+ 极高把握，0.7-0.9 较高，0.5-0.7 疑似）

如果未识别到任何*项，返回空数组 \`[]\`。
${scannedNote}
## 已提取的需求条目（供参考交叉验证）

${requirementsSummary}

## 招标文件信息

- 总页数：${context.totalPages}
- 文档结构：
${sectionsSummary}

## 招标文件全文

${context.rawText}`
}
