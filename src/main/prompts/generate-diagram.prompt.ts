import type { DiagramType } from '@main/services/diagram-validation-service'
import type { DiagramSemantic, MermaidDiagramKind } from '@main/services/diagram-intent-service'
import {
  MERMAID_DECLARATION_FOLLOWUP_RULE,
  MERMAID_DECLARATION_ORDER_RULE,
} from '@main/services/diagram-runtime/mermaid-source'

export interface GenerateDiagramPromptContext {
  diagramType: DiagramType
  chapterTitle: string
  diagramTitle: string
  diagramDescription: string
  chapterMarkdown: string
  diagramSemantic?: DiagramSemantic
  preferredMermaidType?: MermaidDiagramKind
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

// ─── Draw.io styling reference (Anthropic editorial warm style) ───

/** Warm editorial color palette — low-saturation, semantic, publication-quality */
const DRAWIO_STYLE_REFERENCE = `### 画布设置
- mxGraphModel 必须设置 background="#F2EFE8"（暖灰底色），grid="0"
- 画布尺寸：pageWidth="1654" pageHeight="1169"

### 外边框
每张图必须包含一个外边框，放在 XML 中所有节点之前（最先渲染），使图表有海报感：
\`\`\`
<mxCell id="border" value="" style="rounded=0;arcSize=3;fillColor=none;strokeColor=#B9B3AB;strokeWidth=1.5;pointerEvents=0;" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="1614" height="__H__" as="geometry"/>
</mxCell>
\`\`\`
height 设为最底部元素 y+height 再加 40px。pointerEvents=0 使其不可交互。

### 标题
每张图必须有一个居中标题节点，放在外边框之后：
\`\`\`
<mxCell id="title" value="图表标题" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;overflow=hidden;fontStyle=1;fontSize=28;fontColor=#1F1F1C;" vertex="1" parent="1">
  <mxGeometry x="80" y="40" width="1200" height="50" as="geometry"/>
</mxCell>
\`\`\`

### 语义配色（节点）
颜色编码语义，不是装饰。大部分画布保持中性色，语义强调色稀疏使用。

| 语义角色 | style 字符串 | 适用场景 |
|----------|-------------|----------|
| 核心/中性 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#E6E2DA;strokeColor=#8C867F;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 默认组件、通用模块 |
| 上下文/资源 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#EAF4FB;strokeColor=#6FA8D6;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 文件、文档、外部数据源 |
| 控制/编排 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#EEEAF9;strokeColor=#9A90D6;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 路由、调度、策略层 |
| 触发/入口 | rounded=1;whiteSpace=wrap;arcSize=50;fillColor=#F8E9E1;strokeColor=#D88966;strokeWidth=1.8;fontColor=#D88966;fontSize=20;fontStyle=1;html=1; | 用户输入、外部触发 |
| 完成/成功 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#CFE8D7;strokeColor=#71AE88;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 验收通过、完成状态 |
| 警告/重试 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#F3E4DA;strokeColor=#C88E6A;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 重试、中断、注意节点 |
| 决策/分支 | rhombus;whiteSpace=wrap;fillColor=#E6D7B4;strokeColor=#BFA777;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 条件判断、审批网关 |
| AI/LLM | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#D7E6DC;strokeColor=#7FB08F;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 模型调用、Agent 执行 |
| 禁用/可选 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#EFECE6;strokeColor=#B4AEA6;strokeWidth=1.8;fontColor=#7A756E;fontSize=20;html=1; | 未启用、低优先级 |
| 错误/异常 | rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#F8DFDA;strokeColor=#D96B63;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1; | 故障、异常路径 |

规则：同一张图中语义强调色不超过 4 种；stroke 永远比 fill 深。

### 形状选择
| 场景 | style 关键属性 | 说明 |
|------|----------------|------|
| 通用处理 | rounded=1;whiteSpace=wrap;arcSize=10;html=1; | 圆角矩形 |
| 数据库/存储 | shape=cylinder3;whiteSpace=wrap;html=1; | 圆柱体 |
| 决策/条件 | rhombus;whiteSpace=wrap;html=1; | 菱形 |
| 药丸标签 | rounded=1;whiteSpace=wrap;arcSize=50;html=1; | 触发/入口节点 |
| 容器/区域 | swimlane;html=1; | 泳道容器 |
| 代码/证据 | rounded=1;whiteSpace=wrap;arcSize=6;fillColor=#EEF3F7;strokeColor=#B7C9D8;strokeWidth=1.5;fontColor=#44515C;fontSize=20;align=left;html=1; | 代码片段、数据示例 |

### 容器样式（三级层次）
所有容器 value 使用 HTML font 标签控制标签字号。

**外层面板**（系统边界）：
style: rounded=1;whiteSpace=wrap;arcSize=4;fillColor=#FAF8F4;strokeColor=#8C867F;strokeWidth=2;fontSize=18;fontStyle=1;fontColor=#5F5A54;swimlane;startSize=63;horizontal=1;html=1;
value: &lt;font style="font-size: 22px;"&gt;面板标题&lt;/font&gt;

**内层面板**（子系统分组）：
style: rounded=1;whiteSpace=wrap;arcSize=6;fillColor=#FAF8F4;strokeColor=#8C867F;strokeWidth=1.8;fontSize=16;fontStyle=1;fontColor=#5F5A54;swimlane;startSize=50;horizontal=1;html=1;
value: &lt;font style="font-size: 20px;"&gt;面板标题&lt;/font&gt;

**虚线区域**（弱分组、无强边界）：
style: rounded=1;fillColor=#F6F4EE;strokeColor=#B9B3AB;strokeWidth=1.5;dashed=1;dashPattern=6 6;fontSize=16;fontColor=#7A756E;html=1;
value: &lt;font style="font-size: 18px;"&gt;区域标签&lt;/font&gt;

容器子元素必须设置 parent="容器id"，坐标相对于容器。

### 连线/箭头样式
**最重要规则**：所有箭头必须使用开放 V 形箭头 endArrow=open;endSize=14; —— 这是编辑风格图表的核心视觉特征。禁止使用实心三角箭头。

所有连线使用 edgeStyle=orthogonalEdgeStyle + rounded=1 使拐弯平滑。

| 连线类型 | style 字符串 |
|----------|-------------|
| 主流程 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#7A756E;strokeWidth=1.8;rounded=1; |
| 可选/推测 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#9A948C;strokeWidth=1.6;rounded=1;dashed=1;dashPattern=6 6; |
| 反馈回路 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#8E8982;strokeWidth=1.8;rounded=1;curved=1; |
| 人工干预 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#D88966;strokeWidth=1.8;rounded=1;dashed=1;dashPattern=6 6; |
| 上下文/支持 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#7FB08F;strokeWidth=1.8;rounded=1; |
| 错误路径 | endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#D96B63;strokeWidth=1.8;rounded=1; |

每条边必须包含子元素：\`<mxGeometry relative="1" as="geometry"/>\`

### 布局规则
1. 节点间距：水平 ≥80px，垂直 ≥60px；推荐水平间距 200px（中心距），垂直 120px
2. 画布边距：最外层内容距边框 ≥60px
3. 坐标对齐到 10 的倍数
4. 标准节点尺寸 140×60 到 180×70；容器宽度 300–600+
5. 嵌套层级最多 3 层，优先用留白代替多余容器
6. 直接相连的节点在共享轴上居中对齐，使连线笔直

### 文本层级
| 层级 | fontColor | 用途 |
|------|-----------|------|
| 标题 | #1F1F1C | 图表主标题 |
| 副标题 | #5F5A54 | 面板标题、分区标题 |
| 正文 | #4F4A44 | 节点标签、连线标注 |
| 辅助 | #7A756E | 次要注释 |
| 节点内文字 | #2D2B28 | 大部分节点内的文字 |

### HTML 标签
- 始终在 style 中包含 html=1;
- 换行使用 &#xa;（推荐）或 &lt;br&gt;（需html=1）
- 加粗部分标签：&lt;b&gt;标题&lt;/b&gt;&#xa;副标题`

function buildDrawioSemanticHints(semantic?: DiagramSemantic): string {
  switch (semantic) {
    case 'overall-architecture':
      return [
        '模式：分层架构（Grouped Architecture）。',
        '布局：自上而下，每层用外层面板（swimlane）表示，层间用主流程连线。',
        '表现层、应用层、数据层、基础设施层各占一行，层内组件水平排列。',
        '外层面板间垂直间距 ≥40px，面板内子节点水平间距 ≥80px。',
        '用"核心/中性"色系做默认组件，仅对关键亮点使用"控制/编排"或"AI/LLM"色。',
      ].join('\n')
    case 'technical-architecture':
      return [
        '模式：分组架构（Grouped Architecture）。',
        '布局：突出核心组件、模块边界和组件间调用关系。',
        '使用内层面板按模块分组，面板内水平排列组件节点。',
        '避免把业务步骤画成流程图——重点是组件关系而非时序。',
        '面板间连线体现依赖关系，用"上下文/支持"连线表示非核心依赖。',
      ].join('\n')
    case 'business-architecture':
      return [
        '模式：泳道（Swimlane）。',
        '布局：每个业务域/角色占一个水平泳道，泳道从左到右排列。',
        '容器标题使用业务术语，泳道宽度 ≥300px。',
        '跨泳道连线用"主流程"样式，泳道内协作用"上下文/支持"连线。',
        '用"触发/入口"色标注起点角色，用"完成/成功"色标注产出节点。',
      ].join('\n')
    case 'data-architecture':
      return [
        '模式：线性工作流（Linear Workflow）。',
        '布局：数据从左到右流动——数据源 → 处理链路 → 存储分层 → 数据消费。',
        '每个阶段用虚线区域做弱分组，数据库节点使用 cylinder3 形状。',
        '主数据流用"主流程"连线，旁路/ETL 用"可选/推测"虚线连线。',
        '水平间距 ≥200px，保持单行主线清晰。',
      ].join('\n')
    case 'deployment-topology':
      return [
        '模式：分组架构（Grouped Architecture）。',
        '布局：突出环境边界（开发/测试/生产），每个环境用外层面板。',
        '节点、集群、网络设备用内层面板分组，部署组件水平排列。',
        '网络边界用虚线区域标注，跨环境连线用"人工干预"虚线样式。',
        '面板间保持 ≥60px 间距，拓扑结构从左到右或从上到下清晰排列。',
      ].join('\n')
    case 'integration-architecture':
      return [
        '模式：分栏对比（Split Comparison）。',
        '布局：内部系统和外部系统分置左右两个外层面板。',
        '接口/网关节点放在两面板之间，作为连接桥梁。',
        '内部→接口用"主流程"连线，接口→外部用"上下文/支持"连线。',
        '数据交换方向用连线标签标注（如"REST"、"消息队列"）。',
        '两面板宽度各 ≥500px，中间接口区域 ≥200px。',
      ].join('\n')
    default:
      return [
        '保持容器化分区、正交连线和清晰对齐，使结构关系一眼可读。',
        '3 秒内必须能看清主流程路径。',
      ].join('\n')
  }
}

function getNodeLimit(semantic?: DiagramSemantic): number {
  switch (semantic) {
    case 'overall-architecture':
    case 'technical-architecture':
    case 'deployment-topology':
    case 'integration-architecture':
      return 20
    case 'data-architecture':
    case 'business-architecture':
      return 16
    default:
      return 12
  }
}

function buildMermaidTypeInstruction(preferredMermaidType?: MermaidDiagramKind): string[] {
  switch (preferredMermaidType) {
    case 'architecture-beta':
      return [
        '本次必须使用 architecture-beta。',
        '使用 group、service、junction 和边连接资源；突出服务、数据库、队列、网关、外部系统之间的拓扑关系。',
        `### architecture-beta 语法要点（必须严格遵守）
- group 语法: \`group id["标签"]\`——标签必须用双引号括起来
- service 语法: \`service id(icon)["标签"] in group_id\`——icon 只能从以下 6 个内置值中选择：cloud, database, disk, server, internet, blank（禁止使用其他值，如 gateway、storage 等均不支持），标签必须用双引号
- service 无 icon: \`service id["标签"]\`
- 边的语法: \`id1:方向 -- 方向:id2\` 或 \`id1:方向 --> 方向:id2\`；方向只能是 T/B/L/R
- **不存在** database、system 关键字——统一用 service，通过 icon 区分类型
- **不存在** \`<->\` 双向箭头语法
- id 只能包含字母、数字、下划线和连字符

合格示例：
\`\`\`
architecture-beta
    group api_layer["应用服务层"]
    group data_layer["数据服务层"]

    service gateway(internet)["API 网关"] in api_layer
    service auth(server)["认证服务"] in api_layer
    service db(database)["数据库"] in data_layer

    gateway:R -- L:auth
    auth:B -- T:db
\`\`\``,
      ]
    case 'C4Context':
      return [
        '本次必须使用 C4Context。',
        '使用 Person、System、System_Ext、Enterprise_Boundary、Rel 等 C4 语法，突出用户、目标系统和外部系统关系。',
      ]
    case 'C4Container':
      return [
        '本次必须使用 C4Container。',
        '使用 Person、System_Boundary、Container、ContainerDb、ContainerQueue、System_Ext、Rel 等 C4 语法，突出容器边界、职责与依赖。',
      ]
    case 'C4Component':
      return [
        '本次必须使用 C4Component。',
        '使用 Container_Boundary、Component、ComponentDb、ComponentQueue、Rel 等 C4 语法，突出组件级职责拆分与依赖。',
      ]
    case 'C4Deployment':
      return [
        '本次必须使用 C4Deployment。',
        '使用 Deployment_Node、Container、ContainerDb、Rel 等 C4 部署语法，突出运行节点、部署边界与实例关系。',
      ]
    case 'sequenceDiagram':
      return [
        '本次必须使用 sequenceDiagram。',
        '只使用 participant、actor、消息箭头以及 alt/opt/loop 等时序语法；不要使用 flowchart 的 subgraph、classDef 和节点形状语法。',
      ]
    case 'stateDiagram-v2':
      return [
        '本次必须使用 stateDiagram-v2。',
        '只使用状态、转移和注释语法；不要使用 flowchart 的 subgraph、classDef 和节点形状语法。',
      ]
    case 'classDiagram':
      return [
        '本次必须使用 classDiagram。',
        '突出类、接口、继承、组合、依赖等关系；不要使用 flowchart 的 subgraph 语法。',
      ]
    case 'flowchart':
    default:
      return [
        '本次必须使用 flowchart TD 或 flowchart LR。',
        '允许使用 subgraph、classDef、class 和常见节点形状。',
      ]
  }
}

function buildMermaidSemanticHints(
  semantic?: DiagramSemantic,
  preferredMermaidType?: MermaidDiagramKind
): string[] {
  switch (preferredMermaidType) {
    case 'C4Context':
      return [
        '聚焦系统上下文：用户、BidWise 系统本体、外部模型服务、外部协作系统或内部平台之间的关系。',
        '不要下钻到组件级实现，优先表达系统边界、角色和外部依赖。',
      ]
    case 'C4Container':
      return [
        '聚焦容器级架构：Electron Main、Renderer、Python 服务、SQLite、本地文件系统、Agent Orchestrator、Task Queue 等容器与职责边界。',
        '每个容器标签包含职责简述，关系边标注调用方式或数据流向。',
      ]
    case 'C4Component':
      return [
        '聚焦单个容器内部的组件划分，例如主进程服务层、IPC 处理器、数据访问层、异步任务队列之间的职责与依赖。',
      ]
    case 'C4Deployment':
      return [
        '聚焦部署边界、运行节点和实例归属，体现桌面端、本地服务、外部模型网关或内网服务的部署关系。',
      ]
    case 'architecture-beta':
      return [
        '优先表现资源拓扑：服务、数据库、队列、网关、外部系统、运行节点之间的连接关系。',
        '将同一环境或同一边界的资源放入 group，边标签简洁标明协议或数据流。',
      ]
    case 'flowchart':
      if (semantic === 'overall-architecture') {
        return [
          '总体/逻辑架构图必须使用 flowchart TD + 嵌套 subgraph 来表达系统分层和边界。',
          '用外层 subgraph 表达系统边界（如"系统边界"、"外部系统"），内层 subgraph 表达子系统分组（如"设计计算组"、"数据服务"）。',
          '用户/角色节点放在最顶层，不在任何 subgraph 内。',
          '使用 classDef 区分不同类型节点：primary 用于核心模块，external 用于外部系统，neutral 用于辅助组件。',
          '每个 subgraph 内节点按逻辑流水线纵向排列或按职责横向排列。',
          '跨 subgraph 的连线用标签标注数据流向或调用方式。',
          `### 嵌套 subgraph 示例
\`\`\`
flowchart TD
    User([用户])

    subgraph SYS["系统边界"]
        direction TB
        subgraph CORE["核心计算组"]
            direction TB
            A[设计输入] --> B[设计计算]
            B --> C[结果生成]
        end
        subgraph MODEL["模型服务"]
            D[基础建模]
        end
        C -.->|模型数据| D
    end

    subgraph EXT["外部系统"]
        E[CAD平台]
        F[仿真平台]
    end

    User -->|操作指令| A
    D -->|模型导出| E
    C -->|计算结果| F
\`\`\``,
        ]
      }
      if (semantic === 'technical-architecture') {
        return [
          '技术/系统架构图使用 flowchart TD + 嵌套 subgraph 来表达模块边界、组件关系和依赖方向。',
          '用 subgraph 按技术层或模块分组（如"应用层"、"服务层"、"数据层"），支持嵌套到 2-3 层。',
          '使用 classDef 区分组件类型：primary 核心业务、emphasis 编排/调度、database 数据存储、external 外部接口。',
          '连线标签标注调用方式（IPC、HTTP、消息队列等）。',
          '重点是组件关系和依赖方向，不要画成时序流程。',
        ]
      }
      if (semantic === 'business-architecture') {
        return [
          '业务架构图优先表达业务域、角色分工、关键能力和协作关系。',
          '使用 subgraph 或泳道式分组表达业务边界，避免把它画成技术部署图。',
        ]
      }
      return ['优先表达步骤、分层、输入输出和判断分支，保持主路径清晰。']
    default:
      return []
  }
}

const DRAWIO_FEW_SHOT = `<mxGraphModel background="#F2EFE8" grid="0" tooltips="0" connect="0" arrows="0" fold="0" page="0" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="border" value="" style="rounded=0;arcSize=3;fillColor=none;strokeColor=#B9B3AB;strokeWidth=1.5;pointerEvents=0;" vertex="1" parent="1">
      <mxGeometry x="20" y="20" width="1614" height="580" as="geometry"/>
    </mxCell>
    <mxCell id="title" value="系统分层架构" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;overflow=hidden;fontStyle=1;fontSize=28;fontColor=#1F1F1C;" vertex="1" parent="1">
      <mxGeometry x="80" y="40" width="1200" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="zone-app" style="rounded=1;whiteSpace=wrap;arcSize=4;fillColor=#FAF8F4;strokeColor=#8C867F;strokeWidth=2;fontSize=18;fontStyle=1;fontColor=#5F5A54;swimlane;startSize=63;horizontal=1;html=1;" value="&lt;font style=&quot;font-size: 22px;&quot;&gt;应用服务层&lt;/font&gt;" vertex="1" parent="1">
      <mxGeometry x="80" y="110" width="540" height="180" as="geometry"/>
    </mxCell>
    <mxCell id="node-web" value="Web 应用服务" style="rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#E6E2DA;strokeColor=#8C867F;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1;" vertex="1" parent="zone-app">
      <mxGeometry x="30" y="80" width="180" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="node-api" value="API 网关" style="rounded=1;whiteSpace=wrap;arcSize=10;fillColor=#EEEAF9;strokeColor=#9A90D6;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;html=1;" vertex="1" parent="zone-app">
      <mxGeometry x="310" y="80" width="180" height="60" as="geometry"/>
    </mxCell>
    <mxCell id="zone-data" style="rounded=1;whiteSpace=wrap;arcSize=4;fillColor=#FAF8F4;strokeColor=#8C867F;strokeWidth=2;fontSize=18;fontStyle=1;fontColor=#5F5A54;swimlane;startSize=63;horizontal=1;html=1;" value="&lt;font style=&quot;font-size: 22px;&quot;&gt;数据服务层&lt;/font&gt;" vertex="1" parent="1">
      <mxGeometry x="80" y="340" width="540" height="200" as="geometry"/>
    </mxCell>
    <mxCell id="node-db" value="业务数据库" style="shape=cylinder3;whiteSpace=wrap;html=1;fillColor=#EAF4FB;strokeColor=#6FA8D6;strokeWidth=1.8;fontColor=#2D2B28;fontSize=20;size=12;" vertex="1" parent="zone-data">
      <mxGeometry x="170" y="80" width="160" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="edge-1" style="endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#7A756E;strokeWidth=1.8;rounded=1;html=1;" edge="1" parent="1" source="node-web" target="node-api">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="edge-2" style="endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;strokeColor=#7A756E;strokeWidth=1.8;rounded=1;html=1;" edge="1" parent="1" source="node-api" target="node-db">
      <mxGeometry relative="1" as="geometry"/>
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
      `## 语义化布局提示`,
      buildDrawioSemanticHints(context.diagramSemantic),
      `## 输出要求`,
      `1. 只输出完整的 mxGraph XML，不要输出 Markdown、解释、代码围栏或 JSON。`,
      `2. mxGraphModel 必须设置 background="#F2EFE8" grid="0"，且包含 <root>、id=0 与 id=1 的基础 mxCell。`,
      `3. XML 中第一个内容节点必须是外边框（id="border"），第二个是标题（id="title"，fontSize≥28，fontStyle=1，fontColor=#1F1F1C，居中）。`,
      `4. 根据语义选择合适的形状（参考上方形状表）：数据库用 cylinder3，决策用 rhombus，分区用 swimlane。不要所有节点都用矩形。`,
      `5. 使用上方语义配色方案着色——颜色编码语义角色，不是装饰。同一张图不超过 4 种强调色。`,
      `6. 所有中文标签必须和章节术语保持一致。`,
      `7. 坐标对齐到 10 的倍数，水平间距 ≥80px，垂直间距 ≥60px，布局清晰整齐，不超过 12 个节点。`,
      `8. 有层次/分区关系时使用三级容器样式（外层面板/内层面板/虚线区域），子元素设置正确的 parent 属性。`,
      `9. 所有连线必须使用 endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;rounded=1; 风格（开放 V 形箭头），禁止使用 endArrow=classic。`,
      `10. 不要输出 XML 注释（<!-- -->）。`,
      `11. 生成完成后自检：(1) 外边框 height 是否覆盖所有内容+40px (2) 直连节点是否在共享轴上对齐 (3) 连线是否穿越非目标节点 (4) 所有边是否包含 mxGeometry 子元素 (5) 所有箭头是否为 endArrow=open。`,
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
    `## 语义化布局提示`,
    ...buildMermaidSemanticHints(context.diagramSemantic, context.preferredMermaidType),
    `## 图表类型约束`,
    ...buildMermaidTypeInstruction(context.preferredMermaidType),
    `当前默认稳定支持的 Mermaid 语法族为：flowchart、sequenceDiagram、classDiagram、stateDiagram-v2、architecture-beta、C4Context、C4Container、C4Component、C4Deployment。`,
    `若无明确要求，不要使用 gantt、block-beta、mindmap 或 draw.io XML。`,
    `## 输出要求`,
    `1. 只输出 Mermaid DSL 正文，不要输出解释、Markdown 代码围栏或 JSON。`,
    `2. 第一行必须是 %%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%`,
    `3. ${MERMAID_DECLARATION_ORDER_RULE}`,
    `4. ${MERMAID_DECLARATION_FOLLOWUP_RULE}`,
    `5. 节点标签必须使用章节中出现过的术语，不要发明新模块名。`,
    `6. 结构保持简洁，不超过 ${getNodeLimit(context.diagramSemantic)} 个节点。`,
    `7. 当图表类型为 flowchart 时，使用 classDef 定义节点样式（参考上方配色方案），用 ::: 语法或 class 语句应用。`,
    `8. 当图表类型为 flowchart 时，根据语义选择合适的节点形状；不要所有节点都用方括号。`,
    `9. 当图表类型为 flowchart 时，使用 subgraph 对逻辑上属于同一层/同一区域的节点分组。`,
    `10. 不要使用 end 的全小写形式作为节点文本（用 End 或 完成）。`,
    `11. 生成完成后自检：图表类型声明是否位于 init 之后、语法是否属于当前图表类型、布局方向是否合理。`,
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
      `2. 必须保留原始图表的核心结构、业务术语、暖色调编辑风格配色和语义化形状。`,
      `3. mxGraphModel 必须设置 background="#F2EFE8" grid="0"，且包含 <root>、id=0 与 id=1 的基础 mxCell。`,
      `4. 必须包含外边框（id="border"）和标题（id="title"）节点。`,
      `5. 所有边必须包含 <mxGeometry relative="1" as="geometry" /> 子元素。`,
      `6. 所有连线必须使用 endArrow=open;endSize=14;edgeStyle=orthogonalEdgeStyle;rounded=1; 风格。`,
      `7. 坐标对齐到 10 的倍数，节点总数不超过 12 个。`,
      `8. 不要输出 XML 注释（<!-- -->）。`,
      `9. 修复后自检：(1) XML 格式良好 (2) 所有 id 唯一 (3) 所有 parent 引用存在 (4) 每个内容 mxCell 有 vertex="1" 或 edge="1" (5) 所有箭头为 endArrow=open。`,
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
    `2. 必须保留原始图表的核心结构、业务术语和布局意图；如果当前图表类型支持 classDef 或节点形状，则继续保留这些表达。`,
    `3. 第一行必须是 %%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%`,
    `4. ${MERMAID_DECLARATION_ORDER_RULE}`,
    `5. ${MERMAID_DECLARATION_FOLLOWUP_RULE}`,
    `6. 节点标签必须使用章节中出现过的术语，不要发明新模块名。`,
    `7. 当前源码若把 classDef、class、linkStyle、style、subgraph 或节点定义放在图表类型声明之前，请直接调整顺序。`,
    `8. 如果当前图表类型是 sequenceDiagram、stateDiagram-v2 或 classDiagram，请删除不属于该语法族的 flowchart 语法。`,
    `8.1 如果当前图表类型是 architecture-beta，请删除 flowchart、sequenceDiagram、classDiagram 和 C4 语法。`,
    `8.2 如果当前图表类型是 C4Context、C4Container、C4Component 或 C4Deployment，请删除 flowchart、sequenceDiagram、classDiagram 和 architecture-beta 语法。`,
    `8.3 如果当前图表类型是 architecture-beta，必须遵守：(a) group 标签用双引号 group id["标签"] (b) service 标签用双引号 service id(icon)["标签"] 或 service id["标签"] (c) 边语法为 id:方向 -- 方向:id（方向=T/B/L/R）(d) 不存在 database、system 关键字，统一用 service (e) 不存在 <-> 语法 (f) icon 只能从 cloud, database, disk, server, internet, blank 中选择，禁止使用其他值。`,
    `9. 不要使用 end 的全小写形式作为节点文本。`,
    `10. 结构保持简洁，不超过 ${getNodeLimit(context.diagramSemantic)} 个节点。`,
    `11. 修复后自检：(1) 语法能被 mermaid.parse() 通过 (2) 图表类型声明位于 init 之后 (3) 只使用当前图表类型支持的语法。`,
  ].join('\n\n')
}

export const GENERATE_DIAGRAM_SYSTEM_PROMPT =
  '你是一个工业级技术图表生成专家，专精于为投标文档和技术方案生成暖色调、低饱和度、编辑出版级品质的架构图、流程图和系统拓扑图。你的图表面向甲方评审专家，必须体现技术深度和工程规范，风格参照暖灰底色 + 语义化配色 + 开放箭头的编辑风格。请严格输出可被程序直接消费的图表源码，不要附加任何解释。'

export const REPAIR_DIAGRAM_SYSTEM_PROMPT =
  '你是一个工业级技术图表修复专家。请根据给定的源码和校验错误，输出一份修复后的图表源码。修复时保留原图的暖色调编辑风格配色（暖灰底色、开放箭头、语义化颜色）、形状和布局结构，仅修正校验错误。不要附加任何解释。'
