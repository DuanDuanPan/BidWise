import { describe, it, expect } from 'vitest'
import {
  generateDiagramPrompt,
  generateDiagramRepairPrompt,
  GENERATE_DIAGRAM_SYSTEM_PROMPT,
  REPAIR_DIAGRAM_SYSTEM_PROMPT,
} from '@main/prompts/generate-diagram.prompt'

describe('generateDiagramPrompt', () => {
  it('@p0 should encode the Mermaid declaration whitelist and ordering rule', () => {
    const prompt = generateDiagramPrompt({
      diagramType: 'mermaid',
      chapterTitle: '总体架构设计',
      diagramTitle: '系统总体架构图',
      diagramDescription: '展示系统分层与核心模块关系',
      chapterMarkdown: '系统由展示层、业务层、数据层组成。',
      preferredMermaidType: 'C4Context',
      diagramSemantic: 'overall-architecture',
    })

    expect(prompt).toContain('本次必须使用 C4Context')
    expect(prompt).toContain('使用 Person、System、System_Ext、Enterprise_Boundary、Rel')
    expect(prompt).toContain('当前默认稳定支持的 Mermaid 语法族')
    expect(prompt).toContain('第一条非空语句必须是图表类型声明')
    expect(prompt).toContain(
      'classDef、class、linkStyle、style、subgraph 和节点定义都放在图表类型声明之后'
    )
    expect(prompt).toContain('聚焦系统上下文')
  })

  it('@p0 should encode the same Mermaid declaration rule in repair prompts', () => {
    const prompt = generateDiagramRepairPrompt({
      diagramType: 'mermaid',
      chapterTitle: '总体架构设计',
      diagramTitle: '系统总体架构图',
      diagramDescription: '展示系统分层与核心模块关系',
      chapterMarkdown: '系统由展示层、业务层、数据层组成。',
      invalidOutput:
        '%%{init:{\'theme\':\'neutral\'}}%%\nPerson(user, "用户")\nC4Context\nRel(user, bidwise, "使用")',
      validationError: 'Mermaid 首个有效语句必须是图表类型声明。',
      preferredMermaidType: 'C4Context',
    })

    expect(prompt).toContain('第一条非空语句必须是图表类型声明')
    expect(prompt).toContain(
      '当前源码若把 classDef、class、linkStyle、style、subgraph 或节点定义放在图表类型声明之前，请直接调整顺序'
    )
    expect(prompt).toContain('只使用当前图表类型支持的语法')
  })

  it('@p1 should keep the system prompts focused on direct machine-consumable output', () => {
    expect(GENERATE_DIAGRAM_SYSTEM_PROMPT).toContain('可被程序直接消费')
    expect(REPAIR_DIAGRAM_SYSTEM_PROMPT).toContain('不要附加任何解释')
  })

  it('@p1 should encode architecture-beta guidance for deployment topology prompts', () => {
    const prompt = generateDiagramPrompt({
      diagramType: 'mermaid',
      chapterTitle: '系统部署架构',
      diagramTitle: '生产环境部署拓扑',
      diagramDescription: '展示系统部署节点和网络边界',
      chapterMarkdown: '系统部署在 Kubernetes 集群上。',
      diagramSemantic: 'deployment-topology',
      preferredMermaidType: 'architecture-beta',
    })

    expect(prompt).toContain('本次必须使用 architecture-beta')
    expect(prompt).toContain('使用 group、service、junction')
    expect(prompt).toContain('优先表现资源拓扑')
    expect(prompt).toContain('当前默认稳定支持的 Mermaid 语法族')
  })

  it('@p1 should keep draw.io prompt support available for legacy repair paths', () => {
    const prompt = generateDiagramPrompt({
      diagramType: 'drawio',
      chapterTitle: '系统部署架构',
      diagramTitle: '生产环境部署拓扑',
      diagramDescription: '展示系统部署节点和网络边界',
      chapterMarkdown: '系统部署在 Kubernetes 集群上。',
      diagramSemantic: 'deployment-topology',
    })

    expect(prompt).toContain('background="#F2EFE8"')
    expect(prompt).toContain('endArrow=open;endSize=14')
    expect(prompt).toContain('id="border"')
    expect(prompt).toContain('id="title"')
    expect(prompt).toContain('#E6E2DA')
    expect(prompt).toContain('禁止使用 endArrow=classic')
    expect(prompt).toContain('环境边界')
  })

  it('@p1 should encode warm editorial style in draw.io repair prompts', () => {
    const prompt = generateDiagramRepairPrompt({
      diagramType: 'drawio',
      chapterTitle: '系统架构',
      diagramTitle: '总体架构图',
      diagramDescription: '展示系统分层',
      chapterMarkdown: '系统由展示层、业务层、数据层组成。',
      invalidOutput: '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>',
      validationError: 'mxCell 节点数量不足',
    })

    // Warm canvas requirement in repair
    expect(prompt).toContain('background="#F2EFE8"')
    // Open arrow requirement in repair
    expect(prompt).toContain('endArrow=open')
    // Border and title requirements
    expect(prompt).toContain('id="border"')
    expect(prompt).toContain('id="title"')
  })
})
