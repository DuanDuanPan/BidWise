import { Skeleton, Progress } from 'antd'
import {
  ClockCircleOutlined,
  SearchOutlined,
  EditOutlined,
  ApartmentOutlined,
  FileSearchOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons'
import type { ChapterGenerationPhase } from '@shared/chapter-types'

const PHASE_CONFIG: Record<
  Exclude<ChapterGenerationPhase, 'conflicted' | 'completed' | 'failed'>,
  { icon: React.ReactNode; label: string }
> = {
  queued: { icon: <ClockCircleOutlined />, label: '排队中...' },
  analyzing: { icon: <SearchOutlined />, label: '分析需求上下文...' },
  'generating-text': { icon: <EditOutlined />, label: 'AI 正在撰写正文...' },
  'validating-text': { icon: <CheckSquareOutlined />, label: '检查文字质量...' },
  'generating-diagrams': { icon: <ApartmentOutlined />, label: '生成图表中...' },
  'validating-diagrams': { icon: <CheckSquareOutlined />, label: '验证图表结构...' },
  composing: { icon: <EditOutlined />, label: '整合章节内容...' },
  'validating-coherence': { icon: <FileSearchOutlined />, label: '检查文图一致性...' },
  'annotating-sources': { icon: <FileSearchOutlined />, label: '标注来源...' },
}

interface ChapterGenerationProgressProps {
  phase: ChapterGenerationPhase
  progress: number
  secondaryNote?: string
}

export function ChapterGenerationProgress({
  phase,
  progress,
  secondaryNote,
}: ChapterGenerationProgressProps): React.JSX.Element | null {
  if (phase === 'completed' || phase === 'failed' || phase === 'conflicted') return null

  const config = PHASE_CONFIG[phase]

  return (
    <div
      className="animate-fadeIn rounded-lg border border-dashed p-4"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-global)',
      }}
      data-testid="chapter-generation-progress"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-brand">{config.icon}</span>
        <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>
          {config.label}
        </span>
      </div>
      <Progress
        percent={progress}
        size="small"
        showInfo={false}
        strokeColor="var(--color-brand)"
        data-testid="chapter-generation-progress-bar"
      />
      {secondaryNote && (
        <div
          className="text-caption mt-1"
          style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}
          data-testid="chapter-generation-secondary-note"
        >
          {secondaryNote}
        </div>
      )}
      <div className="mt-3">
        <Skeleton active paragraph={{ rows: 3, width: ['100%', '80%', '60%'] }} title={false} />
      </div>
    </div>
  )
}
