import { useMemo } from 'react'
import { countChapterCharacters } from '@shared/chapter-markdown'

export function useWordCount(markdown: string): number {
  return useMemo(() => countChapterCharacters(markdown), [markdown])
}

/**
 * Kept as a named export for callers that need the counting rule outside of a
 * React render (e.g. document snapshot diagnostics). Both the hook and this
 * function route through the shared helper so renderer + main agree.
 */
export { countChapterCharacters as countCharacters }
