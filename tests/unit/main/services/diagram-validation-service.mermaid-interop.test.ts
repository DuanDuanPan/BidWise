import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'

describe('diagram-validation-service mermaid interop', () => {
  afterEach(() => {
    vi.resetModules()
  })

  afterAll(async () => {
    const { mermaidRuntimeClient } =
      await import('@main/services/diagram-runtime/mermaid-runtime-client')
    await mermaidRuntimeClient.stop()
  })

  it('@p1 should validate a simple mermaid diagram with the real mermaid runtime', async () => {
    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const result = await validateMermaidDiagram('graph TD\nA-->B')

    expect(result).toEqual({ valid: true })
  })

  it('@p0 should validate labeled flowcharts with the real mermaid runtime in the main process', async () => {
    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const result = await validateMermaidDiagram(
      'flowchart TD\nA[基础设施层<br>银河麒麟V10 SP3] --> B[数据层<br>PostgreSQL / Redis]'
    )

    expect(result).toEqual({ valid: true })
  })

  it('@p0 should validate the production regression graph that previously failed with DOMPurify.addHook', async () => {
    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const result = await validateMermaidDiagram(
      [
        'graph TB',
        '    subgraph 展示交互层',
        '        A[Web门户]',
        '    end',
        '    subgraph 业务应用层',
        '        B[工业APP界面]',
        '    end',
        '    subgraph 应用支撑层',
        '        C[自动生成引擎]',
        '    end',
        '    subgraph 数据层',
        '        D[达梦V8.2数据库]',
        '    end',
        '    subgraph 基础设施层',
        '        E[银河麒麟V10 SP3]',
        '    end',
        '    A --> B',
        '    B --> C',
        '    C --> D',
        '    D --> E',
      ].join('\n')
    )

    expect(result).toEqual({ valid: true })
  })

  it('@p0 should recover diagrams where classDef appears before the graph declaration', async () => {
    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const result = await validateMermaidDiagram(
      [
        "%%{init: {'theme':'neutral','themeVariables':{'fontSize':'14px'}}}%%",
        'classDef primary fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333',
        'classDef database fill:#DAE8FC,stroke:#6C8EBF,stroke-width:2px,color:#333',
        'graph TB',
        'A[应用服务层]:::primary --> B[(业务数据库)]:::database',
      ].join('\n')
    )

    expect(result).toEqual({ valid: true })
  })

  it('@p1 should reuse the isolated runtime across multiple real validations', async () => {
    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const first = await validateMermaidDiagram('graph TD\nA-->B')
    const second = await validateMermaidDiagram('graph LR\nX[输入] --> Y[输出]')

    expect(first).toEqual({ valid: true })
    expect(second).toEqual({ valid: true })
  })
})
