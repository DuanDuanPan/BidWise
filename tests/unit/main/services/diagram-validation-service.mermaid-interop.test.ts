import { describe, it, expect, vi, afterEach } from 'vitest'

describe('diagram-validation-service mermaid interop', () => {
  afterEach(() => {
    vi.resetModules()
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

  it('@p1 should support mermaid parsers nested under a default export wrapper', async () => {
    const mockNestedParse = vi.fn().mockResolvedValue(true)

    vi.doMock('mermaid', () => ({
      default: {
        default: {
          parse: (...args: unknown[]) => mockNestedParse(...args),
        },
      },
    }))

    const { validateMermaidDiagram } = await import('@main/services/diagram-validation-service')

    const result = await validateMermaidDiagram('graph TD\nA-->B')

    expect(result.valid).toBe(true)
    expect(mockNestedParse).toHaveBeenCalledWith('graph TD\nA-->B')
  })
})
