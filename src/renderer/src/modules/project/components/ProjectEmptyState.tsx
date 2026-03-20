import { Empty, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface ProjectEmptyStateProps {
  onCreate: () => void
}

export function ProjectEmptyState({ onCreate }: ProjectEmptyStateProps): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center" data-testid="project-empty-state">
      <Empty
        description={
          <div className="text-body text-gray-400">
            <p className="mb-1">还没有投标项目</p>
            <p className="text-body-small">点击下方按钮创建你的第一个项目</p>
          </div>
        }
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          新建项目
        </Button>
      </Empty>
    </div>
  )
}
