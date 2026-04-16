import { App, Alert, Form, Input, Modal, Select, Space, Switch, Typography } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { AiConfigStatus, AiProviderName } from '@shared/ai-types'

const { Paragraph, Text } = Typography

interface AiConfigModalProps {
  open: boolean
  onClose: () => void
}

interface AiConfigFormValues {
  provider: AiProviderName
  apiKey?: string
  defaultModel?: string
  baseUrl?: string
  desensitizeEnabled: boolean
}

function trimOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function buildInitialValues(status: AiConfigStatus | null): AiConfigFormValues {
  return {
    provider: status?.provider ?? 'openai',
    apiKey: '',
    defaultModel: status?.defaultModel ?? '',
    baseUrl: status?.baseUrl ?? '',
    desensitizeEnabled: status?.desensitizeEnabled ?? true,
  }
}

export function AiConfigModal({ open, onClose }: AiConfigModalProps): React.JSX.Element {
  const { message } = App.useApp()
  const [form] = Form.useForm<AiConfigFormValues>()
  const [status, setStatus] = useState<AiConfigStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setRequestError(null)

    void window.api
      .configGetAiStatus()
      .then((res) => {
        if (cancelled) return

        if (!res.success) {
          setStatus(null)
          setRequestError(res.error.message)
          form.setFieldsValue(buildInitialValues(null))
          setLoading(false)
          return
        }

        setStatus(res.data)
        setRequestError(res.data.lastError ?? null)
        form.setFieldsValue(buildInitialValues(res.data))
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus(null)
        setRequestError(err instanceof Error ? err.message : 'AI 配置状态加载失败')
        form.setFieldsValue(buildInitialValues(null))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [form, open])

  const provider = Form.useWatch('provider', form) ?? status?.provider ?? 'openai'
  const canReuseExistingKey = status?.provider === provider && status?.hasApiKey

  const statusAlert = useMemo(() => {
    if (requestError) {
      return (
        <Alert
          type="warning"
          showIcon
          message="AI 配置尚未就绪"
          description={requestError}
          data-testid="ai-config-status-alert"
        />
      )
    }

    if (status?.configured) {
      return (
        <Alert
          type="success"
          showIcon
          message="AI 配置已就绪"
          description="当前配置可直接用于章节生成、对抗评审等 AI 功能。"
          data-testid="ai-config-status-alert"
        />
      )
    }

    return (
      <Alert
        type="info"
        showIcon
        message="完成 AI 初始化"
        description="保存后即可启用章节生成、对抗评审等 AI 功能。"
        data-testid="ai-config-status-alert"
      />
    )
  }, [requestError, status?.configured])

  const handleSubmit = async (): Promise<void> => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      setRequestError(null)

      const res = await window.api.configSaveAi({
        provider: values.provider,
        apiKey: trimOptionalString(values.apiKey),
        defaultModel: trimOptionalString(values.defaultModel),
        baseUrl: trimOptionalString(values.baseUrl),
        desensitizeEnabled: values.desensitizeEnabled,
      })

      if (!res.success) {
        setRequestError(res.error.message)
        return
      }

      void message.success('AI 配置已保存')
      onClose()
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return
      }
      setRequestError(err instanceof Error ? err.message : 'AI 配置保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="AI 设置"
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      destroyOnHidden
      data-testid="ai-config-modal"
    >
      <Space direction="vertical" size={16} className="w-full">
        {statusAlert}

        <Paragraph type="secondary" className="mb-0">
          配置会以加密文件形式保存在本机：
          <Text code>{status?.configPath ?? '加载中...'}</Text>
        </Paragraph>

        <Form
          form={form}
          layout="vertical"
          initialValues={buildInitialValues(null)}
          disabled={loading || saving}
        >
          <Form.Item
            name="provider"
            label="Provider"
            rules={[{ required: true, message: '请选择 Provider' }]}
          >
            <Select
              options={[
                { value: 'openai', label: 'OpenAI / OpenAI-compatible' },
                { value: 'claude', label: 'Anthropic Claude' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label="API Key"
            extra={canReuseExistingKey ? '留空则保留现有密钥' : '首次配置时必填'}
            rules={[
              {
                validator: async (_, value) => {
                  if (trimOptionalString(value) || canReuseExistingKey) return
                  throw new Error('请输入 API Key')
                },
              },
            ]}
          >
            <Input.Password placeholder="sk-..." autoComplete="off" />
          </Form.Item>

          <Form.Item name="defaultModel" label="默认模型">
            <Input placeholder={provider === 'openai' ? 'gpt-4o' : 'claude-opus-4-6'} />
          </Form.Item>

          <Form.Item name="baseUrl" label="API Base URL">
            <Input
              placeholder={
                provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com'
              }
              autoComplete="off"
            />
          </Form.Item>

          <Form.Item name="desensitizeEnabled" label="发送前脱敏" valuePropName="checked">
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>
        </Form>
      </Space>
    </Modal>
  )
}
