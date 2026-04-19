import { useEffect } from 'react'
import { App, Button } from 'antd'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import type { PendingStructureDeletionSummary } from '@shared/chapter-types'

export const UNDO_TOAST_KEY = 'chapter-structure-undo-delete'

/**
 * Story 11.4 Undo toast. Mounted once per workspace host; subscribes to
 * `activePendingDeletion` on the chapter-structure store and drives the
 * shared AntD `notification` surface using a fixed key so a new delete
 * cleanly replaces the previous toast instead of stacking.
 *
 * User click → `undoPendingDelete`. The 5-second finalize countdown lives in
 * the store module, so route changes / project rebinds / toast unmount only
 * affect the notification surface. The finalize timer itself keeps running.
 */
export function UndoDeleteToast(): React.JSX.Element | null {
  const { notification } = App.useApp()
  const activePendingDeletion = useChapterStructureStore((s) => s.activePendingDeletion)
  const boundProjectId = useChapterStructureStore((s) => s.boundProjectId)
  const undoPendingDelete = useChapterStructureStore((s) => s.undoPendingDelete)

  useEffect(() => {
    if (!activePendingDeletion || !boundProjectId) {
      notification.destroy(UNDO_TOAST_KEY)
      return
    }

    const summary = activePendingDeletion

    const handleUndo = async (): Promise<void> => {
      notification.destroy(UNDO_TOAST_KEY)
      await undoPendingDelete(boundProjectId, summary.deletionId)
    }

    notification.open({
      key: UNDO_TOAST_KEY,
      message: buildMessage(summary),
      description: null,
      duration: 0,
      placement: 'bottomLeft',
      closeIcon: null,
      btn: (
        <Button type="link" size="small" onClick={handleUndo} data-testid="undo-delete-button">
          撤销
        </Button>
      ),
    })

    return () => notification.destroy(UNDO_TOAST_KEY)
  }, [activePendingDeletion, boundProjectId, notification, undoPendingDelete])

  return null
}

function buildMessage(summary: PendingStructureDeletionSummary): string {
  const childrenCount = summary.subtreeSize - 1
  if (childrenCount <= 0) {
    return `已删除「${summary.firstTitle}」`
  }
  return `已删除「${summary.firstTitle}」及 ${childrenCount} 个子节点（含正文 ${summary.totalWordCount} 字）`
}
