import { Modal, Form, Input, DatePicker, Select, message } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import { useProjectStore } from '@renderer/stores'
import { INDUSTRY_OPTIONS } from '../types'
import type { ProjectListItem, UpdateProjectInput } from '@shared/ipc-types'

interface ProjectEditModalProps {
  open: boolean
  project: ProjectListItem | null
  onClose: () => void
}

export function ProjectEditModal({
  open,
  project,
  onClose,
}: ProjectEditModalProps): React.JSX.Element {
  const [form] = Form.useForm()
  const updateProject = useProjectStore((s) => s.updateProject)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && project) {
      form.setFieldsValue({
        name: project.name,
        customerName: project.customerName,
        industry: project.industry,
        deadlineDate: project.deadline ? dayjs(project.deadline) : null,
      })
    }
  }, [open, project, form])

  const handleSubmit = async (): Promise<void> => {
    if (!project) return
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const input: UpdateProjectInput = {
        name: values.name,
        customerName: values.customerName || null,
        industry: values.industry || null,
        deadline: values.deadlineDate ? values.deadlineDate.toISOString() : null,
      }
      await updateProject(project.id, input)
      message.success('项目更新成功')
      onClose()
    } catch {
      // Validation or API error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="编辑项目"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
      data-testid="project-edit-modal"
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          label="项目名称"
          name="name"
          rules={[{ required: true, message: '请输入投标项目名称' }]}
        >
          <Input placeholder="请输入投标项目名称" />
        </Form.Item>
        <Form.Item label="客户名称" name="customerName">
          <Input placeholder="请输入客户/甲方名称" />
        </Form.Item>
        <Form.Item label="行业领域" name="industry">
          <Select
            placeholder="请选择行业"
            allowClear
            options={INDUSTRY_OPTIONS.map((i) => ({ label: i, value: i }))}
          />
        </Form.Item>
        <Form.Item label="截止日期" name="deadlineDate">
          <DatePicker className="w-full" placeholder="请选择截止日期" />
        </Form.Item>
        <Form.Item label="方案类型">
          <Input
            value="售前技术方案"
            disabled
            suffix={<LockOutlined className="text-gray-300" />}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
