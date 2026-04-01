import { useState } from 'react'
import { Modal, Input, Upload, Button, message } from 'antd'
import { UploadOutlined, ThunderboltOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'

const { TextArea } = Input

interface MaterialInputModalProps {
  open: boolean
  loading: boolean
  onGenerate: (sourceMaterial: string) => void
  onCancel: () => void
}

export function MaterialInputModal({
  open,
  loading,
  onGenerate,
  onCancel,
}: MaterialInputModalProps): React.JSX.Element {
  const [material, setMaterial] = useState('')

  const handleFileRead = (file: UploadFile): false => {
    const rawFile = file as unknown as File
    if (!rawFile.name.endsWith('.txt')) {
      message.warning('仅支持 .txt 文件')
      return false
    }

    const reader = new FileReader()
    reader.onload = (e): void => {
      const text = e.target?.result
      if (typeof text === 'string') {
        setMaterial((prev) => (prev ? `${prev}\n\n---\n\n${text}` : text))
      }
    }
    reader.readAsText(rawFile)
    return false
  }

  const handleGenerate = (): void => {
    const trimmed = material.trim()
    if (!trimmed) {
      message.warning('请输入或上传沟通素材')
      return
    }
    onGenerate(trimmed)
  }

  const handleAfterClose = (): void => {
    setMaterial('')
  }

  return (
    <Modal
      title="上传客户沟通素材"
      open={open}
      onCancel={onCancel}
      afterClose={handleAfterClose}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          取消
        </Button>,
        <Button
          key="generate"
          type="primary"
          icon={<ThunderboltOutlined />}
          onClick={handleGenerate}
          loading={loading}
          disabled={!material.trim()}
          data-testid="material-generate"
        >
          开始生成
        </Button>,
      ]}
      width={640}
      data-testid="material-modal"
    >
      <div className="mb-4">
        <div className="mb-2 text-sm text-gray-600">
          请粘贴客户沟通记录（会议纪要、邮件、聊天记录等），或上传 .txt 文件。 AI
          将从中提取隐性需求，生成策略种子。
        </div>
        <TextArea
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="在此粘贴客户沟通内容..."
          autoSize={{ minRows: 8, maxRows: 20 }}
          data-testid="material-textarea"
        />
      </div>

      <Upload
        accept=".txt"
        beforeUpload={handleFileRead}
        showUploadList={false}
        data-testid="material-upload"
      >
        <Button icon={<UploadOutlined />}>上传 .txt 文件</Button>
      </Upload>
    </Modal>
  )
}
