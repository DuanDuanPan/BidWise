import type { DiagramType } from '@main/services/diagram-validation-service'
import {
  MERMAID_DECLARATION_FOLLOWUP_RULE,
  MERMAID_DECLARATION_ORDER_RULE,
  SUPPORTED_MERMAID_TYPE_HINT,
} from '@main/services/diagram-runtime/mermaid-source'

export interface GenerateDiagramPromptContext {
  diagramType: DiagramType
  chapterTitle: string
  diagramTitle: string
  diagramDescription: string
  chapterMarkdown: string
}

export interface RepairDiagramPromptContext extends GenerateDiagramPromptContext {
  invalidOutput: string
  validationError: string
}

// ─── Mermaid styling reference ───

/** Industrial-grade color palette for Mermaid classDef */
const MERMAID_STYLE_REFERENCE = `### 配色方案（工业/技术文档风格）
使用 classDef 统一着色，禁止在节点定义中内联 style。

\`\`\`
classDef primary   fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333
classDef success   fill:#D5E8D4,stroke:#82B366,stroke-width:2px,color:#333
classDef warning   fill:#FFF2CC,stroke:#D6B656,stroke-width:2px,color:#333
classDef danger    fill:#F8CECC,stroke:#B85450,stroke-width:2px,color:#333
classDef neutral   fill:#F5F5F5,stroke:#666666,stroke-width:2px,color:#333
classDef emphasis  fill:#E1D5E7,stroke:#9673A6,stroke-width:2px,color:#333
classDef database  fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333
classDef external  fill:#FFE6CC,stroke:#D79B00,stroke-width:2px,color:#333
\`\`\`

### 配色语义映射
| 分类 | classDef | 适用场景 |
|------|----------|----------|
| primary | 核心业务模块、主流程节点 | 系统核心组件 |
| success | 成功/完成状态、正常流程 | 验收通过、部署完成 |
| warning | 需注意/审批节点、决策点 | 审核、条件判断 |
| danger | 错误/风险/告警 | 异常处理、故障节点 |
| neutral | 辅助说明、背景模块 | 基础设施、通用服务 |
| emphasis | 高亮/重点模块 | 创新点、核心优势 |
| database | 数据存储 | 数据库、缓存、消息队列 |
| external | 外部系统/第三方 | 外部接口、第三方服务 |

### 节点形状选择
| 形状 | 语法 | 适用场景 |
|------|------|----------|
| 圆角矩形 | \`[文字]\` | 默认处理节点 |
| 体育场形 | \`([文字])\` | 开始/结束 |
| 圆柱形 | \`[(文字)]\` | 数据库/存储 |
| 菱形 | \`{文字}\` | 决策/条件判断 |
| 六边形 | \`{{文字}}\` | 准备/初始化 |
| 平行四边形 | \`[/文字/]\` | 输入/输出 |
| 双线矩形 | \`[[文字]]\` | 子程序/外部服务调用 |
| 圆形 | \`((文字))\` | 连接点/汇聚点 |

### 布局规则
1. 流程图默认使用 TD（从上到下）；横向比较、时序流程使用 LR（从左到右）
2. 使用 subgraph 对逻辑分组（如 "子系统A"、"数据层"），subgraph 标题用中文
3. 每条边的标签不超过 6 个字
4. 使用 %%{init: ...}%% 前言设置主题：
   %%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%`

// ─── Draw.io styling reference ───

/** Professional draw.io color palette matching industrial documentation standards */
const DRAWIO_STYLE_REFERENCE = `### 配色方案
| 语义 | fillColor | strokeColor | 适用场景 |
|------|-----------|-------------|----------|
| 核心模块 | #DAE8FC | #6C8EBF | 主系统、核心服务 |
| 正常/就绪 | #D5E8D4 | #82B366 | 已部署、运行中 |
| 注意/决策 | #FFF2CC | #D6B656 | 审批节点、网关 |
| 告警/异常 | #F8CECC | #B85450 | 故障、异常路径 |
| 基础设施 | #F5F5F5 | #666666 | 服务器、网络设备 |
| 重点/创新 | #E1D5E7 | #9673A6 | 核心亮点 |
| 外部系统 | #FFE6CC | #D79B00 | 第三方、外部接口 |

### 形状选择
| 场景 | style 关键属性 | 说明 |
|------|----------------|------|
| 通用处理 | rounded=1;whiteSpace=wrap;html=1; | 圆角矩形 |
| 数据库/存储 | shape=cylinder3;whiteSpace=wrap;html=1; | 圆柱体 |
| 决策/条件 | rhombus;whiteSpace=wrap;html=1; | 菱形 |
| 文档 | shape=mxgraph.flowchart.document;whiteSpace=wrap;html=1; | 文档形状 |
| 容器/区域 | swimlane;startSize=30;html=1;fontStyle=1; | 泳道容器 |
| 开始/结束 | ellipse;whiteSpace=wrap;html=1; | 椭圆 |
| 分组容器 | 在任意形状上添加 container=1;pointerEvents=0; | 不可见容器 |

### 边线/箭头规则
1. 统一使用 edgeStyle=orthogonalEdgeStyle（直角拐弯），同一图内风格一致
2. 所有边必须包含 \`<mxGeometry relative="1" as="geometry" />\` 子元素
3. 添加 rounded=1;jettySize=auto; 使拐弯圆滑
4. 坐标对齐到 10 的倍数（gridSize=10），节点间距 ≥60px
5. 直接相连的节点在共享轴上居中对齐，使连线笔直

### 容器与嵌套
- 需要标题栏的容器使用 swimlane;startSize=30;
- 子元素必须设置 parent="容器id"，坐标相对于容器
- 容器上添加 pointerEvents=0; 防止捕获子元素连线

### HTML 标签
- 始终在 style 中包含 html=1;
- 换行使用 &#xa;（推荐）或 &lt;br&gt;（需html=1）
- 加粗部分标签：&lt;b&gt;标题&lt;/b&gt;&#xa;副标题`

const DRAWIO_FEW_SHOT = `<mxGraphModel dx="1268" dy="716" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="zone-app" value="应用服务层" style="swimlane;startSize=30;fillColor=#DAE8FC;strokeColor=#6C8EBF;fontStyle=1;html=1;rounded=1;" vertex="1" parent="1">
      <mxGeometry x="60" y="60" width="340" height="180" as="geometry" />
    </mxCell>
    <mxCell id="node-web" value="Web 应用服务" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#DAE8FC;strokeColor=#6C8EBF;" vertex="1" parent="zone-app">
      <mxGeometry x="20" y="50" width="140" height="50" as="geometry" />
    </mxCell>
    <mxCell id="node-api" value="API 网关" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#DAE8FC;strokeColor=#6C8EBF;" vertex="1" parent="zone-app">
      <mxGeometry x="180" y="50" width="140" height="50" as="geometry" />
    </mxCell>
    <mxCell id="zone-data" value="数据服务层" style="swimlane;startSize=30;fillColor=#D5E8D4;strokeColor=#82B366;fontStyle=1;html=1;rounded=1;" vertex="1" parent="1">
      <mxGeometry x="60" y="300" width="340" height="140" as="geometry" />
    </mxCell>
    <mxCell id="node-db" value="业务数据库" style="shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#D5E8D4;strokeColor=#82B366;size=12;" vertex="1" parent="zone-data">
      <mxGeometry x="100" y="45" width="120" height="70" as="geometry" />
    </mxCell>
    <mxCell id="edge-1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto;html=1;endArrow=classic;" edge="1" parent="1" source="node-web" target="node-api">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
    <mxCell id="edge-2" style="edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto;html=1;endArrow=classic;" edge="1" parent="1" source="node-api" target="node-db">
      <mxGeometry relative="1" as="geometry" />
    </mxCell>
  </root>
</mxGraphModel>`

export function generateDiagramPrompt(context: GenerateDiagramPromptContext): string {
  if (context.diagramType === 'drawio') {
    return [
      `## 任务`,
      `为章节「${context.chapterTitle}」生成一个 draw.io XML 图表。`,
      `图表标题：${context.diagramTitle}`,
      `图表意图：${context.diagramDescription}`,
      `## 章节正文`,
      context.chapterMarkdown,
      DRAWIO_STYLE_REFERENCE,
      `## 输出要求`,
      `1. 只输出完整的 mxGraph XML，不要输出 Markdown、解释、代码围栏或 JSON。`,
      `2. 根元素必须是 <mxGraphModel>，且必须包含 <root>、id=0 与 id=1 的基础 mxCell。`,
      `3. 根据语义选择合适的形状（参考上方形状表）：数据库用 cylinder3，决策用 rhombus，分区用 swimlane。不要所有节点都用矩形。`,
      `4. 使用上方配色方案着色，同类节点颜色统一，不同角色/层次用不同色系区分。`,
      `5. 所有中文标签必须和章节术语保持一致。`,
      `6. 坐标对齐到 10 的倍数，节点间距 ≥60px，布局清晰整齐，不超过 12 个节点。`,
      `7. 有层次/分区关系时使用 swimlane 容器，子元素设置正确的 parent 属性。`,
      `8. 统一使用 edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto; 风格。`,
      `9. 不要输出 XML 注释（<!-- -->）。`,
      `10. 生成完成后自检：(1) 直连节点是否在共享轴上对齐 (2) 连线是否穿越非目标节点 (3) 所有边是否包含 mxGeometry 子元素。`,
      `## 合格示例`,
      DRAWIO_FEW_SHOT,
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
    MERMAID_STYLE_REFERENCE,
    `## 图表类型选择`,
    `根据图表意图选择最合适的类型：`,
    `| 意图 | 推荐类型 |`,
    `|------|----------|`,
    `| 流程、步骤、审批 | flowchart TD/LR |`,
    `| API调用、系统交互 | sequenceDiagram |`,
    `| 类结构、模块关系 | classDiagram |`,
    `| 状态机、生命周期 | stateDiagram-v2 |`,
    `| 项目计划、里程碑 | gantt |`,
    `| 系统架构、C4模型 | C4Context / block-beta |`,
    `允许的图表类型白名单：${SUPPORTED_MERMAID_TYPE_HINT}。`,
    `默认优先使用 flowchart；仅在上表明确匹配时使用其他类型。`,
    `## 输出要求`,
    `1. 只输出 Mermaid DSL 正文，不要输出解释、Markdown 代码围栏或 JSON。`,
    `2. 第一行必须是 %%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%`,
    `3. ${MERMAID_DECLARATION_ORDER_RULE}`,
    `4. ${MERMAID_DECLARATION_FOLLOWUP_RULE}`,
    `5. 节点标签必须使用章节中出现过的术语，不要发明新模块名。`,
    `6. 结构保持简洁，不超过 12 个节点。`,
    `7. 必须使用 classDef 定义节点样式（参考上方配色方案），用 ::: 语法或 class 语句应用。`,
    `8. 根据语义选择合适的节点形状（参考上方形状表），不要所有节点都用方括号。`,
    `9. 使用 subgraph 对逻辑上属于同一层/同一区域的节点分组。`,
    `10. 不要使用 end 的全小写形式作为节点文本（用 End 或 完成）。`,
    `11. 生成完成后自检：图表类型声明是否位于 init 之后、节点形状是否与语义匹配、配色是否区分了不同角色、布局方向是否合理。`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function generateDiagramRepairPrompt(context: RepairDiagramPromptContext): string {
  if (context.diagramType === 'drawio') {
    return [
      `## 任务`,
      `修复下面的 draw.io XML 图表，使其通过程序校验。`,
      `图表标题：${context.diagramTitle}`,
      `图表意图：${context.diagramDescription}`,
      `## 章节正文`,
      context.chapterMarkdown,
      `## 校验错误`,
      context.validationError,
      `## 待修复源码`,
      context.invalidOutput,
      `## 输出要求`,
      `1. 只输出修复后的完整 mxGraph XML，不要输出解释、Markdown、代码围栏或 JSON。`,
      `2. 必须保留原始图表的核心结构、业务术语、配色方案和语义化形状。`,
      `3. 根元素必须是 <mxGraphModel>，且必须包含 <root>、id=0 与 id=1 的基础 mxCell。`,
      `4. 所有边必须包含 <mxGeometry relative="1" as="geometry" /> 子元素。`,
      `5. 统一使用 edgeStyle=orthogonalEdgeStyle;rounded=1;jettySize=auto; 风格。`,
      `6. 坐标对齐到 10 的倍数，节点总数不超过 12 个。`,
      `7. 不要输出 XML 注释（<!-- -->）。`,
      `8. 修复后自检：(1) XML 格式良好 (2) 所有 id 唯一 (3) 所有 parent 引用存在 (4) 每个内容 mxCell 有 vertex="1" 或 edge="1"。`,
    ].join('\n\n')
  }

  return [
    `## 任务`,
    `修复下面的 Mermaid 图表，使其通过程序校验。`,
    `图表标题：${context.diagramTitle}`,
    `图表意图：${context.diagramDescription}`,
    `## 章节正文`,
    context.chapterMarkdown,
    `## 校验错误`,
    context.validationError,
    `## 待修复源码`,
    context.invalidOutput,
    `## 输出要求`,
    `1. 只输出修复后的 Mermaid DSL 正文，不要输出解释、Markdown 代码围栏或 JSON。`,
    `2. 必须保留原始图表的核心结构、业务术语、classDef 配色和语义化节点形状。`,
    `3. 第一行必须是 %%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%`,
    `4. ${MERMAID_DECLARATION_ORDER_RULE}`,
    `5. ${MERMAID_DECLARATION_FOLLOWUP_RULE}`,
    `6. 节点标签必须使用章节中出现过的术语，不要发明新模块名。`,
    `7. 当前源码若把 classDef、class、linkStyle、style、subgraph 或节点定义放在图表类型声明之前，请直接调整顺序。`,
    `8. 不要使用 end 的全小写形式作为节点文本。`,
    `9. 结构保持简洁，不超过 12 个节点。`,
    `10. 修复后自检：(1) 语法能被 mermaid.parse() 通过 (2) 图表类型声明位于 init 之后 (3) classDef 已定义且已应用。`,
  ].join('\n\n')
}

export const GENERATE_DIAGRAM_SYSTEM_PROMPT =
  '你是一个工业级技术图表生成专家，专精于为投标文档和技术方案生成美观、专业、大方的架构图、流程图和系统拓扑图。你的图表面向甲方评审专家，必须体现技术深度和工程规范。请严格输出可被程序直接消费的图表源码，不要附加任何解释。'

export const REPAIR_DIAGRAM_SYSTEM_PROMPT =
  '你是一个工业级技术图表修复专家。请根据给定的源码和校验错误，输出一份修复后的图表源码。修复时保留原图的专业配色、语义化形状和布局结构，仅修正校验错误。不要附加任何解释。'
