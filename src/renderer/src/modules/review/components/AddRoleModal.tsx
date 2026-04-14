import { Modal, Form, Input, Select } from 'antd'
import { useState } from 'react'
import type { AdversarialIntensity } from '@shared/adversarial-types'

interface AddRoleFormValues {
  name: string
  perspective: string
  attackFocus: string
  intensity: AdversarialIntensity
  description: string
}

interface AddRoleModalProps {
  open: boolean
  onClose: () => void
  onAdd: (values: {
    name: string
    perspective: string
    attackFocus: string[]
    intensity: AdversarialIntensity
    description: string
  }) => void
}

export function AddRoleModal({ open, onClose, onAdd }: AddRoleModalProps): React.JSX.Element {
  const [form] = Form.useForm<AddRoleFormValues>()
  const [submitting, setSubmitting] = useState(false)

  const handleOk = async (): Promise<void> => {
    try {
      setSubmitting(true)
      const values = await form.validateFields()
      const attackFocus = values.attackFocus
        .split(/[、,，]/)
        .map((s) => s.trim())
        .filter(Boolean)

      onAdd({
        name: values.name.trim(),
        perspective: values.perspective.trim(),
        attackFocus,
        intensity: values.intensity,
        description: values.description.trim(),
      })
      form.resetFields()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = (): void => {
    form.resetFields()
    onClose()
  }

  return (
    <Modal
      title="添加自定义角色"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      okText="添加"
      cancelText="取消"
      destroyOnHidden
      data-testid="add-role-modal"
    >
      <Form form={form} layout="vertical" initialValues={{ intensity: 'medium' }}>
        <Form.Item
          name="name"
          label="角色名称"
          rules={[{ required: true, message: '请输入角色名称' }]}
        >
          <Input placeholder="如：用户体验官" data-testid="add-role-name" />
        </Form.Item>
        <Form.Item
          name="perspective"
          label="视角描述"
          rules={[{ required: true, message: '请输入视角描述' }]}
        >
          <Input.TextArea
            rows={2}
            placeholder="该角色从什么立场审查方案"
            data-testid="add-role-perspective"
          />
        </Form.Item>
        <Form.Item
          name="attackFocus"
          label="攻击焦点（用顿号分隔）"
          rules={[{ required: true, message: '请输入攻击焦点' }]}
        >
          <Input.TextArea
            rows={2}
            placeholder="如：界面友好性、操作流程复杂度、培训成本"
            data-testid="add-role-focus"
          />
        </Form.Item>
        <Form.Item name="intensity" label="攻击强度">
          <Select
            options={[
              { label: '高', value: 'high' },
              { label: '中', value: 'medium' },
              { label: '低', value: 'low' },
            ]}
            data-testid="add-role-intensity"
          />
        </Form.Item>
        <Form.Item
          name="description"
          label="角色简述"
          rules={[{ required: true, message: '请输入角色简述' }]}
        >
          <Input.TextArea
            rows={2}
            placeholder="说明该角色存在的意义"
            data-testid="add-role-description"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
