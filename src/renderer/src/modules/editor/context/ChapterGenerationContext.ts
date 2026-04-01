import { createContext } from 'react'
import type { UseChapterGenerationReturn } from '@modules/editor/hooks/useChapterGeneration'

export const ChapterGenerationContext = createContext<UseChapterGenerationReturn | null>(null)

export const ChapterGenerationProvider = ChapterGenerationContext.Provider
