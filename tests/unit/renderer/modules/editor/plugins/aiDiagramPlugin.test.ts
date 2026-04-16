import { describe, it, expect, vi } from 'vitest'

vi.mock('platejs/react', () => ({
  createPlatePlugin: vi.fn((config: Record<string, unknown>) => ({
    ...config,
    withComponent: vi.fn(() => ({ ...config })),
  })),
}))

import { AiDiagramPlugin, AI_DIAGRAM_ELEMENT_TYPE } from '@modules/editor/plugins/aiDiagramPlugin'

describe('@story-3-9 AiDiagramPlugin', () => {
  it('has key "ai-diagram"', () => {
    expect(AI_DIAGRAM_ELEMENT_TYPE).toBe('ai-diagram')
    expect(AiDiagramPlugin.key).toBe('ai-diagram')
  })

  it('is configured as void element', () => {
    expect(AiDiagramPlugin.node.isVoid).toBe(true)
    expect(AiDiagramPlugin.node.isElement).toBe(true)
  })
})
