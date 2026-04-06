import { createContext } from 'react'
import type { UseSourceAttributionReturn } from '@modules/editor/hooks/useSourceAttribution'

export const SourceAttributionContext = createContext<UseSourceAttributionReturn | null>(null)

export const SourceAttributionProvider = SourceAttributionContext.Provider
