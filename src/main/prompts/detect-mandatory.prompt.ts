/**
 * Detect explicit * / ★ marked technical clauses prompt template (Story 2.6)
 *
 * Precision-first scope: only explicit star-marked important technical clauses/parameters.
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
    ? '\n注意：该文件包含扫描件内容，若 OCR 丢失了 `*` / `★` 符号，可根据“加注星号的重要技术条款/技术参数/技术支持资料”等上下文谨慎恢复。'
    : ''

  return `你是一位资深售前工程师，专精招标文件合规分析。你的任务是从招标文件中识别所有**显式加注 \`*\` / \`★\` 的重要技术条款或技术参数（*项）**。

## 核心原则

**这是一个高精度任务，不是泛化的“强制条款识别”。**

请严格遵守：
- 只提取显式带有 \`*\`、\`★\` 等星标的技术条款/技术参数
- 如果文件明确说明“加注星号的重要技术条款/技术参数集中在某章节”，则优先在该章节中识别
- 只有在 OCR 明显丢失星标、但上下文强烈表明该条款属于星标技术条款时，才允许谨慎推断
- **不要**因为出现“必须 / 应当 / 不得 / 否则 / 废标”等措辞，就把普通强制条款识别为 *项

## 明确排除

以下内容除非自身带有星标，否则一律不要输出：
- 营业执照、资质证书、人员资质等资格要求
- 投标保证金、履约保证金、截止时间等通用商务/流程条款
- 投标文件格式、签章、密封、装订等形式要求
- 一般性的服务承诺、废标条款、负偏离条款

## 优先识别信号

重点关注：
- \`*8.2.2.7\`、\`★8.5.1\` 这类“星标 + 条款编号”模式
- “加注星号的重要技术条款/技术参数”
- “技术支持资料”
- “重要技术条款”
- “技术参数”
- “供货要求 / 技术要求 / 技术规格”中被星标的子项

## 输出格式

严格按以下 JSON 数组格式输出，不要添加任何多余文字：

\`\`\`json
[
  {
    "content": "*8.2.2.7 自动生成模块",
    "sourceText": "*8.2.2.7 自动生成模块。工业 APP 能与协同设计管理系统、NX、AMEsim、超算平台集成使用。",
    "sourcePages": [53],
    "confidence": 0.98
  }
]
\`\`\`

字段说明：
- **content**：精简的 *项描述，优先保留星标和条款编号
- **sourceText**：原文摘录，尽量保留完整技术要求
- **sourcePages**：出现页码数组
- **confidence**：置信度 0-1；显式星标通常应为 0.9 以上，OCR 推断可适当降低

如果未识别到任何 *项，返回空数组 \`[]\`。
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
