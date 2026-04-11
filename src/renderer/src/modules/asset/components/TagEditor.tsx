import { useState, type KeyboardEvent } from 'react'
import { Input, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { Tag as TagType } from '@shared/asset-types'

interface TagEditorProps {
  tags: TagType[]
  onAdd: (tagName: string) => void
  onRemove: (tagName: string) => void
}

export function TagEditor({ tags, onAdd, onRemove }: TagEditorProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')

  const handleInputConfirm = (): void => {
    const trimmed = inputValue.trim()
    if (trimmed) {
      onAdd(trimmed)
      setInputValue('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleInputConfirm()
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tags.map((tag) => (
          <Tag
            key={tag.id}
            closable
            onClose={(e) => {
              e.preventDefault()
              onRemove(tag.name)
            }}
            color="blue"
          >
            {tag.name}
          </Tag>
        ))}
      </div>
      <Input
        size="small"
        style={{ width: 200 }}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleInputConfirm}
        placeholder="添加标签..."
        prefix={<PlusOutlined style={{ color: '#BFBFBF' }} />}
      />
      <div style={{ marginTop: 4, fontSize: 12, color: '#8C8C8C' }}>
        按 Enter 添加标签，点击 × 删除标签
      </div>
    </div>
  )
}
