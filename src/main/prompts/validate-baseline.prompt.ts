/**
 * Validate baseline (基线交叉验证) prompt template.
 * Instructs AI to cross-validate product claims against a known product baseline.
 */

import type { RenderableParagraph } from '@shared/source-attribution-types'

export interface ValidateBaselineContext {
  chapterTitle: string
  paragraphs: RenderableParagraph[]
  productBaseline: string
}

export function validateBaselinePrompt(context: ValidateBaselineContext): string {
  const sections: string[] = []

  sections.push(`## 验证章节：${context.chapterTitle}`)

  sections.push(`## 产品能力基线\n${context.productBaseline}`)

  sections.push(`## 待验证段落`)
  for (const p of context.paragraphs) {
    sections.push(`[段落 ${p.paragraphIndex}] ${p.text}`)
  }

  sections.push(`## 验证要求
1. 逐段检查每个段落中的产品功能声明
2. 将声明与产品能力基线进行比对
3. 对于每个包含产品功能声明的段落，输出验证结果
4. 如果段落中不包含产品功能声明，可以跳过该段落
5. claim 字段为段落中提取的产品功能声明文本
6. matched 为 true 表示声明与基线匹配，false 表示不匹配
7. mismatchReason 仅在 matched=false 时提供，说明不匹配的原因
8. baselineRef 为基线中对应的参考条目，无法对应时省略`)

  sections.push(`## 输出格式
输出严格 JSON 数组，每个元素对应一个包含产品声明的段落：
\`\`\`json
[
  {
    "paragraphIndex": 0,
    "claim": "提取的产品功能声明",
    "baselineRef": "可选：基线参考条目",
    "matched": true,
    "mismatchReason": "仅不匹配时提供原因"
  }
]
\`\`\`
不要输出任何 JSON 之外的内容。`)

  return sections.join('\n\n')
}

export const VALIDATE_BASELINE_SYSTEM_PROMPT =
  '你是一个专业的产品功能验证助手（Product Baseline Validator）。你擅长将投标方案中的产品功能声明与已知的产品能力基线进行交叉验证，识别不存在或被夸大的功能描述。你的输出必须是严格的 JSON 格式。'
