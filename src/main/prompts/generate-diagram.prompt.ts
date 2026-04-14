import type { DiagramType } from '@main/services/diagram-validation-service'

export interface GenerateDiagramPromptContext {
  diagramType: DiagramType
  chapterTitle: string
  diagramTitle: string
  diagramDescription: string
  chapterMarkdown: string
  repairFeedback?: string
  previousOutput?: string
}

const DRAWIO_FEW_SHOT = `<mxGraphModel dx="1268" dy="716" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="node-a" value="输入层" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="120" y="120" width="140" height="60" as="geometry" />
    </mxCell>
    <mxCell id="node-b" value="处理层" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="360" y="120" width="140" height="60" as="geometry" />
    </mxCell>
    <mxCell id="edge-1" style="endArrow=block;html=1;rounded=0;" edge="1" parent="1" source="node-a" target="node-b">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`

export function generateDiagramPrompt(context: GenerateDiagramPromptContext): string {
  const repairSection =
    context.repairFeedback || context.previousOutput
      ? `## 修正上下文
${context.repairFeedback ? `- 校验反馈：${context.repairFeedback}` : ''}
${context.previousOutput ? `- 上一轮输出：\n${context.previousOutput}` : ''}`.trim()
      : ''

  if (context.diagramType === 'drawio') {
    return [
      `## 任务`,
      `为章节「${context.chapterTitle}」生成一个 draw.io XML 图表。`,
      `图表标题：${context.diagramTitle}`,
      `图表意图：${context.diagramDescription}`,
      `## 章节正文`,
      context.chapterMarkdown,
      `## 输出要求`,
      `1. 只输出完整的 mxGraph XML，不要输出 Markdown、解释、代码围栏或 JSON。`,
      `2. 根元素必须是 <mxGraphModel>，且必须包含 <root>、id=0 与 id=1 的基础 mxCell。`,
      `3. 只允许使用基础矩形节点、文本标签和箭头连线，不要使用复杂样式。`,
      `4. 所有中文标签必须和章节术语保持一致。`,
      `5. 优先布局简洁、可读，不超过 8 个节点。`,
      `## 合格示例`,
      DRAWIO_FEW_SHOT,
      repairSection,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  return [
    `## 任务`,
    `为章节「${context.chapterTitle}」生成一个 Mermaid 图表。`,
    `图表标题：${context.diagramTitle}`,
    `图表意图：${context.diagramDescription}`,
    `## 章节正文`,
    context.chapterMarkdown,
    `## 输出要求`,
    `1. 只输出 Mermaid DSL 正文，不要输出解释、Markdown 代码围栏或 JSON。`,
    `2. 默认优先使用 flowchart / graph；仅在明显更合适时使用 sequenceDiagram、classDiagram、stateDiagram、gantt。`,
    `3. 节点标签必须使用章节中出现过的术语，不要发明新模块名。`,
    `4. 结构保持简洁，不超过 10 个节点。`,
    repairSection,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export const GENERATE_DIAGRAM_SYSTEM_PROMPT =
  '你是一个技术图表生成助手。请严格输出可被程序直接消费的图表源码，不要附加任何解释。'
