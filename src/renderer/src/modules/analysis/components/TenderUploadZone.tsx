import { Upload, message } from 'antd'
import { InboxOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import { getAnalysisProjectState, useAnalysisStore } from '@renderer/stores'
import { getNativeFilePath } from '@renderer/shared/lib/get-native-file-path'
import type { TenderUploadZoneProps } from '../types'

const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200MB
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.doc'

export function TenderUploadZone({
  projectId,
  disabled,
}: TenderUploadZoneProps): React.JSX.Element {
  const importTender = useAnalysisStore((s) => s.importTender)
  const { tenderMeta, loading } = useAnalysisStore((state) =>
    getAnalysisProjectState(state, projectId)
  )
  const isDisabled = disabled || loading

  const handleBeforeUpload = (file: File): false => {
    if (file.size > MAX_FILE_SIZE) {
      message.error('文件大小超过 200MB 限制，请压缩后重试')
      return false
    }

    const filePath = getNativeFilePath(file)
    if (!filePath) {
      message.error('无法获取文件路径')
      return false
    }

    void importTender(projectId, filePath)
    return false // Prevent default upload behavior
  }

  if (tenderMeta) {
    return (
      <div className="flex flex-col items-center gap-3 p-8" data-testid="tender-uploaded">
        <FileTextOutlined style={{ fontSize: 32 }} className="text-brand" />
        <div className="text-body text-center">
          <div className="font-medium">{tenderMeta.originalFileName}</div>
          <div className="text-text-tertiary text-caption mt-1">
            {tenderMeta.format.toUpperCase()} · {tenderMeta.pageCount} 页
          </div>
        </div>
        <button
          type="button"
          className="text-brand hover:text-brand-hover flex cursor-pointer items-center gap-1 border-none bg-transparent text-sm"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = ACCEPTED_EXTENSIONS
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0]
              if (f) handleBeforeUpload(f)
            }
            input.click()
          }}
          disabled={isDisabled}
          data-testid="reimport-btn"
        >
          <ReloadOutlined /> 重新导入
        </button>
      </div>
    )
  }

  return (
    <div className="p-8" data-testid="tender-upload-zone">
      <Upload.Dragger
        accept={ACCEPTED_EXTENSIONS}
        beforeUpload={handleBeforeUpload}
        showUploadList={false}
        disabled={isDisabled}
        multiple={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p className="ant-upload-hint">
          本阶段目标：理解甲方要什么。请上传招标文件（支持 PDF、Word
          格式），系统将自动解析文档结构。
        </p>
      </Upload.Dragger>
    </div>
  )
}
