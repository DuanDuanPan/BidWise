import { useCallback, useEffect, useMemo, useRef } from 'react'
import { App, Button } from 'antd'
import { useStructureOutline, type StructureNode } from '../hooks/useStructureOutline'
import { StructureCanvas } from './StructureCanvas'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { resolveSectionIdFromLocator } from '@shared/chapter-identity'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import { useChapterGenerationContext } from '@modules/editor/context/useChapterGenerationContext'
import { useStructureKeymap } from '@modules/editor/hooks/useStructureKeymap'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

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
  const panelRef = useRef<HTMLDivElement>(null)

  const bindProject = useChapterStructureStore((s) => s.bindProject)
  const commitTitle = useChapterStructureStore((s) => s.commitTitle)

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

  // Bind renderer state to the current project; switching auto-resets so
  // focus/editing from project A cannot leak into project B dispatches.
  useEffect(() => {
    bindProject(projectId)
    return () => {
      bindProject(null)
    }
  }, [projectId, bindProject])

  // Keymap expects OutlineNode shape (markdown-derived). In structure-design
  // we build it synthetically from the chapter tree: nodeKey === sectionId
  // (Story 11.1), so sectionIdByNodeKey is an identity map and lineIndex /
  // occurrenceIndex are unused by the keymap itself.
  const outlineForKeymap = useMemo<OutlineNode[]>(() => {
    const toOutline = (n: StructureNode): OutlineNode => ({
      key: n.nodeKey,
      title: n.title,
      level: n.level,
      lineIndex: 0,
      occurrenceIndex: 0,
      children: n.children.map(toOutline),
    })
    return tree.map(toOutline)
  }, [tree])

  const sectionIdByNodeKey = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    const walk = (nodes: StructureNode[]): void => {
      for (const n of nodes) {
        map[n.nodeKey] = n.sectionId
        walk(n.children)
      }
    }
    walk(tree)
    return map
  }, [tree])

  const handleNavigateToNode = useCallback((node: OutlineNode) => {
    const el = panelRef.current?.querySelector<HTMLElement>(
      `[data-testid="structure-node-${node.key}"]`
    )
    if (!el) return
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
    el.focus({ preventScroll: true })
  }, [])

  useStructureKeymap({
    panelRef,
    projectId,
    outline: outlineForKeymap,
    onNavigateToNode: handleNavigateToNode,
    sectionIdByNodeKey,
  })

  // Sync DOM viewport + focus with the store's `focusedSectionId` after each
  // tree render. Two responsibilities:
  //   1. Scroll the focused node into view on EVERY change — covers Enter
  //      (new sibling auto-focused), Tab/Shift+Tab (indent/outdent moves the
  //      node), arrow-key navigation, and programmatic focusSection calls.
  //      Without this the tree may already show the new node but viewport
  //      stays where it was, giving the "scroll to find it" UX.
  //   2. When not editing and nothing else has taken DOM focus, put focus on
  //      the node div so `isWithinPanel` keeps returning true — otherwise the
  //      next keystroke bypasses the keymap and native Tab/Shift+Tab escapes
  //      into the header buttons.
  const focusedSectionId = useChapterStructureStore((s) => s.focusedSectionId)
  const editingSectionId = useChapterStructureStore((s) => s.editingSectionId)
  useEffect(() => {
    if (!focusedSectionId) return
    const panel = panelRef.current
    if (!panel) return
    const el = panel.querySelector<HTMLElement>(
      `[data-testid="structure-node-${focusedSectionId}"]`
    )
    if (!el) return
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
    if (editingSectionId) return
    const active = document.activeElement
    if (active && active !== document.body) return
    el.focus({ preventScroll: true })
  }, [focusedSectionId, editingSectionId, tree])

  const handleCommitTitle = useCallback(
    async (nodeKey: string, nextTitle: string): Promise<void> => {
      // Go through the store so this rename acquires the same mutation lock,
      // pending-autosave flush, and editingLocked guard that the outline-tree
      // path uses. The store now applies the committed snapshot directly, so
      // rename keeps the canvas mounted and preserves scroll/focus continuity.
      const res = await commitTitle(projectId, nodeKey, nextTitle)
      if (!res.ok) {
        // commitTitle surfaces its own error toast through structure-feedback;
        // avoid double-reporting.
        return
      }
    },
    [projectId, commitTitle]
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

      <div ref={panelRef} tabIndex={-1} className="min-h-0 flex-1 outline-none">
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
