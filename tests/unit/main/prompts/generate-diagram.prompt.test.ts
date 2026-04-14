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
    })

    expect(prompt).toContain('允许的图表类型白名单')
    expect(prompt).toContain(
      'flowchart/graph、sequenceDiagram、classDiagram、stateDiagram-v2、gantt、C4Context、block-beta'
    )
    expect(prompt).toContain('第一条非空语句必须是图表类型声明')
    expect(prompt).toContain(
      'classDef、class、linkStyle、style、subgraph 和节点定义都放在图表类型声明之后'
    )
  })

  it('@p0 should encode the same Mermaid declaration rule in repair prompts', () => {
    const prompt = generateDiagramRepairPrompt({
      diagramType: 'mermaid',
      chapterTitle: '总体架构设计',
      diagramTitle: '系统总体架构图',
      diagramDescription: '展示系统分层与核心模块关系',
      chapterMarkdown: '系统由展示层、业务层、数据层组成。',
      invalidOutput:
        "%%{init:{'theme':'neutral'}}%%\nclassDef primary fill:#DAE8FC\ngraph TB\nA-->B",
      validationError: 'Mermaid 首个有效语句必须是图表类型声明。',
    })

    expect(prompt).toContain('第一条非空语句必须是图表类型声明')
    expect(prompt).toContain(
      '当前源码若把 classDef、class、linkStyle、style、subgraph 或节点定义放在图表类型声明之前，请直接调整顺序'
    )
    expect(prompt).toContain('图表类型声明位于 init 之后')
  })

  it('@p1 should keep the system prompts focused on direct machine-consumable output', () => {
    expect(GENERATE_DIAGRAM_SYSTEM_PROMPT).toContain('可被程序直接消费')
    expect(REPAIR_DIAGRAM_SYSTEM_PROMPT).toContain('不要附加任何解释')
  })
})
