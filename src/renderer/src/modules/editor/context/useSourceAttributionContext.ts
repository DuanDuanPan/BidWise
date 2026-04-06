import { useContext } from 'react'
import type { UseSourceAttributionReturn } from '@modules/editor/hooks/useSourceAttribution'
import { SourceAttributionContext } from './SourceAttributionContext'

export function useSourceAttributionContext(): UseSourceAttributionReturn | null {
  return useContext(SourceAttributionContext)
}
