import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { StageGuidePlaceholder } from '@modules/project/components/StageGuidePlaceholder'

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

describe('@story-1-6 StageGuidePlaceholder', () => {
  afterEach(cleanup)

  it('@p1 renders guide for requirements-analysis stage', () => {
    render(<StageGuidePlaceholder stageKey="requirements-analysis" />, { wrapper: Wrapper })
    expect(screen.getByTestId('stage-guide-placeholder')).toHaveAttribute(
      'data-stage',
      'requirements-analysis'
    )
    expect(screen.getByText('需求分析')).toBeInTheDocument()
    expect(
      screen.getByText(/本阶段目标：理解甲方要什么。请上传招标文件和客户沟通素材。/)
    ).toBeInTheDocument()
    expect(screen.getByText('上传招标文件')).toBeInTheDocument()
  })

  it('@p1 renders guide for solution-design stage', () => {
    render(<StageGuidePlaceholder stageKey="solution-design" />, { wrapper: Wrapper })
    expect(screen.getByText('方案设计')).toBeInTheDocument()
    expect(screen.getByText(/确定方案骨架/)).toBeInTheDocument()
    expect(screen.getByText('选择方案模板')).toBeInTheDocument()
  })

  it('@p1 renders guide for proposal-writing stage', () => {
    render(<StageGuidePlaceholder stageKey="proposal-writing" />, { wrapper: Wrapper })
    expect(screen.getByText('方案撰写')).toBeInTheDocument()
    expect(screen.getByText('开始撰写方案')).toBeInTheDocument()
  })

  it('@p1 renders guide for cost-estimation stage', () => {
    render(<StageGuidePlaceholder stageKey="cost-estimation" />, { wrapper: Wrapper })
    expect(screen.getByText('成本评估')).toBeInTheDocument()
    expect(screen.getByText('启动 GAP 分析')).toBeInTheDocument()
  })

  it('@p1 renders guide for compliance-review stage', () => {
    render(<StageGuidePlaceholder stageKey="compliance-review" />, { wrapper: Wrapper })
    expect(screen.getByText('评审打磨')).toBeInTheDocument()
    expect(screen.getByText('启动对抗评审')).toBeInTheDocument()
  })

  it('@p1 renders guide for delivery stage', () => {
    render(<StageGuidePlaceholder stageKey="delivery" />, { wrapper: Wrapper })
    expect(screen.getByText('交付归档')).toBeInTheDocument()
    expect(screen.getByText('检查合规状态')).toBeInTheDocument()
  })

  it('@p1 shows shortcut hint for stages with altKey', () => {
    render(<StageGuidePlaceholder stageKey="solution-design" />, { wrapper: Wrapper })
    expect(screen.getByText(/Alt\+2/)).toBeInTheDocument()
  })

  it('@p1 does not show shortcut hint for stage 1 (no altKey)', () => {
    render(<StageGuidePlaceholder stageKey="requirements-analysis" />, { wrapper: Wrapper })
    expect(screen.queryByText(/Alt\+/)).not.toBeInTheDocument()
  })

  it('@p1 renders CTA button', () => {
    render(<StageGuidePlaceholder stageKey="requirements-analysis" />, { wrapper: Wrapper })
    expect(screen.getByTestId('stage-guide-cta')).toBeInTheDocument()
  })
})
