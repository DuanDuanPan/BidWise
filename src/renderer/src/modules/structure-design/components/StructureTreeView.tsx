import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App, Alert, Empty, Spin, Tree } from 'antd'
import type { DataNode, TreeProps } from 'antd/es/tree'
import {
  useChapterStructureStore,
  deriveChapterNodeState,
  type ChapterNodeState,
  type PendingDeleteEntry,
} from '@renderer/stores/chapterStructureStore'
import type {
  StructureTreeNode,
  StructureTreeViewPlacement,
  StructureTreeViewProps,
} from './StructureTreeView.types'
import { StructureActionBar } from './StructureTreeView.actionBar'
import { StructureRow } from './StructureTreeView.nodes'
import { collectSubtreeKeys, countTreeNodes, findTreeNode } from '../adapters/persistedAdapter'
import { useStructureKeymap } from '@modules/editor/hooks/useStructureKeymap'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

/**
 * Unified structure tree view (Story 11.9 + post-unification cleanup).
 *
 * Single persisted-mode renderer: every mutation routes through
 * `chapterStructureStore` actions via host-supplied public callbacks
 * (`onInsertSibling` / `onInsertChild` / `onIndent` / `onOutdent` /
 * `onDelete` / `onCommitTitle` / `onMove` / `onUndoPendingDelete`).
 * Focus + editing state is sourced from the store so Story 11.3 keymap,
 * Story 11.4 pending-delete visual, and Story 11.8 streaming locks share
 * one source of truth.
 *
 * The former `mode='draft'` branch for `SolutionDesignView.edit-skeleton`
 * was deleted together with `SkeletonEditor` / `draftMutations` /
 * `skeletonAdapter`: `templateGenerateSkeleton` already persists the
 * canonical `proposal.md + sectionIndex`, so the generated skeleton is
 * loaded through `documentStore.loadDocument` and edited directly in
 * persisted mode.
 */
export function StructureTreeView(props: StructureTreeViewProps): React.JSX.Element {
  const {
    nodes,
    stateOf,
    phaseByKey,
    onInsertChild,
    onInsertSibling,
    onIndent,
    onOutdent,
    onMove,
    onDelete,
    onCommitTitle,
    onUndoPendingDelete,
    onConfirm,
    confirmLabel = '确认骨架，开始撰写',
    confirmLoading,
    onReselectTemplate,
    showStats = true,
    keyboardEnabled = true,
    maxDepth = 4,
    emptyHint,
    loading,
    error,
    onRetry,
    renderPanel,
    projectId,
  } = props

  const testId = props['data-testid'] ?? 'structure-tree-view'

  const { modal } = App.useApp()
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

  // Five-state store signals drive per-row visual + keymap dispatch. The
  // `treeData` memo below reads them via `resolveState` so any store update
  // re-renders the affected row without a manual invalidation hook.
  const pendingDeleteMap = useChapterStructureStore((s) => s.pendingDeleteBySectionId)
  const focusedSectionId = useChapterStructureStore((s) => s.focusedSectionId)
  const editingSectionId = useChapterStructureStore((s) => s.editingSectionId)
  const lockedSectionIds = useChapterStructureStore((s) => s.lockedSectionIds)

  const resolveState = useCallback(
    (key: string): ChapterNodeState => (stateOf ? stateOf(key) : 'idle'),
    [stateOf]
  )

  const resolvePendingDelete = useCallback(
    (key: string): PendingDeleteEntry | null => pendingDeleteMap[key] ?? null,
    [pendingDeleteMap]
  )

  const expandedKeys = useMemo(() => {
    const all: string[] = []
    const walk = (tree: StructureTreeNode[]): void => {
      for (const node of tree) {
        all.push(node.key)
        walk(node.children)
      }
    }
    walk(nodes)
    return all.filter((k) => !collapsedKeys.has(k))
  }, [nodes, collapsedKeys])

  const handleExpand = useCallback(
    (keys: React.Key[]) => {
      const expandedSet = new Set(keys.map(String))
      const all: string[] = []
      const walk = (tree: StructureTreeNode[]): void => {
        for (const node of tree) {
          all.push(node.key)
          walk(node.children)
        }
      }
      walk(nodes)
      const next = new Set<string>()
      for (const k of all) if (!expandedSet.has(k)) next.add(k)
      setCollapsedKeys(next)
    },
    [nodes]
  )

  const handleAddSibling = useCallback(
    (key: string) => {
      void onInsertSibling?.(key)
    },
    [onInsertSibling]
  )

  const handleAddChild = useCallback(
    (key: string) => {
      void onInsertChild?.(key)
    },
    [onInsertChild]
  )

  const handleDelete = useCallback(
    (key: string, title: string) => {
      const node = findTreeNode(nodes, key)
      const keys = node ? collectSubtreeKeys(node) : [key]
      modal.confirm({
        title: '确认删除',
        content: `确定删除「${title}」及其所有子章节？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => {
          void onDelete?.(keys)
        },
      })
    },
    [modal, nodes, onDelete]
  )

  const handleRename = useCallback(
    (key: string, nextTitle: string) => {
      void onCommitTitle?.(key, nextTitle)
    },
    [onCommitTitle]
  )

  // AntD Tree drop logic — delegates to host-supplied `onMove`.
  const handleDrop: TreeProps['onDrop'] = useCallback(
    (info) => {
      const dragKey = String(info.dragNode.key)
      const dropKey = String(info.node.key)
      const dropPos = info.node.pos.split('-')
      const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1])
      const placement: StructureTreeViewPlacement = !info.dropToGap
        ? 'inside'
        : dropPosition === -1
          ? 'before'
          : 'after'
      void onMove?.(dragKey, dropKey, placement)
    },
    [onMove]
  )

  // Cycle + depth guard lives on the adapter so DnD semantics stay pure.
  const allowDrop: TreeProps['allowDrop'] = useCallback(
    (info) => {
      const dragKey = String(info.dragNode.key)
      const dropKey = String(info.dropNode.key)
      if (dragKey === dropKey) return false
      const dragNode = findTreeNode(nodes, dragKey)
      if (!dragNode) return false
      // Cycle: cannot drop into own descendant.
      if (findTreeNode(dragNode.children, dropKey)) return false
      const placement: StructureTreeViewPlacement =
        info.dropPosition === 0 ? 'inside' : info.dropPosition === -1 ? 'before' : 'after'
      const dragDepth = maxChildDepth(dragNode)
      const dropDepth = depthOfNode(nodes, dropKey)
      if (dropDepth < 0) return false
      if (placement === 'inside') {
        return dropDepth + 1 + dragDepth <= maxDepth
      }
      return dropDepth + dragDepth <= maxDepth
    },
    [nodes, maxDepth]
  )

  // ─── Row renderer → AntD DataNode ────────────────────────────────────────
  // store signals (focusedSectionId / editingSectionId / lockedSectionIds /
  // pendingDeleteMap) are intentionally in the dep list so the memoised tree
  // invalidates on store updates even though ESLint can't see them inside the
  // render closure — they flow in via `resolveState` / `resolvePendingDelete`.
  /* eslint-disable react-hooks/exhaustive-deps */
  const treeData = useMemo<DataNode[]>(() => {
    const render = (tree: StructureTreeNode[], parentCode: string): DataNode[] =>
      tree.map((node, idx) => {
        const num = String(idx + 1)
        const sectionCode = parentCode ? `${parentCode}.${num}` : num
        const state = resolveState(node.key)
        const pd = resolvePendingDelete(node.key)
        const canAddChild = node.level < maxDepth
        return {
          key: node.key,
          // per-node draggable: locked/pending-delete freeze DnD source.
          disabled: state === 'locked' || state === 'pending-delete',
          title: (
            <StructureRow
              nodeKey={node.key}
              title={node.title}
              level={node.level}
              sectionCode={sectionCode}
              state={state}
              pendingDelete={pd}
              generationPhase={phaseByKey?.get(node.key)}
              alwaysShowMore={false}
              canAddChild={canAddChild}
              onCommitTitle={handleRename}
              onCancelEditing={() => useChapterStructureStore.getState().exitEditing()}
              onStartEditing={(key) => useChapterStructureStore.getState().enterEditing(key)}
              onFocusNode={(key) => useChapterStructureStore.getState().focusSection(key)}
              onAddSibling={handleAddSibling}
              onAddChild={handleAddChild}
              onDelete={(key, t) => handleDelete(key, t)}
              onUndoPendingDelete={(key) => {
                const subtreeNode = findTreeNode(nodes, key)
                const keys = subtreeNode ? collectSubtreeKeys(subtreeNode) : [key]
                void onUndoPendingDelete?.(keys)
              }}
            />
          ),
          children: node.children.length > 0 ? render(node.children, sectionCode) : undefined,
        }
      })
    return render(nodes, '')
  }, [
    nodes,
    maxDepth,
    phaseByKey,
    resolveState,
    resolvePendingDelete,
    focusedSectionId,
    editingSectionId,
    lockedSectionIds,
    pendingDeleteMap,
    handleRename,
    handleAddSibling,
    handleAddChild,
    handleDelete,
    onUndoPendingDelete,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  const { total, keyFocus } = countTreeNodes(nodes)

  // ─── Story 11.3 keymap + scroll continuity ───────────────────────────────
  const panelRef = useRef<HTMLDivElement>(null)
  const previousEditingSectionIdRef = useRef<string | null>(null)

  const keymapOutline = useMemo<OutlineNode[]>(() => {
    const toOutline = (n: StructureTreeNode): OutlineNode => ({
      key: n.key,
      title: n.title,
      level: (n.level <= 4 ? n.level : 4) as OutlineNode['level'],
      lineIndex: 0,
      occurrenceIndex: 0,
      children: n.children.map(toOutline),
    })
    return nodes.map(toOutline)
  }, [nodes])

  // Story 11.1 contract: nodeKey === sectionId, so the map is an identity.
  const sectionIdByNodeKey = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    const walk = (tree: StructureTreeNode[]): void => {
      for (const n of tree) {
        map[n.key] = n.key
        walk(n.children)
      }
    }
    walk(nodes)
    return map
  }, [nodes])

  const scrollAndFocus = useCallback((key: string): void => {
    const panel = panelRef.current
    if (!panel) return
    const el = panel.querySelector<HTMLElement>(`[data-testid="tree-node-${key}"]`)
    if (!el) return
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
    el.focus({ preventScroll: true })
  }, [])

  const handleNavigateToNode = useCallback(
    (node: OutlineNode) => {
      scrollAndFocus(node.key)
    },
    [scrollAndFocus]
  )

  useStructureKeymap({
    panelRef,
    projectId: keyboardEnabled ? (projectId ?? null) : null,
    outline: keymapOutline,
    onNavigateToNode: handleNavigateToNode,
    sectionIdByNodeKey,
    disabled: !(keyboardEnabled && !!projectId),
    onInsertSibling,
    onIndent,
    onOutdent,
    onDelete,
  })

  // Scroll + DOM focus continuity — keep `isWithinPanel` guard live after
  // structure mutations so Tab/Shift+Tab stays bound to the keymap instead of
  // escaping into surrounding controls.
  useEffect(() => {
    const previousEditingSectionId = previousEditingSectionIdRef.current
    previousEditingSectionIdRef.current = editingSectionId

    if (!focusedSectionId) return
    const panel = panelRef.current
    if (!panel) return
    const el = panel.querySelector<HTMLElement>(`[data-testid="tree-node-${focusedSectionId}"]`)
    if (!el) return
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
    if (editingSectionId) return
    const active = document.activeElement
    const editingJustEnded = !!previousEditingSectionId && !editingSectionId
    if (editingJustEnded) {
      if (active === el) return
      const activeWithinPanel = active instanceof Node && panel.contains(active)
      if (active && active !== document.body && !activeWithinPanel) return
      el.focus({ preventScroll: true })
      return
    }
    if (active && active !== document.body) return
    el.focus({ preventScroll: true })
  }, [focusedSectionId, editingSectionId, nodes])

  // ─── Empty / loading / error states ──────────────────────────────────────
  const innerTree = (() => {
    if (loading && nodes.length === 0) {
      return (
        <div className="flex h-full items-center justify-center" data-testid={`${testId}-loading`}>
          <Spin size="large" />
        </div>
      )
    }
    if (nodes.length === 0) {
      return (
        <div className="flex h-full items-center justify-center" data-testid={`${testId}-empty`}>
          <Empty description={emptyHint ?? '暂无章节结构'} />
        </div>
      )
    }
    return (
      <Tree
        treeData={treeData}
        draggable
        blockNode
        expandedKeys={expandedKeys}
        onExpand={handleExpand}
        onDrop={handleDrop}
        allowDrop={allowDrop}
        selectable={false}
      />
    )
  })()

  // Wrap the inner tree in the focusable panel that owns the keymap ref. The
  // optional `renderPanel` decorator runs inside the ref'd element so hosts can
  // still add chrome without stealing the keymap target.
  const decorated = renderPanel ? renderPanel(innerTree) : innerTree
  const panel = (
    <div ref={panelRef} tabIndex={-1} className="h-full outline-none">
      {decorated}
    </div>
  )

  return (
    <div className="flex h-full flex-col" data-testid={testId}>
      {error && (
        <Alert
          type="error"
          message={error}
          className="mx-4 mt-2"
          action={
            onRetry ? (
              <span
                className="text-brand cursor-pointer text-sm"
                onClick={onRetry}
                data-testid={`${testId}-retry`}
              >
                重试
              </span>
            ) : undefined
          }
          data-testid={`${testId}-error`}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{panel}</div>
      <StructureActionBar
        total={total}
        keyFocus={keyFocus}
        showStats={showStats}
        confirmLabel={confirmLabel}
        confirmLoading={confirmLoading}
        onConfirm={onConfirm}
        onReselectTemplate={onReselectTemplate}
      />
    </div>
  )
}

function maxChildDepth(node: StructureTreeNode): number {
  if (node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map(maxChildDepth))
}

function depthOfNode(nodes: StructureTreeNode[], key: string): number {
  const find = (tree: StructureTreeNode[], depth: number): number => {
    for (const node of tree) {
      if (node.key === key) return depth
      const r = find(node.children, depth + 1)
      if (r >= 0) return r
    }
    return -1
  }
  return find(nodes, 1)
}

// Re-export types for convenient public import.
export type {
  StructureTreeNode,
  StructureTreeViewProps,
  StructureTreeViewPlacement,
} from './StructureTreeView.types'

// Re-export the state helper so callers can compute `stateOf` without pulling
// the store module directly.
// eslint-disable-next-line react-refresh/only-export-components
export { deriveChapterNodeState }
