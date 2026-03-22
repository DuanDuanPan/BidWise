import { useCallback, useRef } from 'react'
import type { SopStageKey } from '../types'

type RestorableStageKey = Exclude<SopStageKey, 'not-started'>

export interface ProjectContext {
  sopStage: RestorableStageKey
  lastVisitedAt: string
}

const contextCache = new Map<string, ProjectContext>()

export interface UseContextRestoreReturn {
  saveContext: (projectId: string, context: ProjectContext) => void
  restoreContext: (projectId: string) => ProjectContext | null
}

export function useContextRestore(): UseContextRestoreReturn {
  const cacheRef = useRef(contextCache)

  const saveContext = useCallback((projectId: string, context: ProjectContext) => {
    cacheRef.current.set(projectId, context)
  }, [])

  const restoreContext = useCallback((projectId: string): ProjectContext | null => {
    return cacheRef.current.get(projectId) ?? null
  }, [])

  return { saveContext, restoreContext }
}
