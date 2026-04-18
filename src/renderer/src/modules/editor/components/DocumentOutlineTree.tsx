import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Tree, Tooltip } from 'antd'
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
  /** Map of "level:title:occurrenceIndex" → phase for status icon decoration */
  chapterPhases?: Map<string, ChapterGenerationPhase>
  /**
   * Story 11.3: when set, structural shortcuts (Enter / Tab / Shift+Tab /
   * Delete / F2 / Esc / arrows) bind to the tree root and dispatch to the
   * canonical `chapter-structure-service` mutations.
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

function toTreeData(
  nodes: OutlineNode[],
  interactive: boolean,
  chapterPhases?: Map<string, ChapterGenerationPhase>
): DataNode[] {
  return nodes.map((node) => {
    const truncated = node.title.length > MAX_TITLE_LEN
    const displayTitle = truncated ? node.title.slice(0, MAX_TITLE_LEN) + '…' : node.title
    const phaseKey = `${node.level}:${node.title}:${node.occurrenceIndex}`
    const phase = chapterPhases?.get(phaseKey)

    const titleNode = (
      <span
        onMouseDown={(e) => e.preventDefault()}
        className={`text-caption text-[var(--color-text-secondary)] select-none ${interactive ? 'cursor-pointer' : 'cursor-default'}`}
        data-testid={`outline-node-${node.key}`}
        aria-label={`${node.level}级标题 ${node.title}`}
        title={node.title}
      >
        {truncated ? <Tooltip title={node.title}>{displayTitle}</Tooltip> : displayTitle}
        {getStatusIcon(phase)}
      </span>
    )

    return {
      key: node.key,
      title: titleNode,
      children: toTreeData(node.children, interactive, chapterPhases),
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
  const focusedNodeKey = useChapterStructureStore((s) => s.focusedNodeKey)
  const focusNode = useChapterStructureStore((s) => s.focusNode)
  const registerSectionIds = useChapterStructureStore((s) => s.registerSectionIds)

  const nodeMap = useMemo(() => {
    const map = new Map<string, OutlineNode>()
    buildNodeMap(outline, map)
    return map
  }, [outline])
  const allKeys = useMemo(() => collectKeys(outline), [outline])

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      if (keys.length === 0 || !onNodeClick) return
      const key = String(keys[0])
      const node = nodeMap.get(key)
      if (node) {
        setSelectedKeys([key])
        if (structureKeymap) focusNode(key)
        onNodeClick(node)
      }
    },
    [nodeMap, onNodeClick, structureKeymap, focusNode]
  )

  // Story 11.3: register the bridge from outline keys (heading-N) to canonical
  // sectionIds so requestSoftDelete + IPC mutations can resolve identity.
  useEffect(() => {
    if (!structureKeymap) return
    registerSectionIds(structureKeymap.sectionIdByNodeKey)
  }, [structureKeymap, registerSectionIds])

  useStructureKeymap({
    panelRef: rootRef,
    projectId: structureKeymap?.projectId ?? null,
    outline,
    onNavigateToNode: (node) => onNodeClick?.(node),
    sectionIdByNodeKey: structureKeymap?.sectionIdByNodeKey ?? {},
    disabled: !structureKeymap,
  })

  // Mirror Story 11.2 focused state into Tree's selectedKeys so Tab/arrow nav
  // immediately updates the visual selection without a click round-trip.
  const effectiveSelectedKeys = useMemo(() => {
    if (structureKeymap && focusedNodeKey) return [focusedNodeKey]
    return selectedKeys
  }, [structureKeymap, focusedNodeKey, selectedKeys])
  const handleExpand = useCallback(
    (keys: React.Key[]) => {
      const expandedSet = new Set(keys.map(String))
      const nextCollapsed = new Set<string>()

      for (const key of allKeys) {
        if (!expandedSet.has(key)) {
          nextCollapsed.add(key)
        }
      }

      setCollapsedKeys(nextCollapsed)
    },
    [allKeys]
  )

  const interactive = Boolean(onNodeClick)
  const treeData = useMemo(
    () => toTreeData(outline, interactive, chapterPhases),
    [outline, interactive, chapterPhases]
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
