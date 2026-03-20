import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { ConfigProvider, App as AntApp } from 'antd'
import { SopProgressBar } from '@modules/project/components/SopProgressBar'
import type { SopStageStatus, SopStageKey } from '@modules/project/types'

type ActiveStageKey = Exclude<SopStageKey, 'not-started'>

function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ConfigProvider>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

function makeStatuses(
  overrides: Partial<Record<ActiveStageKey, SopStageStatus>> = {}
): Record<ActiveStageKey, SopStageStatus> {
  return {
    'requirements-analysis': 'in-progress',
    'solution-design': 'not-started',
    'proposal-writing': 'not-started',
    'cost-estimation': 'not-started',
    'compliance-review': 'not-started',
    delivery: 'not-started',
    ...overrides,
  }
}

describe('@story-1-6 SopProgressBar', () => {
  afterEach(cleanup)

  it('@p0 renders 6 stage nodes', () => {
    const onStageClick = vi.fn()
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={onStageClick}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByTestId('sop-progress-bar')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-requirements-analysis')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-solution-design')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-proposal-writing')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-cost-estimation')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-compliance-review')).toBeInTheDocument()
    expect(screen.getByTestId('sop-stage-delivery')).toBeInTheDocument()
  })

  it('@p1 shows correct labels for all stages', () => {
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText('需求分析')).toBeInTheDocument()
    expect(screen.getByText('方案设计')).toBeInTheDocument()
    expect(screen.getByText('方案撰写')).toBeInTheDocument()
    expect(screen.getByText('成本评估')).toBeInTheDocument()
    expect(screen.getByText('评审打磨')).toBeInTheDocument()
    expect(screen.getByText('交付归档')).toBeInTheDocument()
  })

  it('@p0 triggers onStageClick when a stage is clicked', () => {
    const onStageClick = vi.fn()
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={onStageClick}
      />,
      { wrapper: Wrapper }
    )
    fireEvent.click(screen.getByTestId('sop-stage-solution-design'))
    expect(onStageClick).toHaveBeenCalledWith('solution-design')
  })

  it('@p0 has navigation role and aria-label', () => {
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const nav = screen.getByRole('navigation', { name: 'SOP 进度条' })
    expect(nav).toBeInTheDocument()
  })

  it('@p0 sets aria-current="step" on current stage', () => {
    render(
      <SopProgressBar
        currentStageKey="proposal-writing"
        stageStatuses={makeStatuses({
          'requirements-analysis': 'completed',
          'solution-design': 'completed',
          'proposal-writing': 'in-progress',
        })}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const currentStage = screen.getByTestId('sop-stage-proposal-writing')
    expect(currentStage).toHaveAttribute('aria-current', 'step')
    const otherStage = screen.getByTestId('sop-stage-requirements-analysis')
    expect(otherStage).not.toHaveAttribute('aria-current')
  })

  it('@p0 applies sop-pulse class to in-progress stage', () => {
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const stageBtn = screen.getByTestId('sop-stage-requirements-analysis')
    const circle = stageBtn.querySelector('.sop-stage-circle')
    expect(circle?.className).toContain('sop-pulse')
  })

  it('@p0 renders connecting lines between stages', () => {
    render(
      <SopProgressBar
        currentStageKey="requirements-analysis"
        stageStatuses={makeStatuses()}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    // 5 connectors between 6 stages
    for (let i = 0; i < 5; i++) {
      expect(screen.getByTestId(`sop-connector-${i}`)).toBeInTheDocument()
    }
  })

  it('@p0 renders status-specific visuals and connector colors', () => {
    render(
      <SopProgressBar
        currentStageKey="proposal-writing"
        stageStatuses={makeStatuses({
          'requirements-analysis': 'completed',
          'solution-design': 'warning',
          'proposal-writing': 'in-progress',
        })}
        onStageClick={vi.fn()}
      />,
      { wrapper: Wrapper }
    )

    const completedCircle = screen
      .getByTestId('sop-stage-requirements-analysis')
      .querySelector('.sop-stage-circle')
    const warningCircle = screen
      .getByTestId('sop-stage-solution-design')
      .querySelector('.sop-stage-circle')
    const idleCircle = screen
      .getByTestId('sop-stage-cost-estimation')
      .querySelector('.sop-stage-circle')

    expect(completedCircle?.getAttribute('style')).toContain('var(--color-sop-done)')
    expect(warningCircle?.getAttribute('style')).toContain('var(--color-sop-warning)')
    expect(idleCircle?.getAttribute('style')).toContain('border: 2px solid var(--color-sop-idle)')
    expect(screen.getByTestId('sop-connector-0').getAttribute('style')).toContain(
      'var(--color-sop-done)'
    )
    expect(screen.getByTestId('sop-connector-1').getAttribute('style')).toContain(
      'var(--color-sop-warning)'
    )
  })
})
