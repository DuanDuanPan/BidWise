import { useCallback, useMemo, useState } from 'react'
import { Tree, Tooltip } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import type { OutlineNode } from '@modules/editor/hooks/useDocumentOutline'

const MAX_TITLE_LEN = 30

interface DocumentOutlineTreeProps {
  outline: OutlineNode[]
  onNodeClick: (node: OutlineNode) => void
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

function toTreeData(nodes: OutlineNode[]): DataNode[] {
  return nodes.map((node) => {
    const truncated = node.title.length > MAX_TITLE_LEN
    const displayTitle = truncated ? node.title.slice(0, MAX_TITLE_LEN) + '…' : node.title

    const titleNode = (
      <span
        onMouseDown={(e) => e.preventDefault()}
        className="text-caption cursor-pointer text-[var(--color-text-secondary)] select-none"
        data-testid={`outline-node-${node.key}`}
        aria-label={`${node.level}级标题 ${node.title}`}
        title={node.title}
      >
        {truncated ? <Tooltip title={node.title}>{displayTitle}</Tooltip> : displayTitle}
      </span>
    )

    return {
      key: node.key,
      title: titleNode,
      children: toTreeData(node.children),
    }
  })
}

export function DocumentOutlineTree({
  outline,
  onNodeClick,
}: DocumentOutlineTreeProps): React.JSX.Element {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  const nodeMap = useMemo(() => {
    const map = new Map<string, OutlineNode>()
    buildNodeMap(outline, map)
    return map
  }, [outline])

  const handleSelect = useCallback(
    (keys: React.Key[]) => {
      if (keys.length === 0) return
      const key = String(keys[0])
      const node = nodeMap.get(key)
      if (node) {
        setSelectedKeys([key])
        onNodeClick(node)
      }
    },
    [nodeMap, onNodeClick]
  )

  const treeData = useMemo(() => toTreeData(outline), [outline])
  const expandedKeys = useMemo(() => collectKeys(outline), [outline])
  const activeSelectedKeys = useMemo(
    () => selectedKeys.filter((key) => nodeMap.has(key)),
    [nodeMap, selectedKeys]
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
    <div className="h-full px-2 py-1" aria-label="文档大纲树" data-testid="outline-tree">
      <Tree
        treeData={treeData}
        expandedKeys={expandedKeys}
        selectedKeys={activeSelectedKeys}
        onSelect={handleSelect}
        blockNode
        showLine
        showIcon={false}
        className="h-full bg-transparent"
      />
    </div>
  )
}
