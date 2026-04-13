import { useState } from 'react'
import { Modal, Input, Upload, Button, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { getNativeFilePath } from '@renderer/shared/lib/get-native-file-path'

const { TextArea } = Input

interface AddendumImportModalProps {
  open: boolean
  onImport: (input: { content?: string; filePath?: string; fileName?: string }) => void
  onCancel: () => void
}

export function AddendumImportModal({
  open,
  onImport,
  onCancel,
}: AddendumImportModalProps): React.JSX.Element {
  const [content, setContent] = useState('')
  const [fileList, setFileList] = useState<UploadFile[]>([])

  const selectedFile = fileList[0]
  const hasContent = content.trim().length > 0
  const hasFile = !!selectedFile
  const resetState = (): void => {
    setContent('')
    setFileList([])
  }

  const handleImport = (): void => {
    if (hasContent) {
      onImport({ content: content.trim() })
      resetState()
    } else if (hasFile && selectedFile) {
      const fileName = selectedFile.name
      // For .txt files, read content via FileReader
      if (fileName.endsWith('.txt') && selectedFile.originFileObj) {
        const reader = new FileReader()
        reader.onload = (e): void => {
          const text = e.target?.result as string
          onImport({ content: text, fileName })
          resetState()
        }
        reader.readAsText(selectedFile.originFileObj)
        return
      }
      // For .pdf/.docx/.doc, send file path to main process
      const file = selectedFile.originFileObj as File
      const filePath = getNativeFilePath(file)
      if (filePath) {
        onImport({ filePath, fileName })
        resetState()
      } else {
        message.error('文件路径不可用，请重新选择文件或改为粘贴文本')
      }
    }
  }

  const handleCancel = (): void => {
    resetState()
    onCancel()
  }

  return (
    <Modal
      title="导入招标补遗/变更通知"
      open={open}
      onCancel={handleCancel}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="import"
          type="primary"
          disabled={!hasContent && !hasFile}
          onClick={handleImport}
          data-testid="start-addendum-import"
        >
          开始解析
        </Button>,
      ]}
      width={600}
      data-testid="addendum-import-modal"
    >
      <div className="flex flex-col gap-4 py-2">
        <div>
          <div className="mb-2 text-sm font-medium">粘贴补遗文本</div>
          <TextArea
            rows={6}
            placeholder="将补遗/变更通知文本粘贴到此处..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={hasFile}
            data-testid="addendum-text-input"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-border h-px flex-1" />
          <span className="text-text-tertiary text-xs">或</span>
          <div className="bg-border h-px flex-1" />
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">上传补遗文件</div>
          <Upload
            accept=".pdf,.docx,.doc,.txt"
            maxCount={1}
            fileList={fileList}
            onChange={({ fileList: newFileList }) => setFileList(newFileList)}
            beforeUpload={() => false}
            disabled={hasContent}
            data-testid="addendum-file-upload"
          >
            <Button icon={<UploadOutlined />} disabled={hasContent}>
              选择文件
            </Button>
          </Upload>
          <div className="text-text-tertiary mt-1 text-xs">
            支持 PDF、Word (.docx/.doc)、文本 (.txt) 格式
          </div>
        </div>
      </div>
    </Modal>
  )
}
