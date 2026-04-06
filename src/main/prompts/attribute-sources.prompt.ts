/**
 * Attribute sources (来源标注) prompt template.
 * Instructs AI to analyze each paragraph and identify its likely source type.
 */

import type { RenderableParagraph } from '@shared/source-attribution-types'

export interface AttributeSourcesContext {
  chapterTitle: string
  paragraphs: RenderableParagraph[]
  availableAssetHints?: string[]
  knowledgeHints?: string[]
}

export function attributeSourcesPrompt(context: AttributeSourcesContext): string {
  const sections: string[] = []

  sections.push(`## 分析章节：${context.chapterTitle}`)

  sections.push(`## 待分析段落`)
  for (const p of context.paragraphs) {
    sections.push(`[段落 ${p.paragraphIndex}] ${p.text}`)
  }

  if (context.availableAssetHints?.length) {
    sections.push(`## 可用资产库素材提示\n${context.availableAssetHints.join('\n')}`)
  }

  if (context.knowledgeHints?.length) {
    sections.push(`## 可用知识库提示\n${context.knowledgeHints.join('\n')}`)
  }

  sections.push(`## 分析要求
1. 逐段判断每个段落的最可能来源类型
2. 来源类型必须是以下之一：
   - \`asset-library\`: 内容源自公司资产库（案例、模板、素材）
   - \`knowledge-base\`: 内容源自知识库（技术文档、标准规范）
   - \`ai-inference\`: AI 基于上下文推理生成的内容
   - \`no-source\`: 无法确定来源，禁止编造
3. 无法确定来源时必须标记为 \`no-source\`，禁止编造来源
4. confidence 取值 0-1，表示来源判断的置信度
5. sourceRef 为来源的具体引用路径或描述，无法确定时省略
6. snippet 为来源的关键匹配片段引用，无法确定时省略`)

  sections.push(`## 输出格式
输出严格 JSON 数组，每个元素对应一个段落：
\`\`\`json
[
  {
    "paragraphIndex": 0,
    "sourceType": "asset-library" | "knowledge-base" | "ai-inference" | "no-source",
    "sourceRef": "可选：来源引用路径",
    "snippet": "可选：匹配片段",
    "confidence": 0.85
  }
]
\`\`\`
不要输出任何 JSON 之外的内容。`)

  return sections.join('\n\n')
}

export const ATTRIBUTE_SOURCES_SYSTEM_PROMPT =
  '你是一个专业的内容来源分析助手（Content Source Attribution Assistant）。你擅长分析投标方案章节中每个段落的内容来源，判断其是来自资产库素材、知识库文档、AI 推理生成，还是无法确定来源。你的输出必须是严格的 JSON 格式。无法确定来源时必须标记为 no-source，禁止编造来源。'
