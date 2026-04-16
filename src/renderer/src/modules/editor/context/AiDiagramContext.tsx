import { createContext, useContext } from 'react'
import type { AiDiagramStyleToken, AiDiagramTypeToken } from '@shared/ai-diagram-types'

export interface AiDiagramRegenerateRequest {
  /** Existing node's diagramId — presence signals "update" vs "insert" */
  diagramId: string
  assetFileName: string
  caption: string
  prompt: string
  style: AiDiagramStyleToken
  diagramType: AiDiagramTypeToken
}

export interface AiDiagramContextValue {
  requestRegenerate: (request: AiDiagramRegenerateRequest) => void
}

const AiDiagramContext = createContext<AiDiagramContextValue | null>(null)

export const AiDiagramProvider = AiDiagramContext.Provider

// eslint-disable-next-line react-refresh/only-export-components
export function useAiDiagramContext(): AiDiagramContextValue | null {
  return useContext(AiDiagramContext)
}
