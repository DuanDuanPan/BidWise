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
import { countTreeNodes } from '../adapters/skeletonAdapter'
import { collectSubtreeKeys, findTreeNode } from '../adapters/persistedAdapter'
import {
  addChild,
  addSibling,
  allowDraftDrop,
  deleteNode,
  moveDraftSubtree,
  renameNode,
} from '../lib/draftMutations'
import { useStructureKeymap } from '@modules/editor/hooks/useStructureKeymap'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

/**
 * Story 11.9 unified structure tree view. Hosts:
 *   - `SkeletonEditor` (draft) — renders `SolutionDesignView.edit-skeleton`.
 *   - `StructureDesignWorkspace` (persisted) — renders `solution design ·
 *     has-content`. Owns five-state visual, Story 11.3 keymap, AntD Tree DnD.
 *
 * Keeps prototype `0V4bl` + design_tokens_contract 1:1 — grip (via AntD Tree
 * `blockNode`), collapse toggle, bottom action bar. Guide rails intentionally
 * omitted: L1 反色块 + mono 编号已承载层级语义, AntD 默认虚线 rail 与编号列
 * 坐标系错位, 删除更干净 (Linear/Craft/Notion 同路线).
 */
export function StructureTreeView(props: StructureTreeViewProps): React.JSX.Element {
  const {
    mode,
    nodes,
    stateOf,
    phaseByKey,
    onUpdate,
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
    keyboardEnabled,
    maxDepth = 4,
    emptyHint,
    loading,
    error,
    onRetry,
    renderPanel,
    projectId,
  } = props

  // Spec default: `keyboardEnabled` is on by default in persisted mode and off
  // by default in draft mode.
  const keymapEnabled = keyboardEnabled ?? mode === 'persisted'

  const testId = props['data-testid'] ?? 'structure-tree-view'

  const { modal } = App.useApp()
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  // Subscribe to the five-state signals so per-row state updates reactively
  // invalidate the treeData memo below. These read the store regardless of
  // mode — draft simply never consults them.
  const pendingDeleteMap = useChapterStructureStore((s) => s.pendingDeleteBySectionId)
  const focusedSectionId = useChapterStructureStore((s) => s.focusedSectionId)
  const editingSectionId = useChapterStructureStore((s) => s.editingSectionId)
  const lockedSectionIds = useChapterStructureStore((s) => s.lockedSectionIds)

  // Combined derived state lookup — persisted consults the store, draft just
  // reports 'idle' / 'editing' (no five-state visual in draft).
  const resolveState = useCallback(
    (key: string): ChapterNodeState => {
      if (mode === 'persisted' && stateOf) return stateOf(key)
      if (mode === 'draft' && editingKey === key) return 'editing'
      if (mode === 'draft' && focusedKey === key) return 'focused'
      return 'idle'
    },
    [mode, stateOf, editingKey, focusedKey]
  )

  const resolvePendingDelete = useCallback(
    (key: string): PendingDeleteEntry | null => {
      if (mode !== 'persisted') return null
      return pendingDeleteMap[key] ?? null
    },
    [mode, pendingDeleteMap]
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

  // ─── Draft write handlers ────────────────────────────────────────────────
  const applyDraft = useCallback(
    (next: StructureTreeNode[] | null, createdKey?: string): void => {
      if (!next || !onUpdate) return
      onUpdate(next)
      if (createdKey) {
        setFocusedKey(createdKey)
        setEditingKey(createdKey)
      }
    },
    [onUpdate]
  )

  const handleDraftAddSibling = useCallback(
    (key: string) => {
      const res = addSibling(nodes, key, maxDepth)
      if (res) applyDraft(res.nextNodes, res.createdKey)
    },
    [nodes, maxDepth, applyDraft]
  )

  const handleDraftAddChild = useCallback(
    (key: string) => {
      const res = addChild(nodes, key, maxDepth)
      if (res) applyDraft(res.nextNodes, res.createdKey)
    },
    [nodes, maxDepth, applyDraft]
  )

  const handleDraftDelete = useCallback(
    (key: string, title: string) => {
      modal.confirm({
        title: '确认删除',
        content: `确定删除「${title}」及其所有子章节？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => {
          const res = deleteNode(nodes, key)
          if (res) applyDraft(res.nextNodes)
        },
      })
    },
    [modal, nodes, applyDraft]
  )

  const handleDraftRename = useCallback(
    (key: string, nextTitle: string) => {
      const res = renameNode(nodes, key, nextTitle)
      if (res) applyDraft(res.nextNodes)
      setFocusedKey(key)
      setEditingKey(null)
    },
    [nodes, applyDraft]
  )

  // ─── Persisted write handlers ────────────────────────────────────────────
  const handlePersistedAddChild = useCallback(
    (key: string) => {
      void onInsertChild?.(key)
    },
    [onInsertChild]
  )

  const handlePersistedDelete = useCallback(
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

  const handlePersistedRename = useCallback(
    (key: string, nextTitle: string) => {
      void onCommitTitle?.(key, nextTitle)
    },
    [onCommitTitle]
  )

  // ─── AntD Tree drop logic (shared draft/persisted) ───────────────────────
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

      if (mode === 'draft') {
        const res = moveDraftSubtree(nodes, { dragKey, dropKey, placement }, maxDepth)
        if (res) applyDraft(res.nextNodes)
        return
      }
      void onMove?.(dragKey, dropKey, placement)
    },
    [mode, nodes, maxDepth, applyDraft, onMove]
  )

  const allowDrop: TreeProps['allowDrop'] = useCallback(
    (info) => {
      const dragKey = String(info.dragNode.key)
      const dropKey = String(info.dropNode.key)
      const placement: StructureTreeViewPlacement =
        info.dropPosition === 0 ? 'inside' : info.dropPosition === -1 ? 'before' : 'after'
      return allowDraftDrop(nodes, { dragKey, dropKey, placement }, maxDepth)
    },
    [nodes, maxDepth]
  )

  const handlePersistedAddSibling = useCallback(
    (key: string) => {
      void onInsertSibling?.(key)
    },
    [onInsertSibling]
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
              isKeyFocus={mode === 'draft' ? node.isKeyFocus : undefined}
              weightPercent={mode === 'draft' ? node.weightPercent : undefined}
              alwaysShowMore={false}
              canAddChild={canAddChild}
              onCommitTitle={mode === 'draft' ? handleDraftRename : handlePersistedRename}
              onCancelEditing={
                mode === 'draft'
                  ? () => setEditingKey(null)
                  : () => useChapterStructureStore.getState().exitEditing()
              }
              onStartEditing={
                mode === 'draft'
                  ? (key) => {
                      setFocusedKey(key)
                      setEditingKey(key)
                    }
                  : (key) => useChapterStructureStore.getState().enterEditing(key)
              }
              onFocusNode={
                mode === 'persisted'
                  ? (key) => useChapterStructureStore.getState().focusSection(key)
                  : (key) => setFocusedKey(key)
              }
              onAddSibling={mode === 'draft' ? handleDraftAddSibling : handlePersistedAddSibling}
              onAddChild={mode === 'draft' ? handleDraftAddChild : handlePersistedAddChild}
              onDelete={
                mode === 'draft'
                  ? (key, t) => handleDraftDelete(key, t)
                  : (key, t) => handlePersistedDelete(key, t)
              }
              onUndoPendingDelete={
                mode === 'persisted'
                  ? (key) => {
                      const subtreeNode = findTreeNode(nodes, key)
                      const keys = subtreeNode ? collectSubtreeKeys(subtreeNode) : [key]
                      void onUndoPendingDelete?.(keys)
                    }
                  : undefined
              }
            />
          ),
          children: node.children.length > 0 ? render(node.children, sectionCode) : undefined,
        }
      })
    return render(nodes, '')
  }, [
    nodes,
    mode,
    maxDepth,
    phaseByKey,
    resolveState,
    resolvePendingDelete,
    // Keep the per-node state signals in the memo dep list so the tree
    // re-renders when the store notifies changes mid-session.
    focusedSectionId,
    editingSectionId,
    lockedSectionIds,
    pendingDeleteMap,
    handleDraftRename,
    handlePersistedRename,
    handleDraftAddSibling,
    handlePersistedAddSibling,
    handleDraftAddChild,
    handlePersistedAddChild,
    handleDraftDelete,
    handlePersistedDelete,
    onUndoPendingDelete,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  const { total, keyFocus } = countTreeNodes(nodes)

  // ─── Story 11.3 keymap + scroll continuity (persisted mode, component-level) ─
  // Previously lived in `StructureDesignWorkspace`. Sunk here so any persisted
  // mount gets Enter / Tab / Shift+Tab / Delete / F2 / arrows + the focus-scroll
  // effect without re-wiring them per host (Story 11.9 AC4 contract).
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

  // Persisted contract (Story 11.1): nodeKey === sectionId, so the map is an
  // identity over every node key in the tree.
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

  // Keyboard structural mutations route through the public persisted callbacks
  // (Story 11.9 AC3/AC4). Keymap only falls back to direct store actions when
  // a host omits the callback — preserves `DocumentOutlineTree` wiring.
  useStructureKeymap({
    panelRef,
    projectId: mode === 'persisted' && keymapEnabled ? (projectId ?? null) : null,
    outline: keymapOutline,
    onNavigateToNode: handleNavigateToNode,
    sectionIdByNodeKey,
    disabled: !(mode === 'persisted' && keymapEnabled && !!projectId),
    onInsertSibling: onInsertSibling,
    onIndent: onIndent,
    onOutdent: onOutdent,
    onDelete: onDelete,
  })

  // Scroll + DOM focus continuity — keep `isWithinPanel` guard live after
  // structure mutations so Tab/Shift+Tab stays bound to the keymap instead of
  // escaping into surrounding controls.
  useEffect(() => {
    const previousEditingSectionId = previousEditingSectionIdRef.current
    previousEditingSectionIdRef.current = editingSectionId

    if (mode !== 'persisted') return
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
  }, [mode, focusedSectionId, editingSectionId, nodes])

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

// Re-export types for convenient public import.
export type {
  StructureTreeNode,
  StructureTreeViewMode,
  StructureTreeViewProps,
  StructureTreeViewPlacement,
} from './StructureTreeView.types'

// Re-export the state helper so callers can compute `stateOf` without pulling
// the store module directly.
// eslint-disable-next-line react-refresh/only-export-components
export { deriveChapterNodeState }
