import { Card, Row, Col, Tag, Empty, Spin, Typography, Button, Tree } from 'antd'
import { FileTextOutlined, BankOutlined } from '@ant-design/icons'
import type { ProposalTemplate, TemplateSummary, TemplateSection } from '@shared/template-types'
import type { DataNode } from 'antd/es/tree'

const { Title, Text, Paragraph } = Typography

interface TemplateSelectorProps {
  templates: TemplateSummary[]
  loading: boolean
  selectedId: string | null
  previewTemplate: ProposalTemplate | null
  previewLoading: boolean
  generating: boolean
  onSelect: (templateId: string) => void
  onGenerate: () => void
}

function sectionsToTreeData(sections: TemplateSection[]): DataNode[] {
  return sections.map((section) => ({
    key: section.id,
    title: section.title,
    children: section.children.length > 0 ? sectionsToTreeData(section.children) : undefined,
  }))
}

export function TemplateSelector({
  templates,
  loading,
  selectedId,
  previewTemplate,
  previewLoading,
  generating,
  onSelect,
  onGenerate,
}: TemplateSelectorProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="template-loading">
        <Spin size="large" />
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center" data-testid="template-empty">
        <Empty description="暂无可用模板" />
      </div>
    )
  }

  const treeData = previewTemplate ? sectionsToTreeData(previewTemplate.sections) : []
  const allKeys = previewTemplate
    ? previewTemplate.sections.flatMap(function collectKeys(s: TemplateSection): string[] {
        return [s.id, ...s.children.flatMap(collectKeys)]
      })
    : []

  return (
    <div className="flex h-full flex-col" data-testid="template-selector">
      <Title level={4} className="mb-4">
        选择方案模板
      </Title>

      <div className="flex min-h-0 flex-1 gap-6">
        {/* Left: template card grid */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Row gutter={[16, 16]}>
            {templates.map((tpl) => (
              <Col key={tpl.id} xs={24} sm={12} lg={8}>
                <Card
                  hoverable
                  className="cursor-pointer transition-all"
                  style={
                    selectedId === tpl.id
                      ? { borderColor: 'var(--color-brand, #1677ff)', borderWidth: 2 }
                      : undefined
                  }
                  onClick={() => onSelect(tpl.id)}
                  data-testid={`template-card-${tpl.id}`}
                >
                  <div className="mb-2 flex items-start gap-2">
                    {tpl.source === 'built-in' ? (
                      <FileTextOutlined className="text-lg text-blue-500" />
                    ) : (
                      <BankOutlined className="text-lg text-green-500" />
                    )}
                    <Text strong className="flex-1">
                      {tpl.name}
                    </Text>
                  </div>
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} className="mb-2 text-sm">
                    {tpl.description}
                  </Paragraph>
                  <div className="flex items-center gap-2">
                    <Tag>{tpl.sectionCount} 个章节</Tag>
                    {tpl.source === 'built-in' ? (
                      <Tag color="blue">内置</Tag>
                    ) : (
                      <Tag color="green">公司</Tag>
                    )}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </div>

        {/* Right: preview panel */}
        <div className="border-border w-72 shrink-0 overflow-y-auto rounded-lg border p-4">
          {!selectedId ? (
            <div className="text-text-tertiary flex h-full items-center justify-center text-center">
              <Text type="secondary">选择模板后可预览章节结构</Text>
            </div>
          ) : previewLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spin />
            </div>
          ) : previewTemplate ? (
            <div>
              <Text strong className="mb-3 block">
                {previewTemplate.name}
              </Text>
              <Tree
                treeData={treeData}
                defaultExpandAll
                expandedKeys={allKeys}
                selectable={false}
                showLine
                data-testid="template-preview-tree"
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom: generate button */}
      <div className="mt-4 flex justify-end">
        <Button
          type="primary"
          size="large"
          disabled={!selectedId}
          loading={generating}
          onClick={onGenerate}
          data-testid="generate-skeleton-btn"
        >
          生成骨架
        </Button>
      </div>
    </div>
  )
}
