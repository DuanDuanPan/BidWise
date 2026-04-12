import { useState } from 'react'
import { Modal, Upload, Table, Button, App, Space, Typography } from 'antd'
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons'
import type { CreateTerminologyInput, BatchCreateResult } from '@shared/terminology-types'
import { useTerminologyStore } from '@renderer/stores'

const { Text } = Typography

interface TerminologyImportDialogProps {
  open: boolean
  onClose: () => void
}

interface ParsedRow {
  sourceTerm: string
  targetTerm: string
  category: string
  description: string
}

function parseCsv(text: string): ParsedRow[] {
  // Remove BOM if present
  const content = text.replace(/^\uFEFF/, '')
  // Split lines handling both \r\n and \n
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length === 0) return []

  const rows: ParsedRow[] = []
  // Skip header if it matches expected columns
  const firstLine = lines[0].toLowerCase()
  const startIndex =
    firstLine.includes('源术语') || firstLine.includes('sourceTerm'.toLowerCase()) ? 1 : 0

  for (let i = startIndex; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length >= 2) {
      rows.push({
        sourceTerm: fields[0].trim(),
        targetTerm: fields[1].trim(),
        category: (fields[2] || '').trim(),
        description: (fields[3] || '').trim(),
      })
    }
  }

  return rows
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }
  fields.push(current)

  return fields
}

function generateTemplate(): string {
  return '源术语,目标术语,分类,说明\n设备管理,装备全寿命周期管理,军工装备,行业标准术语\n系统,信息化平台,信息化,\n'
}

function downloadTemplate(): void {
  const content = generateTemplate()
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'terminology-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const previewColumns = [
  { title: '源术语', dataIndex: 'sourceTerm', key: 'sourceTerm' },
  { title: '目标术语', dataIndex: 'targetTerm', key: 'targetTerm' },
  { title: '分类', dataIndex: 'category', key: 'category' },
  { title: '说明', dataIndex: 'description', key: 'description' },
]

export function TerminologyImportDialog({
  open,
  onClose,
}: TerminologyImportDialogProps): React.JSX.Element {
  const { message } = App.useApp()
  const { batchCreate } = useTerminologyStore()
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [importResult, setImportResult] = useState<BatchCreateResult | null>(null)
  const [importing, setImporting] = useState(false)

  const handleFileUpload = (file: File): false => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const rows = parseCsv(text)
        if (rows.length === 0) {
          message.warning('CSV 文件为空或格式不正确')
          return
        }
        setParsedRows(rows)
        setImportResult(null)
      } catch {
        message.error('CSV 解析失败，请检查文件格式')
      }
    }
    reader.readAsText(file, 'utf-8')
    return false // Prevent default upload behavior
  }

  const handleImport = async (): Promise<void> => {
    if (parsedRows.length === 0) return
    setImporting(true)
    try {
      const entries: CreateTerminologyInput[] = parsedRows
        .filter((r) => r.sourceTerm && r.targetTerm)
        .map((r) => ({
          sourceTerm: r.sourceTerm,
          targetTerm: r.targetTerm,
          category: r.category || undefined,
          description: r.description || undefined,
        }))
      const result = await batchCreate({ entries })
      setImportResult(result)
      message.success(`成功导入 ${result.created} 条，跳过 ${result.duplicates.length} 条重复`)
    } catch {
      message.error('导入失败')
    } finally {
      setImporting(false)
    }
  }

  const handleClose = (): void => {
    setParsedRows([])
    setImportResult(null)
    onClose()
  }

  return (
    <Modal
      title="批量导入术语"
      open={open}
      onCancel={handleClose}
      width={600}
      footer={
        importResult ? (
          <Button onClick={handleClose}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button
              type="primary"
              onClick={handleImport}
              disabled={parsedRows.length === 0}
              loading={importing}
            >
              导入
            </Button>
          </Space>
        )
      }
      destroyOnClose
    >
      {importResult ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Text strong style={{ fontSize: 16 }}>
            成功导入 {importResult.created} 条，跳过 {importResult.duplicates.length} 条重复
          </Text>
          {importResult.duplicates.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">跳过的术语：{importResult.duplicates.join('、')}</Text>
            </div>
          )}
        </div>
      ) : parsedRows.length === 0 ? (
        <div>
          <Upload.Dragger accept=".csv" beforeUpload={handleFileUpload} showUploadList={false}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到此区域</p>
            <p className="ant-upload-hint">格式：源术语, 目标术语, 分类, 说明（分类和说明可选）</p>
          </Upload.Dragger>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Button icon={<DownloadOutlined />} type="link" onClick={downloadTemplate}>
              下载模板
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
            共解析 {parsedRows.length} 条记录{parsedRows.length > 20 ? '（预览前 20 条）' : ''}
          </Text>
          <Table
            dataSource={parsedRows.slice(0, 20)}
            columns={previewColumns}
            rowKey={(_, index) => String(index)}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        </div>
      )}
    </Modal>
  )
}
