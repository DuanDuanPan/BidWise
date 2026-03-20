import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useProjectStore } from '@renderer/stores'
import type { ProjectRecord } from '@shared/ipc-types'

interface UseCurrentProjectResult {
  projectId: string | undefined
  currentProject: ProjectRecord | null
  loading: boolean
  error: string | null
}

export function useCurrentProject(): UseCurrentProjectResult {
  const { id } = useParams<{ id: string }>()
  const currentProject = useProjectStore((s) => s.currentProject)
  const loading = useProjectStore((s) => s.loading)
  const error = useProjectStore((s) => s.error)
  const loadProject = useProjectStore((s) => s.loadProject)

  // Clear stale project immediately when projectId changes (before effect fires)
  const [prevId, setPrevId] = useState(id)
  if (id !== prevId) {
    setPrevId(id)
    useProjectStore.setState({ currentProject: null, loading: true, error: null })
  }

  useEffect(() => {
    if (id) {
      loadProject(id)
    }
  }, [id, loadProject])

  return { projectId: id, currentProject, loading, error }
}
