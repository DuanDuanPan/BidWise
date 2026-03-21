import { Alert, Tree } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import type { TenderResultSummaryProps } from '../types'
import type { TenderSection } from '@shared/analysis-types'
import type { DataNode } from 'antd/es/tree'

function sectionsToTreeData(sections: TenderSection[]): DataNode[] {
  return sections.map((sec) => ({
    key: sec.id,
    title: sec.title,
    children: [],
  }))
}

export function TenderResultSummary({ parsedTender }: TenderResultSummaryProps): React.JSX.Element {
  const { meta, sections, hasScannedContent } = parsedTender
  const treeData = sectionsToTreeData(sections)

  return (
    <div className="flex flex-col gap-4 p-6" data-testid="tender-result-summary">
      {/* File info header */}
      <div className="flex items-center gap-3">
        <FileTextOutlined style={{ fontSize: 24 }} className="text-brand" />
        <div>
          <div className="text-body font-medium">{meta.originalFileName}</div>
          <div className="text-text-tertiary text-caption">
            {meta.format.toUpperCase()} · {meta.pageCount} 页 · 检测到 {sections.length} 个章节
          </div>
        </div>
      </div>

      {/* Scanned content warning */}
      {hasScannedContent && (
        <Alert
          type="warning"
          showIcon
          message="检测到部分页面可能为扫描件，建议使用 OCR 功能提升准确率"
          data-testid="scanned-warning"
        />
      )}

      {/* Section tree */}
      {treeData.length > 0 && (
        <div>
          <div className="text-caption text-text-secondary mb-2 font-medium">文档结构</div>
          <Tree
            treeData={treeData}
            defaultExpandAll
            selectable={false}
            data-testid="section-tree"
          />
        </div>
      )}
    </div>
  )
}
