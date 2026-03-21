import { useMemo } from 'react'
import Fuse from 'fuse.js'
import type { Command } from './types'
import { CATEGORY_ORDER } from './types'

export function useCommandSearch(commands: Command[], query: string): Command[] {
  const fuse = useMemo(
    () =>
      new Fuse(commands, {
        keys: [
          { name: 'label', weight: 0.7 },
          { name: 'keywords', weight: 0.3 },
        ],
        threshold: 0.4,
        includeScore: true,
        minMatchCharLength: 1,
      }),
    [commands]
  )

  return useMemo(() => {
    if (!query.trim()) {
      // Empty query: return all commands sorted by category order
      return [...commands].sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
      )
    }
    return fuse.search(query, { limit: 20 }).map((result) => result.item)
  }, [commands, query, fuse])
}
