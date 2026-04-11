import { useCallback, useEffect, useState } from 'react'
import { Form, Input, Modal, Select, message } from 'antd'
import { v4 as uuidv4 } from 'uuid'
import { TagEditor } from './TagEditor'
import { useAssetStore } from '@renderer/stores'
import { ASSET_TYPE_LABELS } from '@shared/asset-types'
import type { AssetType, Tag } from '@shared/asset-types'

const ASSET_TYPE_OPTIONS = (Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][]).map(
  ([value, label]) => ({ value, label })
)

export interface AssetImportContext {
  selectedText: string
  sectionTitle: string
  sourceProject: string | null
  sourceSection: string | null
}

interface AssetImportDialogProps {
  open: boolean
  context: AssetImportContext | null
  onClose: () => void
}

export function AssetImportDialog({
  open,
  context,
  onClose,
}: AssetImportDialogProps): React.JSX.Element {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [draftTags, setDraftTags] = useState<Tag[]>([])
  const createAsset = useAssetStore((s) => s.createAsset)

  // Reset form when dialog opens with new context
  useEffect(() => {
    if (open && context) {
      const defaultTitle =
        context.sectionTitle || context.selectedText.replace(/\n/g, ' ').slice(0, 50)

      form.setFieldsValue({
        title: defaultTitle,
        content: context.selectedText,
        assetType: 'text' as AssetType,
      })
      setDraftTags([])
    }
  }, [open, context, form])

  const handleAddTag = useCallback(
    (tagName: string) => {
      const normalized = tagName.trim().toLowerCase()
      if (draftTags.some((t) => t.normalizedName === normalized)) return
      setDraftTags([
        ...draftTags,
        {
          id: uuidv4(),
          name: tagName.trim(),
          normalizedName: normalized,
          createdAt: new Date().toISOString(),
        },
      ])
    },
    [draftTags]
  )

  const handleRemoveTag = useCallback(
    (tagName: string) => {
      setDraftTags(draftTags.filter((t) => t.name !== tagName))
    },
    [draftTags]
  )

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      await createAsset({
        title: values.title,
        content: values.content,
        assetType: values.assetType,
        sourceProject: context?.sourceProject ?? null,
        sourceSection: context?.sourceSection ?? null,
        tagNames: draftTags.map((t) => t.name),
      })

      void message.success('资产已入库')
      onClose()
    } catch {
      // Form validation failure — handled by antd
    } finally {
      setSubmitting(false)
    }
  }, [form, createAsset, context, draftTags, onClose])

  return (
    <Modal
      title="一键入库"
      open={open}
      width={520}
      maskClosable
      onCancel={onClose}
      onOk={handleSubmit}
      okText="入库"
      cancelText="取消"
      confirmLoading={submitting}
      data-testid="asset-import-dialog"
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="资产标题" />
        </Form.Item>

        <Form.Item
          name="content"
          label="内容预览"
          rules={[{ required: true, message: '内容不能为空' }]}
        >
          <Input.TextArea rows={6} placeholder="资产内容" />
        </Form.Item>

        <Form.Item
          name="assetType"
          label="资产类型"
          rules={[{ required: true, message: '请选择资产类型' }]}
        >
          <Select options={ASSET_TYPE_OPTIONS} />
        </Form.Item>

        <Form.Item label="标签">
          <TagEditor tags={draftTags} onAdd={handleAddTag} onRemove={handleRemoveTag} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
