import { createPlatePlugin } from 'platejs/react'
import type { MermaidElementData } from '@shared/mermaid-types'

export const MERMAID_ELEMENT_TYPE = 'mermaid'

export type MermaidElement = MermaidElementData & {
  type: typeof MERMAID_ELEMENT_TYPE
  children: [{ text: '' }]
}

export const MermaidPlugin = createPlatePlugin({
  key: MERMAID_ELEMENT_TYPE,
  node: {
    type: MERMAID_ELEMENT_TYPE,
    isVoid: true,
    isElement: true,
  },
})
