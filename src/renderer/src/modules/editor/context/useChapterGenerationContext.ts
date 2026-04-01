import { useContext } from 'react'
import type { UseChapterGenerationReturn } from '@modules/editor/hooks/useChapterGeneration'
import { ChapterGenerationContext } from './ChapterGenerationContext'

export function useChapterGenerationContext(): UseChapterGenerationReturn | null {
  return useContext(ChapterGenerationContext)
}
