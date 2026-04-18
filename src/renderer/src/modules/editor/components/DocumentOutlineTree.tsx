import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tree, Tooltip, Input, type InputRef } from 'antd'
import {
  FileTextOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'
import type { ChapterGenerationPhase } from '@shared/chapter-types'
import { useChapterStructureStore } from '@renderer/stores/chapterStructureStore'
import { useStructureKeymap } from '@modules/editor/hooks/useStructureKeymap'

const MAX_TITLE_LEN = 30

interface DocumentOutlineTreeProps {
  outline: OutlineNode[]
  onNodeClick?: (node: OutlineNode) => void
  chapterPhases?: Map<string, ChapterGenerationPhase>
  /**
   * Story 11.3: when set, structural shortcuts + inline title editing bind to
   * the tree root. `sectionIdByNodeKey` projects transient `heading-N` keys
   * onto canonical sectionIds for dispatch.
   */
  structureKeymap?: {
    projectId: string
    sectionIdByNodeKey: Record<string, string>
  }
}

function collectKeys(nodes: OutlineNode[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    keys.push(node.key)
    if (node.children.length > 0) {
      keys.push(...collectKeys(node.children))
    }
  }
  return keys
}

function buildNodeMap(nodes: OutlineNode[], map: Map<string, OutlineNode>): void {
  for (const node of nodes) {
    map.set(node.key, node)
    if (node.children.length > 0) {
      buildNodeMap(node.children, map)
    }
  }
}

function getStatusIcon(phase: ChapterGenerationPhase | undefined): React.ReactNode {
  if (!phase) return null
  switch (phase) {
    case 'queued':
      return (
        <ClockCircleOutlined
          style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}
        />
      )
    case 'analyzing':
    case 'generating-text':
    case 'validating-text':
    case 'generating-diagrams':
    case 'validating-diagrams':
    case 'composing':
    case 'validating-coherence':
    case 'annotating-sources':
      return (
        <LoadingOutlined style={{ fontSize: 10, color: 'var(--color-brand)', marginLeft: 4 }} />
      )
    case 'completed':
      return (
        <CheckCircleOutlined
          style={{ fontSize: 10, color: 'var(--color-success, #52c41a)', marginLeft: 4 }}
        />
      )
    case 'failed':
    case 'conflicted':
      return (
        <WarningOutlined
          style={{ fontSize: 10, color: 'var(--color-error, #ff4d4f)', marginLeft: 4 }}
        />
      )
    default:
      return null
  }
}

interface InlineTitleInputProps {
  initial: string
  onCommit: (next: string) => void
  onCancel: () => void
}

function InlineTitleInput({
  initial,
  onCommit,
  onCancel,
}: InlineTitleInputProps): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const ref = useRef<InputRef>(null)
  useEffect(() => {
    ref.current?.focus({ cursor: 'end' })
  }, [])
  return (
    <Input
      ref={ref}
      value={value}
      size="small"
      data-testid="outline-node-inline-input"
      onChange={(e) => setValue(e.target.value)}
      onPressEnter={(e) => {
        e.stopPropagation()
        onCommit(value)
      }}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="!border-brand !border"
      style={{ height: 24 }}
    />
  )
}

interface TitleNodeProps {
  node: OutlineNode
  phase: ChapterGenerationPhase | undefined
  interactive: boolean
  editable: boolean
  isEditing: boolean
  onCommitTitle?: (next: string) => void
  onCancelTitle?: () => void
  onEnterEditing?: () => void
}

function TitleNode({
  node,
  phase,
  interactive,
  editable,
  isEditing,
  onCommitTitle,
  onCancelTitle,
  onEnterEditing,
}: TitleNodeProps): React.JSX.Element {
  const truncated = node.title.length > MAX_TITLE_LEN
  const displayTitle = truncated ? node.title.slice(0, MAX_TITLE_LEN) + '…' : node.title

  if (isEditing && editable && onCommitTitle && onCancelTitle) {
    return (
      <span data-testid={`outline-node-${node.key}`} aria-label={`编辑 ${node.title}`}>
        <InlineTitleInput initial={node.title} onCommit={onCommitTitle} onCancel={onCancelTitle} />
      </span>
    )
  }

  const handleDoubleClick = editable && onEnterEditing ? () => onEnterEditing() : undefined

  return (
    <span
      onMouseDown={(e) => e.preventDefault()}
      onDoubleClick={handleDoubleClick}
      className={`text-caption text-[var(--color-text-secondary)] select-none ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
      data-testid={`outline-node-${node.key}`}
      aria-label={`${node.level}级标题 ${node.title}`}
      title={node.title}
    >
      {truncated ? <Tooltip title={node.title}>{displayTitle}</Tooltip> : displayTitle}
      {getStatusIcon(phase)}
    </span>
  )
}

interface BuildTreeDataArgs {
  nodes: OutlineNode[]
  interactive: boolean
  chapterPhases?: Map<string, ChapterGenerationPhase>
  editingSectionId: string | null
  sectionIdByNodeKey: Record<string, string>
  projectId: string | null
  onCommitTitle: (projectId: string, sectionId: string, next: string) => void
  onCancelTitle: () => void
  onEnterEditing: (sectionId: string) => void
}

function toTreeData(args: BuildTreeDataArgs): DataNode[] {
  const {
    nodes,
    interactive,
    chapterPhases,
    editingSectionId,
    sectionIdByNodeKey,
    projectId,
    onCommitTitle,
    onCancelTitle,
    onEnterEditing,
  } = args
  return nodes.map((node) => {
    const phaseKey = `${node.level}:${node.title}:${node.occurrenceIndex}`
    const phase = chapterPhases?.get(phaseKey)
    const sectionId = sectionIdByNodeKey[node.key] ?? null
    const editable = Boolean(projectId && sectionId)
    const isEditing = Boolean(sectionId && editingSectionId === sectionId)

    const titleNode = (
      <TitleNode
        node={node}
        phase={phase}
        interactive={interactive}
        editable={editable}
        isEditing={isEditing}
        onCommitTitle={
          editable && sectionId && projectId
            ? (next) => onCommitTitle(projectId, sectionId, next)
            : undefined
        }
        onCancelTitle={editable ? onCancelTitle : undefined}
        onEnterEditing={editable && sectionId ? () => onEnterEditing(sectionId) : undefined}
      />
    )

    return {
      key: node.key,
      title: titleNode,
      children: toTreeData({ ...args, nodes: node.children }),
    }
  })
}

export function DocumentOutlineTree({
  outline,
  onNodeClick,
  chapterPhases,
  structureKeymap,
}: DocumentOutlineTreeProps): React.JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const focusedSectionId = useChapterStructureStore((s) => s.focusedSectionId)
  const editingSectionId = useChapterStructureStore((s) => s.editingSectionId)
  const focusSection = useChapterStructureStore((s) => s.focusSection)
  const enterEditing = useChapterStructureStore((s) => s.enterEditing)
  const exitEditing = useChapterStructureStore((s) => s.exitEditing)
  const commitTitle = useChapterStructureStore((s) => s.commitTitle)

  const nodeMap = useMemo(() => {
    const map = new Map<string, OutlineNode>()
    buildNodeMap(outline, map)
    return map
  }, [outline])
  const allKeys = useMemo(() => collectKeys(outline), [outline])

  const sectionIdByNodeKey = useMemo(
    () => structureKeymap?.sectionIdByNodeKey ?? {},
    [structureKeymap]
  )
  const projectId = structureKeymap?.projectId ?? null

  // Reverse map: sectionId → nodeKey, rebuilt every render from the current
  // outline snapshot. This is the only cross-layer projection — persistent
  // state never stores transient heading keys.
  const nodeKeyBySectionId = useMemo(() => {
    const out = new Map<string, string>()
    for (const [nodeKey, sid] of Object.entries(sectionIdByNodeKey)) {
      out.set(sid, nodeKey)
    }
    return out
  }, [sectionIdByNodeKey])

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      if (keys.length === 0 || !onNodeClick) return
      const key = String(keys[0])
      const node = nodeMap.get(key)
      if (node) {
        setSelectedKeys([key])
        if (structureKeymap) {
          const sid = sectionIdByNodeKey[key]
          if (sid) focusSection(sid)
        }
        onNodeClick(node)
      }
    },
    [nodeMap, onNodeClick, structureKeymap, focusSection, sectionIdByNodeKey]
  )

  const handleEnterEditing = useCallback(
    (sectionId: string) => {
      focusSection(sectionId)
      enterEditing(sectionId)
    },
    [focusSection, enterEditing]
  )

  const handleCommitTitle = useCallback(
    (pid: string, sectionId: string, next: string) => {
      void commitTitle(pid, sectionId, next)
    },
    [commitTitle]
  )

  useStructureKeymap({
    panelRef: rootRef,
    projectId,
    outline,
    onNavigateToNode: (node) => onNodeClick?.(node),
    sectionIdByNodeKey,
    disabled: !structureKeymap,
  })

  // Project focused sectionId back to the current outline's nodeKey so the
  // AntD Tree renders selection. Mutation → new markdown → new `heading-N`
  // key is resolved here without any stale-map risk.
  const effectiveSelectedKeys = useMemo(() => {
    if (structureKeymap && focusedSectionId) {
      const nodeKey = nodeKeyBySectionId.get(focusedSectionId)
      if (nodeKey) return [nodeKey]
    }
    return selectedKeys
  }, [structureKeymap, focusedSectionId, nodeKeyBySectionId, selectedKeys])

  const handleExpand = useCallback(
    (keys: React.Key[]) => {
      const expandedSet = new Set(keys.map(String))
      const nextCollapsed = new Set<string>()
      for (const key of allKeys) {
        if (!expandedSet.has(key)) nextCollapsed.add(key)
      }
      setCollapsedKeys(nextCollapsed)
    },
    [allKeys]
  )

  const interactive = Boolean(onNodeClick)
  const treeData = useMemo(
    () =>
      toTreeData({
        nodes: outline,
        interactive,
        chapterPhases,
        editingSectionId,
        sectionIdByNodeKey,
        projectId,
        onCommitTitle: handleCommitTitle,
        onCancelTitle: exitEditing,
        onEnterEditing: handleEnterEditing,
      }),
    [
      outline,
      interactive,
      chapterPhases,
      editingSectionId,
      sectionIdByNodeKey,
      projectId,
      handleCommitTitle,
      exitEditing,
      handleEnterEditing,
    ]
  )
  const expandedKeys = useMemo(
    () => allKeys.filter((key) => !collapsedKeys.has(key)),
    [allKeys, collapsedKeys]
  )
  const activeSelectedKeys = useMemo(
    () => effectiveSelectedKeys.filter((key) => nodeMap.has(key)),
    [nodeMap, effectiveSelectedKeys]
  )

  if (outline.length === 0) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-2 p-4"
        data-testid="outline-empty"
      >
        <FileTextOutlined style={{ fontSize: 24, color: 'var(--color-text-quaternary)' }} />
        <p className="text-caption text-center" style={{ color: 'var(--color-text-tertiary)' }}>
          开始撰写后，文档大纲将自动生成
        </p>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className={
        'focus:outline-brand h-full px-2 py-1 focus:rounded-sm focus:outline-2 focus-visible:outline-2 ' +
        '[outline-color:var(--color-brand)] focus-visible:[outline-color:var(--color-brand)]'
      }
      tabIndex={structureKeymap ? 0 : -1}
      aria-label="文档大纲树"
      data-testid="outline-tree"
    >
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        onExpand={handleExpand}
        selectedKeys={interactive ? activeSelectedKeys : []}
        onSelect={interactive ? handleSelect : undefined}
        selectable={interactive}
        blockNode
        showLine
        showIcon={false}
        className="h-full bg-transparent"
      />
    </div>
  )
}
