import type { DiagramPlaceholder, DiagramType } from '@main/services/diagram-validation-service'

export type DiagramSemantic =
  | 'overall-architecture'
  | 'technical-architecture'
  | 'business-architecture'
  | 'data-architecture'
  | 'deployment-topology'
  | 'integration-architecture'
  | 'process-flow'
  | 'sequence-interaction'
  | 'state-machine'
  | 'class-model'
  | 'module-dependency'

export type MermaidDiagramKind =
  | 'flowchart'
  | 'sequenceDiagram'
  | 'stateDiagram-v2'
  | 'classDiagram'
  | 'architecture-beta'
  | 'C4Context'
  | 'C4Container'
  | 'C4Component'
  | 'C4Deployment'

export interface DiagramIntentInput {
  requestedType: DiagramType
  chapterTitle: string
  diagramTitle: string
  diagramDescription: string
  chapterMarkdown: string
}

export interface DiagramIntentResolution {
  semantic: DiagramSemantic
  preferredType: DiagramType
  mermaidDiagramKind?: MermaidDiagramKind
  confidence: number
  reasons: string[]
}

export interface ResolvedDiagramPlaceholder extends DiagramPlaceholder {
  requestedType: DiagramType
  semantic: DiagramSemantic
  mermaidDiagramKind?: MermaidDiagramKind
  routingConfidence: number
  routingReasons: string[]
}

interface DiagramIntentRule {
  semantic: DiagramSemantic
  preferredType: DiagramType
  mermaidDiagramKind?: MermaidDiagramKind
  titlePatterns: Array<{ label: string; pattern: RegExp }>
  descriptionPatterns: Array<{ label: string; pattern: RegExp }>
  bodyPatterns?: Array<{ label: string; pattern: RegExp }>
}

const DIAGRAM_INTENT_RULES: DiagramIntentRule[] = [
  {
    semantic: 'sequence-interaction',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'sequenceDiagram',
    titlePatterns: [
      { label: '时序图', pattern: /时序图|调用时序|交互时序|sequence/i },
      { label: '交互图', pattern: /交互图|消息交互|请求响应/ },
    ],
    descriptionPatterns: [
      { label: '调用顺序', pattern: /调用顺序|时序关系|请求响应|消息交互/ },
      { label: '参与方', pattern: /参与方|客户端|服务端|网关|消息/ },
    ],
  },
  {
    semantic: 'state-machine',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'stateDiagram-v2',
    titlePatterns: [{ label: '状态图', pattern: /状态图|状态流转|生命周期|state/i }],
    descriptionPatterns: [{ label: '状态变化', pattern: /状态变化|状态迁移|生命周期|审核状态/ }],
  },
  {
    semantic: 'class-model',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'classDiagram',
    titlePatterns: [{ label: '类图', pattern: /类图|对象模型|领域模型|class/i }],
    descriptionPatterns: [{ label: '类关系', pattern: /继承|实现|聚合|组合|接口关系|实体关系/ }],
  },
  {
    semantic: 'module-dependency',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'classDiagram',
    titlePatterns: [{ label: '依赖图', pattern: /依赖图|模块依赖|包依赖|引用关系/ }],
    descriptionPatterns: [{ label: '依赖关系', pattern: /依赖关系|引用关系|模块关系|组件依赖/ }],
  },
  {
    semantic: 'deployment-topology',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'architecture-beta',
    titlePatterns: [
      { label: '部署架构', pattern: /部署架构|部署图|环境架构/ },
      { label: '拓扑图', pattern: /拓扑图|网络拓扑|部署拓扑|集群拓扑/ },
    ],
    descriptionPatterns: [
      { label: '节点集群', pattern: /节点|集群|服务器|网络|容器|k8s|负载均衡|网关/ },
    ],
  },
  {
    semantic: 'data-architecture',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'architecture-beta',
    titlePatterns: [{ label: '数据架构', pattern: /数据架构|数据分层|数据流架构|数据资源/ }],
    descriptionPatterns: [
      { label: '数据链路', pattern: /数据流|数据链路|存储层|数据库|数仓|缓存|消息队列/ },
    ],
  },
  {
    semantic: 'integration-architecture',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'architecture-beta',
    titlePatterns: [
      { label: '集成架构', pattern: /集成架构|系统集成|接口架构|对接关系/ },
      { label: '外部系统', pattern: /外部系统|接口关系|互联互通/ },
    ],
    descriptionPatterns: [
      { label: '系统对接', pattern: /第三方|外部系统|接口调用|系统对接|数据交换/ },
    ],
  },
  {
    semantic: 'overall-architecture',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'C4Context',
    titlePatterns: [
      { label: '总体架构', pattern: /总体架构|系统总体架构|整体架构/ },
      { label: '分层结构', pattern: /分层结构|逻辑架构/ },
    ],
    descriptionPatterns: [{ label: '总体分层', pattern: /总体架构|整体分层|逻辑层|架构总览/ }],
  },
  {
    semantic: 'technical-architecture',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'C4Container',
    titlePatterns: [
      { label: '技术架构', pattern: /技术架构|组件关系|模块架构|服务架构|应用架构/ },
      { label: '系统架构', pattern: /系统架构(设计)?/ },
    ],
    descriptionPatterns: [
      { label: '模块组件', pattern: /模块关系|组件关系|服务关系|分层模块|核心组件/ },
    ],
  },
  {
    semantic: 'business-architecture',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'flowchart',
    titlePatterns: [{ label: '业务架构', pattern: /业务架构|业务协同|业务能力|能力架构/ }],
    descriptionPatterns: [{ label: '业务域', pattern: /业务域|业务能力|角色协同|职责分工/ }],
  },
  {
    semantic: 'process-flow',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'flowchart',
    titlePatterns: [{ label: '流程图', pattern: /流程图|流程设计|处理流程|审批流|业务流程/ }],
    descriptionPatterns: [{ label: '步骤流转', pattern: /步骤|阶段|审批|流转|处理链路|闭环/ }],
    bodyPatterns: [{ label: '流程语义', pattern: /首先|然后|接着|最后|提交|审批|处理/ }],
  },
]

function shortId(placeholderId: string): string {
  return placeholderId.slice(0, 8)
}

function buildAssetFileName(type: DiagramType, placeholderId: string): string {
  return type === 'drawio'
    ? `diagram-${shortId(placeholderId)}.drawio`
    : `mermaid-${shortId(placeholderId)}.svg`
}

function collectScore(
  text: string,
  patterns: Array<{ label: string; pattern: RegExp }>,
  weight: number,
  reasons: Set<string>
): number {
  let score = 0
  for (const { label, pattern } of patterns) {
    if (!pattern.test(text)) continue
    score += weight
    reasons.add(label)
  }
  return score
}

function genericArchitectureFallback(
  text: string,
  _requestedType: DiagramType
): DiagramIntentResolution | null {
  if (/部署|拓扑|集群|节点|网络/.test(text)) {
    return {
      semantic: 'deployment-topology',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'architecture-beta',
      confidence: 0.45,
      reasons: ['generic-deployment-fallback'],
    }
  }

  if (/数据|数据库|数仓|缓存|消息队列/.test(text)) {
    return {
      semantic: 'data-architecture',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'architecture-beta',
      confidence: 0.45,
      reasons: ['generic-data-architecture-fallback'],
    }
  }

  if (/集成|接口|对接|外部系统/.test(text)) {
    return {
      semantic: 'integration-architecture',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'architecture-beta',
      confidence: 0.45,
      reasons: ['generic-integration-fallback'],
    }
  }

  if (/架构|分层/.test(text)) {
    return {
      semantic: 'technical-architecture',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'C4Container',
      confidence: 0.45,
      reasons: ['generic-architecture-fallback'],
    }
  }
  return null
}

export function resolveDiagramIntent(input: DiagramIntentInput): DiagramIntentResolution {
  const titleText = `${input.chapterTitle} ${input.diagramTitle}`.toLowerCase()
  const descriptionText = input.diagramDescription.toLowerCase()
  const bodyText = input.chapterMarkdown.slice(0, 1600).toLowerCase()

  let bestRule: DiagramIntentRule | null = null
  let bestScore = -1
  let bestReasons: string[] = []

  for (const rule of DIAGRAM_INTENT_RULES) {
    const reasons = new Set<string>()
    let score = 0

    score += collectScore(titleText, rule.titlePatterns, 8, reasons)
    score += collectScore(descriptionText, rule.descriptionPatterns, 4, reasons)

    if (rule.bodyPatterns) {
      score += collectScore(bodyText, rule.bodyPatterns, 1, reasons)
    }

    if (score > bestScore) {
      bestScore = score
      bestRule = rule
      bestReasons = [...reasons]
    }
  }

  if (bestRule && bestScore > 0) {
    return {
      semantic: bestRule.semantic,
      preferredType: bestRule.preferredType,
      mermaidDiagramKind: bestRule.mermaidDiagramKind,
      confidence: Math.min(0.95, 0.35 + bestScore / 24),
      reasons: bestReasons,
    }
  }

  const fallbackText = `${titleText} ${descriptionText}`
  const architectureFallback = genericArchitectureFallback(fallbackText, input.requestedType)
  if (architectureFallback) return architectureFallback

  if (/时序|交互|请求|响应|消息/.test(fallbackText)) {
    return {
      semantic: 'sequence-interaction',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'sequenceDiagram',
      confidence: 0.4,
      reasons: ['generic-sequence-fallback'],
    }
  }

  if (/状态|生命周期/.test(fallbackText)) {
    return {
      semantic: 'state-machine',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'stateDiagram-v2',
      confidence: 0.4,
      reasons: ['generic-state-fallback'],
    }
  }

  if (/类|对象|依赖|关系/.test(fallbackText)) {
    return {
      semantic: 'class-model',
      preferredType: 'mermaid',
      mermaidDiagramKind: 'classDiagram',
      confidence: 0.35,
      reasons: ['generic-class-fallback'],
    }
  }

  return {
    semantic: 'process-flow',
    preferredType: 'mermaid',
    mermaidDiagramKind: 'flowchart',
    confidence: 0.25,
    reasons: ['requested-type-default'],
  }
}

export function resolveDiagramPlaceholder(
  placeholder: DiagramPlaceholder,
  context: {
    chapterTitle: string
    chapterMarkdown: string
  }
): ResolvedDiagramPlaceholder {
  const resolution = resolveDiagramIntent({
    requestedType: placeholder.type,
    chapterTitle: context.chapterTitle,
    diagramTitle: placeholder.title,
    diagramDescription: placeholder.description,
    chapterMarkdown: context.chapterMarkdown,
  })

  return {
    ...placeholder,
    requestedType: placeholder.type,
    type: resolution.preferredType,
    assetFileName: buildAssetFileName(resolution.preferredType, placeholder.placeholderId),
    semantic: resolution.semantic,
    mermaidDiagramKind: resolution.mermaidDiagramKind,
    routingConfidence: resolution.confidence,
    routingReasons: resolution.reasons,
  }
}
