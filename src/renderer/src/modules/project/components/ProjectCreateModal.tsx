import { Modal, Form, Input, DatePicker, Select, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useProjectStore } from '@renderer/stores'
import { INDUSTRY_OPTIONS } from '../types'
import type { CreateProjectInput } from '@shared/ipc-types'

interface ProjectCreateModalProps {
  open: boolean
  onClose: () => void
}

export function ProjectCreateModal({ open, onClose }: ProjectCreateModalProps): React.JSX.Element {
  const [form] = Form.useForm<CreateProjectInput & { deadlineDate?: unknown }>()
  const createProject = useProjectStore((s) => s.createProject)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const input: CreateProjectInput = {
        name: values.name,
        customerName: values.customerName || undefined,
        industry: values.industry || undefined,
        deadline: values.deadlineDate
          ? (values.deadlineDate as { toISOString: () => string }).toISOString()
          : undefined,
        proposalType: 'presale-technical',
      }
      await createProject(input)
      message.success('项目创建成功')
      form.resetFields()
      onClose()
    } catch {
      // Validation or API error — form shows inline errors; store sets error
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
      title="新建投标项目"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      okText="创建项目"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      data-testid="project-create-modal"
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          label="项目名称"
          name="name"
          rules={[{ required: true, message: '请输入投标项目名称' }]}
        >
          <Input placeholder="请输入投标项目名称" data-testid="input-name" />
        </Form.Item>
        <Form.Item label="客户名称" name="customerName">
          <Input placeholder="请输入客户/甲方名称" data-testid="input-customer" />
        </Form.Item>
        <Form.Item label="行业领域" name="industry">
          <Select
            placeholder="请选择行业（如军工、医疗、能源...）"
            allowClear
            options={INDUSTRY_OPTIONS.map((i) => ({ label: i, value: i }))}
            data-testid="select-industry"
          />
        </Form.Item>
        <Form.Item label="截止日期" name="deadlineDate">
          <DatePicker
            className="w-full"
            placeholder="请选择截止日期"
            data-testid="input-deadline"
          />
        </Form.Item>
        <Form.Item label="方案类型">
          <Input
            value="售前技术方案"
            disabled
            suffix={<LockOutlined className="text-gray-300" />}
            data-testid="input-proposal-type"
          />
          <div className="text-caption mt-1 text-gray-400">MVP 阶段仅支持售前技术方案类型</div>
        </Form.Item>
      </Form>
    </Modal>
  )
}
