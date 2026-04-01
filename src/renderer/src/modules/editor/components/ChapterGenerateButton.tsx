import { Button, Tooltip } from 'antd'
import { RobotOutlined } from '@ant-design/icons'

interface ChapterGenerateButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function ChapterGenerateButton({
  onClick,
  disabled,
}: ChapterGenerateButtonProps): React.JSX.Element {
  return (
    <Tooltip title="AI 生成章节内容" placement="top">
      <Button
        type="text"
        size="small"
        icon={<RobotOutlined />}
        onClick={onClick}
        disabled={disabled}
        className="text-text-tertiary hover:text-brand"
        aria-label="AI 生成章节内容"
        data-testid="chapter-generate-btn"
      />
    </Tooltip>
  )
}
