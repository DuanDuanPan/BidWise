import { useEffect, useMemo } from 'react'
import { Modal, Form, Input, AutoComplete, App } from 'antd'
import type { TerminologyEntry, CreateTerminologyInput } from '@shared/terminology-types'
import { useTerminologyStore } from '@renderer/stores'

interface TerminologyEntryFormProps {
  open: boolean
  editingEntry: TerminologyEntry | null
  onClose: () => void
}

export function TerminologyEntryForm({
  open,
  editingEntry,
  onClose,
}: TerminologyEntryFormProps): React.JSX.Element {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const { entries, createEntry, updateEntry } = useTerminologyStore()

  const isEditing = editingEntry !== null

  // Extract unique categories from existing entries for autocomplete
  const categoryOptions = useMemo(() => {
    const categories = new Set<string>()
    for (const entry of entries) {
      if (entry.category) categories.add(entry.category)
    }
    return Array.from(categories).map((c) => ({ value: c }))
  }, [entries])

  useEffect(() => {
    if (open) {
      if (editingEntry) {
        form.setFieldsValue({
          sourceTerm: editingEntry.sourceTerm,
          targetTerm: editingEntry.targetTerm,
          category: editingEntry.category || '',
          description: editingEntry.description || '',
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, editingEntry, form])

  const handleSubmit = async (): Promise<void> => {
    // Validate first — Ant Design shows inline field errors automatically
    let values: Record<string, string>
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    try {
      if (isEditing) {
        await updateEntry({
          id: editingEntry.id,
          sourceTerm: values.sourceTerm,
          targetTerm: values.targetTerm,
          category: values.category || null,
          description: values.description || null,
        })
        message.success('术语映射已更新')
      } else {
        const input: CreateTerminologyInput = {
          sourceTerm: values.sourceTerm,
          targetTerm: values.targetTerm,
          category: values.category || undefined,
          description: values.description || undefined,
        }
        await createEntry(input)
        message.success('术语映射已创建')
      }
      onClose()
    } catch (err) {
      const errorMessage = (err as Error).message || ''
      // Check for duplicate error — show it on the source term field
      if (errorMessage.includes('该术语已存在')) {
        form.setFields([
          {
            name: 'sourceTerm',
            errors: [errorMessage],
          },
        ])
      } else if (errorMessage) {
        message.error(`保存失败：${errorMessage}`)
      } else {
        message.error('保存失败，请稍后重试')
      }
    }
  }

  return (
    <Modal
      title={isEditing ? '编辑术语映射' : '添加术语映射'}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="sourceTerm"
          label="源术语"
          rules={[{ required: true, message: '请输入源术语' }]}
        >
          <Input placeholder='如"设备管理"' />
        </Form.Item>

        <Form.Item
          name="targetTerm"
          label="目标术语"
          rules={[{ required: true, message: '请输入目标术语' }]}
        >
          <Input placeholder='如"装备全寿命周期管理"' />
        </Form.Item>

        <Form.Item name="category" label="分类">
          <AutoComplete
            options={categoryOptions}
            placeholder='如"军工装备"、"信息化"'
            filterOption={(inputValue, option) =>
              option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
            }
          />
        </Form.Item>

        <Form.Item
          name="description"
          label="说明"
          rules={[{ max: 200, message: '说明不能超过 200 字' }]}
        >
          <Input.TextArea rows={3} maxLength={200} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
