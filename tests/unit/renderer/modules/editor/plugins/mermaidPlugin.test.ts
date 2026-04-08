import { describe, it, expect } from 'vitest'
import { MermaidPlugin, MERMAID_ELEMENT_TYPE } from '@modules/editor/plugins/mermaidPlugin'

describe('@story-3-8 MermaidPlugin', () => {
  it('exports MERMAID_ELEMENT_TYPE as "mermaid"', () => {
    expect(MERMAID_ELEMENT_TYPE).toBe('mermaid')
  })

  it('has correct plugin key', () => {
    expect(MermaidPlugin.key).toBe('mermaid')
  })

  it('is configured as a void element', () => {
    const nodeConfig = MermaidPlugin.node as Record<string, unknown>
    expect(nodeConfig.isVoid).toBe(true)
    expect(nodeConfig.isElement).toBe(true)
  })

  it('supports withComponent binding', () => {
    expect(typeof MermaidPlugin.withComponent).toBe('function')
  })
})
