import { useState } from 'react'
import { Modal, Input } from 'antd'

const { TextArea } = Input

interface RegenerateDialogProps {
  open: boolean
  chapterTitle: string
  onConfirm: (additionalContext: string) => void
  onCancel: () => void
}

export function RegenerateDialog({
  open,
  chapterTitle,
  onConfirm,
  onCancel,
}: RegenerateDialogProps): React.JSX.Element {
  const [context, setContext] = useState('')

  const handleConfirm = (): void => {
    onConfirm(context.trim())
    setContext('')
  }

  const handleCancel = (): void => {
    onCancel()
    setContext('')
  }

  return (
    <Modal
      title={`重新生成: ${chapterTitle}`}
      open={open}
      onOk={handleConfirm}
      onCancel={handleCancel}
      okText="重新生成"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      data-testid="regenerate-dialog"
    >
      <p className="text-caption mb-3" style={{ color: 'var(--color-text-secondary)' }}>
        当前章节内容将被 AI 重新生成的内容替换。你可以补充说明来引导生成方向：
      </p>
      <TextArea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="例如：重点突出我方在智慧城市领域的项目经验，语气更正式..."
        rows={4}
        maxLength={2000}
        showCount
        data-testid="regenerate-context-input"
      />
    </Modal>
  )
}
