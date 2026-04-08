import { describe, it, expect } from 'vitest'
import { DrawioPlugin, DRAWIO_ELEMENT_TYPE } from '@modules/editor/plugins/drawioPlugin'

describe('@story-3-7 DrawioPlugin', () => {
  it('exports DRAWIO_ELEMENT_TYPE as "drawio"', () => {
    expect(DRAWIO_ELEMENT_TYPE).toBe('drawio')
  })

  it('has correct plugin key', () => {
    expect(DrawioPlugin.key).toBe('drawio')
  })

  it('is configured as a void element', () => {
    const nodeConfig = DrawioPlugin.node as Record<string, unknown>
    expect(nodeConfig.isVoid).toBe(true)
    expect(nodeConfig.isElement).toBe(true)
  })

  it('supports withComponent binding', () => {
    expect(typeof DrawioPlugin.withComponent).toBe('function')
  })
})
