import { Button, Tooltip } from 'antd'
import {
  DeploymentUnitOutlined,
  FunctionOutlined,
  RobotOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import { WritingStyleSelector } from './WritingStyleSelector'

interface EditorToolbarProps {
  projectId: string
  onInsertDrawio?: () => void
  insertDrawioDisabled?: boolean
  onInsertMermaid?: () => void
  insertMermaidDisabled?: boolean
  onInsertAiDiagram?: () => void
  insertAiDiagramDisabled?: boolean
  onImportAsset?: () => void
  importAssetDisabled?: boolean
}

export function EditorToolbar({
  projectId,
  onInsertDrawio,
  insertDrawioDisabled,
  onInsertMermaid,
  insertMermaidDisabled,
  onInsertAiDiagram,
  insertAiDiagramDisabled,
  onImportAsset,
  importAssetDisabled,
}: EditorToolbarProps): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-between border-b border-gray-200 px-4 py-1.5"
      data-testid="editor-toolbar"
    >
      <div className="flex items-center gap-1">
        {onInsertDrawio && (
          <Tooltip title="插入架构图">
            <Button
              type="text"
              size="small"
              icon={<DeploymentUnitOutlined />}
              disabled={insertDrawioDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onInsertDrawio}
              data-testid="insert-drawio-btn"
            >
              插入架构图
            </Button>
          </Tooltip>
        )}
        {onInsertMermaid && (
          <Tooltip title="插入 Mermaid 图表">
            <Button
              type="text"
              size="small"
              icon={<FunctionOutlined />}
              disabled={insertMermaidDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onInsertMermaid}
              data-testid="insert-mermaid-btn"
            >
              插入 Mermaid 图表
            </Button>
          </Tooltip>
        )}
        {onInsertAiDiagram && (
          <Tooltip title="AI 图表">
            <Button
              type="text"
              size="small"
              icon={<RobotOutlined />}
              disabled={insertAiDiagramDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onInsertAiDiagram}
              data-testid="insert-ai-diagram-btn"
            >
              AI 图表
            </Button>
          </Tooltip>
        )}
        {onImportAsset && (
          <Tooltip title="将选中片段保存到资产库">
            <Button
              type="text"
              size="small"
              icon={<SaveOutlined />}
              disabled={importAssetDisabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onImportAsset}
              data-testid="import-asset-btn"
            >
              一键入库
            </Button>
          </Tooltip>
        )}
      </div>
      <WritingStyleSelector projectId={projectId} />
    </div>
  )
}
