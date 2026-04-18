import { useCallback, useEffect, useMemo } from 'react'
import { App, Button } from 'antd'
import { useStructureOutline } from '../hooks/useStructureOutline'
import { StructureCanvas } from './StructureCanvas'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { useDocumentStore } from '@renderer/stores'
import { resolveSectionIdFromLocator } from '@shared/chapter-identity'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'

export interface StructureDesignWorkspaceProps {
  projectId: string
  /**
   * Fired when the user proceeds to the proposal-writing stage. Button label
   * adapts via `confirmLabel`. The action is ALWAYS enabled when a callback
   * is provided — legacy/imported projects without a populated sectionIndex
   * still need a path forward.
   */
  onConfirmSkeleton?: () => void
  /** Label for the primary CTA. Defaults to "继续撰写". */
  confirmLabel?: string
  /** Fired when user requests to re-run the template selector (handed off to Story 11.6). */
  onReselectTemplate?: () => void
  /** sectionId → generation phase map for idle-row decorators (AC5). */
  phaseByNodeKey?: ReadonlyMap<string, ChapterGenerationPhase>
}

/**
 * Structure Design Workspace host (Story 11.2 + Story 11.6 seam).
 *
 * Story 11.2 lands the canvas-slot minimum implementation: a single structure
 * canvas column that renders the five-state machine for each chapter node.
 * Story 11.6 will expand this with: (a) Modal-based template/import entry
 * picker, (b) three-path diff merge view in the main area.
 */
export function StructureDesignWorkspace({
  projectId,
  onConfirmSkeleton,
  confirmLabel = '继续撰写',
  onReselectTemplate,
  phaseByNodeKey,
}: StructureDesignWorkspaceProps): React.JSX.Element {
  const { message } = App.useApp()
  const { tree, flat, loading, error, reload } = useStructureOutline(projectId)

  const registerSectionIds = useChapterStructureStore((s) => s.registerSectionIds)
  const reset = useChapterStructureStore((s) => s.reset)

  // Phase source (AC5). Prefer explicit prop when a parent injects it; fall
  // back to the global ChapterGenerationContext so solution-design mounts
  // automatically decorate idle rows when 11.8 streaming / 3.11 batch runs.
  //
  // Guard: `useChapterGeneration` keeps `statuses` state across projectId
  // changes (only resets after the new project starts its own generation).
  // Common chapter names like "项目综述" / "系统设计" collide frequently;
  // without this check, project A's phase icons would appear on project B
  // after a switch. Only consume statuses when the context still reports the
  // project we're rendering.
  const chapterGen = useChapterGenerationContext()
  const derivedPhaseMap = useMemo<ReadonlyMap<string, ChapterGenerationPhase>>(() => {
    if (phaseByNodeKey) return phaseByNodeKey
    const map = new Map<string, ChapterGenerationPhase>()
    if (!chapterGen) return map
    if (chapterGen.currentProjectId !== projectId) return map
    for (const status of chapterGen.statuses.values()) {
      const id = resolveSectionIdFromLocator(flat, status.target)
      if (id) map.set(id, status.phase)
    }
    return map
  }, [phaseByNodeKey, chapterGen, flat, projectId])

  useEffect(() => {
    if (flat.length === 0) return
    const mapping: Record<string, string> = {}
    for (const entry of flat) {
      mapping[entry.sectionId] = entry.sectionId
    }
    registerSectionIds(mapping)
  }, [flat, registerSectionIds])

  // Reset renderer state when switching projects to avoid leaked focus.
  useEffect(() => {
    return () => {
      reset()
    }
  }, [projectId, reset])

  const handleCommitTitle = useCallback(
    async (nodeKey: string, nextTitle: string): Promise<void> => {
      try {
        const res = await window.api.chapterStructureUpdateTitle({
          projectId,
          sectionId: nodeKey,
          title: nextTitle,
        })
        if (!res.success) {
          message.error(res.error.message)
          return
        }
        // Rehydrate renderer caches. Rename wrote new markdown + sectionIndex
        // to disk; without a reload, `documentStore.content` keeps the old
        // heading line and the next autosave — or proposal-writing editor
        // mount — would push the stale copy back, silently undoing the edit.
        await useDocumentStore.getState().loadDocument(projectId)
        reload()
      } catch (err) {
        message.error((err as Error).message)
      }
    },
    [projectId, message, reload]
  )

  const handleAddChild = useCallback(
    (_nodeKey: string) => {
      message.info('新增子节点将接入 Story 11.3 keymap cascade')
    },
    [message]
  )

  const handleOpenMoreMenu = useCallback(
    (_nodeKey: string, _anchor: HTMLElement) => {
      message.info('节点菜单将接入 Story 11.3 / 11.4 / 11.8')
    },
    [message]
  )

  const handleUndoPendingDelete = useCallback(
    (_nodeKey: string) => {
      message.info('撤销删除由 Story 11.4 soft-delete 接管')
    },
    [message]
  )

  return (
    <div
      className="flex h-full flex-col gap-4 p-6"
      data-testid="structure-design-workspace"
      data-project-id={projectId}
    >
      <header className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-h4 text-text-primary font-semibold">方案结构</span>
          <span className="text-caption text-text-tertiary">
            点击章节聚焦 · 双击 / F2 进入重命名 · 结构变更由 11.3 / 11.4 / 11.8 接入
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onReselectTemplate && (
            <Button onClick={onReselectTemplate} data-testid="structure-reselect-template">
              重新选择模板
            </Button>
          )}
          {onConfirmSkeleton && (
            <Button
              type="primary"
              onClick={onConfirmSkeleton}
              data-testid="structure-confirm-skeleton"
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="bg-danger/10 text-danger rounded border border-[var(--color-danger)] px-3 py-2 text-sm"
          data-testid="structure-design-error"
        >
          {error}
          <Button
            size="small"
            type="link"
            className="!text-danger ml-2"
            onClick={() => {
              reload()
            }}
          >
            重试
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <StructureCanvas
          tree={tree}
          loading={loading}
          onCommitTitle={handleCommitTitle}
          onAddChild={handleAddChild}
          onOpenMoreMenu={handleOpenMoreMenu}
          onUndoPendingDelete={handleUndoPendingDelete}
          phaseByNodeKey={derivedPhaseMap}
        />
      </div>
    </div>
  )
}
