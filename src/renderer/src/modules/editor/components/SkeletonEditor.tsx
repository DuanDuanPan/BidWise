import { useState, useCallback, useRef, useMemo } from 'react'
import { Tree, Tag, Button, Input, Modal, Dropdown, Typography } from 'antd'
import { PlusOutlined, DeleteOutlined, MoreOutlined } from '@ant-design/icons'
import type { SkeletonSection } from '@shared/template-types'
import type { DataNode, TreeProps } from 'antd/es/tree'

const { Text } = Typography

interface SkeletonEditorProps {
  skeleton: SkeletonSection[]
  onUpdate: (updated: SkeletonSection[]) => void
  onConfirm: () => void
  onRegenerate: () => void
}

let sectionCounter = 0
function generateSectionId(): string {
  sectionCounter += 1
  return `new-${Date.now()}-${sectionCounter}`
}

function cloneSkeleton(sections: SkeletonSection[]): SkeletonSection[] {
  return JSON.parse(JSON.stringify(sections)) as SkeletonSection[]
}

function getAllKeys(sections: SkeletonSection[]): string[] {
  const keys: string[] = []
  function collect(section: SkeletonSection): void {
    keys.push(section.id)
    for (const child of section.children) {
      collect(child)
    }
  }
  for (const s of sections) {
    collect(s)
  }
  return keys
}

function countSections(sections: SkeletonSection[]): { total: number; keyFocus: number } {
  let total = 0
  let keyFocus = 0
  function count(section: SkeletonSection): void {
    total++
    if (section.isKeyFocus) keyFocus++
    for (const child of section.children) {
      count(child)
    }
  }
  for (const s of sections) {
    count(s)
  }
  return { total, keyFocus }
}

function getNodeDepth(sections: SkeletonSection[], targetId: string): number {
  function find(nodes: SkeletonSection[], depth: number): number {
    for (const node of nodes) {
      if (node.id === targetId) return depth
      const childResult = find(node.children, depth + 1)
      if (childResult >= 0) return childResult
    }
    return -1
  }
  return find(sections, 1)
}

function getMaxChildDepth(section: SkeletonSection): number {
  if (section.children.length === 0) return 0
  return 1 + Math.max(...section.children.map(getMaxChildDepth))
}

function findParentAndIndex(
  sections: SkeletonSection[],
  targetId: string
): { parent: SkeletonSection[] | null; index: number; parentNode: SkeletonSection | null } {
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].id === targetId) {
      return { parent: sections, index: i, parentNode: null }
    }
    const result = findInChildren(sections[i], targetId)
    if (result) return result
  }
  return { parent: null, index: -1, parentNode: null }
}

function findInChildren(
  parent: SkeletonSection,
  targetId: string
): { parent: SkeletonSection[]; index: number; parentNode: SkeletonSection } | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].id === targetId) {
      return { parent: parent.children, index: i, parentNode: parent }
    }
    const result = findInChildren(parent.children[i], targetId)
    if (result) return result
  }
  return null
}

function findNode(sections: SkeletonSection[], id: string): SkeletonSection | null {
  for (const s of sections) {
    if (s.id === id) return s
    const found = findNode(s.children, id)
    if (found) return found
  }
  return null
}

function removeNode(sections: SkeletonSection[], id: string): SkeletonSection[] {
  return sections
    .filter((s) => s.id !== id)
    .map((s) => ({
      ...s,
      children: removeNode(s.children, id),
    }))
}

function updateSubtreeLevels(node: SkeletonSection, parentLevel: number): void {
  node.level = parentLevel as 1 | 2 | 3 | 4
  for (const child of node.children) {
    updateSubtreeLevels(child, parentLevel + 1)
  }
}

function getWeightColor(weightPercent: number | undefined): string | undefined {
  if (weightPercent === undefined) return undefined
  if (weightPercent >= 15) return 'red'
  if (weightPercent >= 5) return 'orange'
  return undefined
}

export function SkeletonEditor({
  skeleton,
  onUpdate,
  onConfirm,
  onRegenerate,
}: SkeletonEditorProps): React.JSX.Element {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<ReturnType<typeof Input>>(null)

  // Derive expanded keys: all keys minus user-collapsed ones
  const expandedKeys = useMemo(() => {
    const allKeys = getAllKeys(skeleton)
    return allKeys.filter((k) => !collapsedKeys.has(k))
  }, [skeleton, collapsedKeys])

  const handleExpand = useCallback(
    (keys: string[]) => {
      const allKeys = getAllKeys(skeleton)
      const expandedSet = new Set(keys)
      const newCollapsed = new Set<string>()
      for (const k of allKeys) {
        if (!expandedSet.has(k)) newCollapsed.add(k)
      }
      setCollapsedKeys(newCollapsed)
    },
    [skeleton]
  )

  const startEditing = useCallback((id: string, currentTitle: string) => {
    setEditingId(id)
    setEditValue(currentTitle)
  }, [])

  const commitEdit = useCallback(() => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null)
      return
    }
    const updated = cloneSkeleton(skeleton)
    const node = findNode(updated, editingId)
    if (node) {
      node.title = editValue.trim()
      onUpdate(updated)
    }
    setEditingId(null)
  }, [editingId, editValue, skeleton, onUpdate])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const addSibling = useCallback(
    (targetId: string) => {
      const updated = cloneSkeleton(skeleton)
      const { parent, index, parentNode } = findParentAndIndex(updated, targetId)
      if (!parent) return

      const level = parentNode ? ((parentNode.level + 1) as 1 | 2 | 3 | 4) : (1 as const)
      const newId = generateSectionId()
      const newNode: SkeletonSection = {
        id: newId,
        title: '新章节',
        level,
        isKeyFocus: false,
        children: [],
      }
      parent.splice(index + 1, 0, newNode)
      onUpdate(updated)
      startEditing(newId, '新章节')
    },
    [skeleton, onUpdate, startEditing]
  )

  const addChild = useCallback(
    (targetId: string) => {
      const updated = cloneSkeleton(skeleton)
      const node = findNode(updated, targetId)
      if (!node || node.level >= 4) return

      const newId = generateSectionId()
      const newNode: SkeletonSection = {
        id: newId,
        title: '新章节',
        level: (node.level + 1) as 1 | 2 | 3 | 4,
        isKeyFocus: false,
        children: [],
      }
      node.children.push(newNode)
      onUpdate(updated)
      startEditing(newId, '新章节')
    },
    [skeleton, onUpdate, startEditing]
  )

  const deleteNode = useCallback(
    (targetId: string, title: string) => {
      Modal.confirm({
        title: '确认删除',
        content: `确定删除「${title}」及其所有子章节？`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => {
          const updated = removeNode(cloneSkeleton(skeleton), targetId)
          onUpdate(updated)
        },
      })
    },
    [skeleton, onUpdate]
  )

  const handleDrop: TreeProps['onDrop'] = useCallback(
    (info) => {
      const dragKey = info.dragNode.key as string
      const dropKey = info.node.key as string
      const dropPos = info.node.pos.split('-')
      const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1])

      const updated = cloneSkeleton(skeleton)

      // Find and remove the dragged node
      const dragNode = findNode(updated, dragKey)
      if (!dragNode) return
      const dragNodeCopy = JSON.parse(JSON.stringify(dragNode)) as SkeletonSection
      const afterRemove = removeNode(updated, dragKey)

      // Calculate new depth
      const dropNodeDepth = getNodeDepth(afterRemove, dropKey)
      if (dropNodeDepth < 0) return

      const dragSubtreeDepth = getMaxChildDepth(dragNodeCopy)

      if (info.dropToGap) {
        // Drop as sibling — depth stays the same as drop target
        if (dropNodeDepth + dragSubtreeDepth > 4) return
        const newLevel = getNodeDepth(afterRemove, dropKey)
        updateSubtreeLevels(dragNodeCopy, newLevel)

        const { parent, index } = findParentAndIndex(afterRemove, dropKey)
        if (!parent) return

        const insertIndex = dropPosition === -1 ? index : index + 1
        parent.splice(insertIndex, 0, dragNodeCopy)
      } else {
        // Drop as child
        const newDepth = dropNodeDepth + 1
        if (newDepth + dragSubtreeDepth > 4) return
        updateSubtreeLevels(dragNodeCopy, newDepth)

        const dropNode = findNode(afterRemove, dropKey)
        if (!dropNode) return
        dropNode.children.push(dragNodeCopy)
      }

      onUpdate(afterRemove)
    },
    [skeleton, onUpdate]
  )

  const allowDrop: TreeProps['allowDrop'] = useCallback(
    ({ dragNode, dropNode, dropPosition }) => {
      const dragKey = dragNode.key as string
      const dropKey = dropNode.key as string
      const dragSectionNode = findNode(skeleton, dragKey)
      if (!dragSectionNode) return false

      const dragDepth = getMaxChildDepth(dragSectionNode)

      if (dropPosition === 0) {
        // Dropping into dropNode as child
        const dropDepth = getNodeDepth(skeleton, dropKey)
        return dropDepth + 1 + dragDepth <= 4
      }

      // Dropping as sibling
      const dropDepth = getNodeDepth(skeleton, dropKey)
      return dropDepth + dragDepth <= 4
    },
    [skeleton]
  )

  function sectionsToTreeData(sections: SkeletonSection[]): DataNode[] {
    return sections.map((section) => ({
      key: section.id,
      title:
        editingId === section.id ? (
          <Input
            ref={inputRef}
            size="small"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onPressEnter={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEdit()
            }}
            onBlur={commitEdit}
            autoFocus
            className="w-48"
            data-testid={`edit-input-${section.id}`}
          />
        ) : (
          <span
            className="group inline-flex items-center gap-2"
            data-testid={`tree-node-${section.id}`}
          >
            <span
              className="cursor-text"
              onDoubleClick={() => startEditing(section.id, section.title)}
            >
              {section.title}
            </span>
            {section.weightPercent !== undefined && (
              <Tag color={getWeightColor(section.weightPercent)} className="ml-1">
                {section.weightPercent}%
              </Tag>
            )}
            {section.isKeyFocus && (
              <Tag color="red" data-testid={`key-focus-${section.id}`}>
                重点投入
              </Tag>
            )}
            <span className="invisible group-hover:visible">
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'add-sibling',
                      icon: <PlusOutlined />,
                      label: '添加同级章节',
                      onClick: () => addSibling(section.id),
                    },
                    {
                      key: 'add-child',
                      icon: <PlusOutlined />,
                      label: '添加子章节',
                      disabled: section.level >= 4,
                      onClick: () => addChild(section.id),
                    },
                    { type: 'divider' },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: '删除',
                      danger: true,
                      onClick: () => deleteNode(section.id, section.title),
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="text-text-tertiary"
                  data-testid={`node-actions-${section.id}`}
                />
              </Dropdown>
            </span>
          </span>
        ),
      children: section.children.length > 0 ? sectionsToTreeData(section.children) : undefined,
    }))
  }

  const treeData = sectionsToTreeData(skeleton)
  const { total, keyFocus } = countSections(skeleton)

  return (
    <div className="flex h-full flex-col" data-testid="skeleton-editor">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <Tree
          treeData={treeData}
          draggable
          showLine
          blockNode
          expandedKeys={expandedKeys}
          onExpand={(keys) => handleExpand(keys as string[])}
          onDrop={handleDrop}
          allowDrop={allowDrop}
        />
      </div>

      {/* Bottom action bar */}
      <div className="border-border flex items-center justify-between border-t px-4 py-3">
        <div className="flex items-center gap-4">
          <Button type="text" onClick={onRegenerate} data-testid="regenerate-btn">
            重新选择模板
          </Button>
          <Text type="secondary">
            {total} 个章节，{keyFocus} 个重点章节
          </Text>
        </div>
        <Button type="primary" onClick={onConfirm} data-testid="confirm-skeleton-btn">
          确认骨架，开始撰写
        </Button>
      </div>
    </div>
  )
}
