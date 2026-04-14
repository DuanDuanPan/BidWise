import { describe, expect, it } from 'vitest'
import {
  resolveDiagramIntent,
  resolveDiagramPlaceholder,
} from '@main/services/diagram-intent-service'

describe('diagram-intent-service', () => {
  it('@p0 should route overall architecture diagrams to mermaid C4 context', () => {
    const result = resolveDiagramIntent({
      requestedType: 'mermaid',
      chapterTitle: '总体架构设计',
      diagramTitle: '系统总体架构图',
      diagramDescription: '展示系统分层结构、核心模块与基础设施关系',
      chapterMarkdown: '系统采用表现层、应用层、数据层、基础设施层的分层架构。',
    })

    expect(result.semantic).toBe('overall-architecture')
    expect(result.preferredType).toBe('mermaid')
    expect(result.mermaidDiagramKind).toBe('C4Context')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('@p0 should route deployment topology diagrams to mermaid architecture-beta', () => {
    const result = resolveDiagramIntent({
      requestedType: 'mermaid',
      chapterTitle: '部署设计',
      diagramTitle: '生产环境部署拓扑图',
      diagramDescription: '展示网关、应用集群、数据库集群和网络边界',
      chapterMarkdown: '系统部署在双机房集群环境，包含网关、应用节点和数据库节点。',
    })

    expect(result.semantic).toBe('deployment-topology')
    expect(result.preferredType).toBe('mermaid')
    expect(result.mermaidDiagramKind).toBe('architecture-beta')
  })

  it('@p0 should keep process flows on mermaid flowchart', () => {
    const result = resolveDiagramIntent({
      requestedType: 'mermaid',
      chapterTitle: '业务流程设计',
      diagramTitle: '投标审批流程图',
      diagramDescription: '展示提交、审核、退回和归档步骤',
      chapterMarkdown: '流程包括提交申请、主管审核、复核审批和结果归档。',
    })

    expect(result.semantic).toBe('process-flow')
    expect(result.preferredType).toBe('mermaid')
    expect(result.mermaidDiagramKind).toBe('flowchart')
  })

  it('@p0 should keep sequence diagrams on mermaid sequenceDiagram', () => {
    const result = resolveDiagramIntent({
      requestedType: 'mermaid',
      chapterTitle: '接口交互设计',
      diagramTitle: '任务调度调用时序图',
      diagramDescription: '展示客户端、网关、调度服务和执行器之间的请求响应顺序',
      chapterMarkdown: '客户端发起请求，经由网关转发到调度服务，再调用执行器并回传结果。',
    })

    expect(result.semantic).toBe('sequence-interaction')
    expect(result.preferredType).toBe('mermaid')
    expect(result.mermaidDiagramKind).toBe('sequenceDiagram')
  })

  it('@p0 should rewrite architecture placeholders to mermaid C4 assets', () => {
    const result = resolveDiagramPlaceholder(
      {
        placeholderId: '12345678-abcd-efgh-ijkl-1234567890ab',
        type: 'drawio',
        title: '技术架构图',
        description: '展示核心组件和部署层次',
        assetFileName: 'diagram-12345678.drawio',
      },
      {
        chapterTitle: '技术架构设计',
        chapterMarkdown: '采用分层架构，包含网关、应用服务、缓存和数据库。',
      }
    )

    expect(result.requestedType).toBe('drawio')
    expect(result.type).toBe('mermaid')
    expect(result.assetFileName).toBe('mermaid-12345678.svg')
    expect(result.semantic).toBe('technical-architecture')
    expect(result.mermaidDiagramKind).toBe('C4Container')
  })
})
