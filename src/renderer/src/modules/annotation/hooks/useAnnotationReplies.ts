import { useCallback } from 'react'
import { useAnnotationStore } from '@renderer/stores/annotationStore'
import type { AnnotationRecord } from '@shared/annotation-types'

export function useAnnotationReplies(parentId: string): {
  replies: AnnotationRecord[]
  loading: boolean
  loadReplies: () => void
} {
  const replies = useAnnotationStore((s) => s.repliesByParent[parentId] ?? [])
  const loading = useAnnotationStore((s) => s.replyLoadingByParent[parentId] ?? false)
  const loadRepliesAction = useAnnotationStore((s) => s.loadReplies)

  const loadReplies = useCallback(() => {
    void loadRepliesAction(parentId)
  }, [loadRepliesAction, parentId])

  return { replies, loading, loadReplies }
}
