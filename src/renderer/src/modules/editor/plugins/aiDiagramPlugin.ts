import { createPlatePlugin } from 'platejs/react'
import type { AiDiagramElementData } from '@shared/ai-diagram-types'

export const AI_DIAGRAM_ELEMENT_TYPE = 'ai-diagram'

export type AiDiagramElement = AiDiagramElementData & {
  type: typeof AI_DIAGRAM_ELEMENT_TYPE
  children: [{ text: '' }]
}

export const AiDiagramPlugin = createPlatePlugin({
  key: AI_DIAGRAM_ELEMENT_TYPE,
  node: {
    type: AI_DIAGRAM_ELEMENT_TYPE,
    isVoid: true,
    isElement: true,
  },
})
