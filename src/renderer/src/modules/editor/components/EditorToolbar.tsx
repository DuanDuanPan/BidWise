import { Button, Tooltip } from 'antd'
import { DeploymentUnitOutlined } from '@ant-design/icons'
import { WritingStyleSelector } from './WritingStyleSelector'

interface EditorToolbarProps {
  projectId: string
  onInsertDrawio?: () => void
  insertDrawioDisabled?: boolean
}

export function EditorToolbar({
  projectId,
  onInsertDrawio,
  insertDrawioDisabled,
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
      </div>
      <WritingStyleSelector projectId={projectId} />
    </div>
  )
}
